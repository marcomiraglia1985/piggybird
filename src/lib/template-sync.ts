/**
 * Sync e share dei template `ParserTemplate` con il registry condiviso.
 *
 * Privacy contract:
 *   - Inviato: signature (sha256 hash header), mapping (JSON con indici colonna +
 *     format codes), bankName (string AI-inferred sanitizzata)
 *   - NON inviato: header testuali, righe transazione, importi, beneficiari,
 *     identificativi utente, info account
 *
 * Opt-in: controllato da Setting key "templates.share" (string "true"/"false",
 * default "false"). L'utente attiva da Impostazioni → AI Features.
 */

import { prisma } from "./prisma";
import { TEMPLATE_SETTINGS, type TemplateKind } from "./template-settings-keys";

export { TEMPLATE_SETTINGS };
export type { TemplateKind };

const SHARE_KEY = TEMPLATE_SETTINGS.share;
const LAST_SYNC_KEY = TEMPLATE_SETTINGS.lastSync;
const SEEDED_KEY = TEMPLATE_SETTINGS.seeded;

// Cache per il flag `seeded`: dopo il primo seed (o constatazione che è già
// stato fatto) saltiamo il roundtrip DB su ogni successivo /api/import/parse.
let seededCache: boolean | null = null;

/**
 * URL del registry. Leggibile da env var per permettere staging/produzione
 * separati. Vuoto/assente → share+sync silently skipped (degrado pulito).
 */
function getRegistryUrl(): string | null {
  const url = process.env.TEMPLATE_REGISTRY_URL?.trim();
  if (!url) return null;
  return url.replace(/\/$/, "");
}

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * Default ON: se la Setting non è ancora stata scritta (utente nuovo o
 * non ha mai aperto Impostazioni → AI Features) il share è attivo. Solo
 * un'opt-out esplicita ("false") lo disattiva.
 */
export async function isShareEnabled(): Promise<boolean> {
  const v = await getSetting(SHARE_KEY);
  return v !== "false";
}

/**
 * Fire-and-forget: invia un template appena imparato al registry. Mai throw —
 * un errore di rete non deve mai rompere il flusso di import. Skippa se:
 *   - opt-in non attivo
 *   - registry URL non configurato
 *   - error di rete (logged, ignorato)
 */
/**
 * Wrap fire-and-forget di `shareTemplate` per i call site che non vogliono
 * await: l'import dinamico evita import circolari, l'async IIFE swallowa
 * eventuali errori (già gestiti dentro `shareTemplate`).
 */
export function shareTemplateAsync(input: {
  signature: string;
  mapping: string;
  bankName: string | null;
  kind: TemplateKind;
}): void {
  void shareTemplate(input);
}

export async function shareTemplate(input: {
  signature: string;
  mapping: string;
  bankName: string | null;
  kind: TemplateKind;
}): Promise<void> {
  try {
    const registry = getRegistryUrl();
    if (!registry) return;
    const enabled = await isShareEnabled();
    if (!enabled) return;
    // Best-effort fetch con timeout 5s — se il server è giù, l'utente non aspetta.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      await fetch(`${registry}/api/v1/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signature: input.signature,
          mapping: input.mapping,
          bankName: input.bankName,
          kind: input.kind,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Network/timeout: log e continua. Non rompiamo l'import per questo.
    console.warn("[template-sync] share failed:", e);
  }
}

type RemoteTemplate = {
  signature: string;
  mapping: string;
  bankName: string | null;
  kind: string;
  createdAt: number;
};

type IncomingTemplate = {
  signature?: string;
  mapping?: string;
  bankName?: string | null;
  kind?: string;
};

/**
 * Filter+insert helper condiviso tra `seedLearnedTemplates` e
 * `syncTemplatesFromRegistry`. Scarta template malformati o avvelenati;
 * inserisce con first-write-wins (UNIQUE su signature → catch in caso di race
 * o template già presente). Per-row insert perché Prisma 7 + SQLite non
 * supporta `skipDuplicates`.
 */
async function insertValidTemplates(rows: IncomingTemplate[]): Promise<number> {
  const { isValidTemplateMapping } = await import("./universal-parser");
  const valid = rows.filter((t) => {
    if (!t.signature || !t.mapping) return false;
    if (t.kind !== "bank" && t.kind !== "broker") return false;
    if (t.kind === "bank") {
      try {
        return isValidTemplateMapping(JSON.parse(t.mapping));
      } catch {
        return false;
      }
    }
    return true;
  });
  let inserted = 0;
  for (const t of valid) {
    const ok = await prisma.parserTemplate
      .create({
        data: {
          signature: t.signature!,
          mapping: t.mapping!,
          bankName: t.bankName ?? null,
          kind: t.kind!,
          usageCount: 0,
        },
      })
      .then(() => true)
      .catch(() => false);
    if (ok) inserted++;
  }
  return inserted;
}

/**
 * Pull dei template aggiunti al registry dopo l'ultimo sync. Upsert in
 * `ParserTemplate` locale (NX semantics: non sovrascrive template che
 * l'utente ha già imparato in proprio).
 *
 * Returna il numero di template *nuovi* effettivamente inseriti.
 * Mai throw: degrade silenzioso su errori di rete.
 */
/**
 * @param throttleMs se >0, salta il sync se l'ultimo è avvenuto da meno di
 *   `throttleMs` millisecondi. Utile per non chiamare il registry ad ogni
 *   import (il default 0 = sync sempre).
 */
/**
 * Seed one-shot: legge il bundle `csv-parsers/learned-templates.json` (popolato
 * pre-build da `npm run sync-templates`) e inserisce in DB i template mancanti.
 * Gated da Setting `templates.seeded` — gira una sola volta per installazione.
 *
 * Beneficio: utenti offline o al primo avvio (prima del primo /api/import/parse
 * che fa sync online) hanno già la cache della community, zero AI call.
 */
export async function seedLearnedTemplates(): Promise<number> {
  if (seededCache === true) return 0;
  try {
    const seeded = await getSetting(SEEDED_KEY);
    if (seeded === "true") {
      seededCache = true;
      return 0;
    }
    // Import dinamico — la JSON è server-only, ma evitiamo che un bundle
    // mancante rompa il build. Se il file non c'è o è vuoto, no-op silente.
    const mod = await import("./csv-parsers/learned-templates.json", {
      with: { type: "json" },
    }).catch(() => null);
    const raw: unknown = (mod as { default?: unknown } | null)?.default ?? mod;
    if (!Array.isArray(raw)) {
      await setSetting(SEEDED_KEY, "true");
      seededCache = true;
      return 0;
    }
    const inserted = await insertValidTemplates(raw as IncomingTemplate[]);
    await setSetting(SEEDED_KEY, "true");
    seededCache = true;
    return inserted;
  } catch (e) {
    console.warn("[template-sync] seed failed:", e);
    return 0;
  }
}

export async function syncTemplatesFromRegistry(throttleMs = 0): Promise<number> {
  try {
    const registry = getRegistryUrl();
    if (!registry) return 0;
    const sinceStr = await getSetting(LAST_SYNC_KEY);
    const since = sinceStr ? parseInt(sinceStr, 10) : 0;
    if (throttleMs > 0 && since > 0 && Date.now() - since < throttleMs) {
      return 0;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    let body: { templates: RemoteTemplate[]; syncedAt: number };
    try {
      const res = await fetch(
        `${registry}/api/v1/templates?since=${encodeURIComponent(String(since))}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) return 0;
      body = (await res.json()) as { templates: RemoteTemplate[]; syncedAt: number };
    } finally {
      clearTimeout(timer);
    }

    if (!Array.isArray(body.templates)) return 0;
    // First-write-wins: i template già presenti localmente vincono (UNIQUE su
    // signature → la create fallisce e va in catch dentro `insertValidTemplates`).
    const inserted = await insertValidTemplates(body.templates);
    if (typeof body.syncedAt === "number") {
      await setSetting(LAST_SYNC_KEY, String(body.syncedAt));
    }
    return inserted;
  } catch (e) {
    console.warn("[template-sync] sync failed:", e);
    return 0;
  }
}
