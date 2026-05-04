/**
 * Sync templates dal registry condiviso → file statico bundled nell'app.
 *
 * Quando: pre-`tauri build`, opzionalmente in CI prima di una release.
 * Output: `src/lib/csv-parsers/learned-templates.json` (committabile o gitignored).
 * Comportamento app: al primo avvio (DB vuoto), `seedLearnedTemplates` legge
 *   questo JSON e lo inserisce in `ParserTemplate`. Risultato: utenti offline
 *   beneficiano subito della cache community.
 *
 * Run: `npx tsx scripts/sync-templates-from-registry.ts`
 *      o `npm run sync-templates`
 */

import fs from "node:fs";
import path from "node:path";

const REGISTRY = process.env.TEMPLATE_REGISTRY_URL ?? "https://piggybird-templates.vercel.app";
const OUTPUT = path.resolve(__dirname, "../src/lib/csv-parsers/learned-templates.json");

type RemoteTemplate = {
  signature: string;
  mapping: string;
  bankName: string | null;
  kind: string;
  createdAt: number;
};

async function main() {
  console.log(`[sync-templates] fetching from ${REGISTRY}…`);
  const res = await fetch(`${REGISTRY}/api/v1/templates?since=0`);
  if (!res.ok) {
    throw new Error(`Registry HTTP ${res.status}`);
  }
  const data = (await res.json()) as { templates: RemoteTemplate[]; syncedAt: number };
  const valid = data.templates.filter((t) => t.signature && t.mapping && (t.kind === "bank" || t.kind === "broker"));
  // Strippa createdAt remoto (non serve nel bundle, e cambia ad ogni sync
  // creando rumore nel diff). Output minimo per ridurre size del .app build.
  const out = valid.map((t) => ({
    signature: t.signature,
    mapping: t.mapping,
    bankName: t.bankName,
    kind: t.kind,
  }));
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`[sync-templates] wrote ${out.length} templates → ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((e) => {
  console.error("[sync-templates] failed:", e);
  process.exit(1);
});
