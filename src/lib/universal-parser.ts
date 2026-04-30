import { createHash } from "node:crypto";
import Papa from "papaparse";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import type { ParsedRow, ParserResult } from "./csv-parsers/types";
import { AI_MODELS, computeCallCostEur } from "./ai-pricing";

/**
 * Universal CSV/XLSX parser via AI fallback.
 *
 * Flusso:
 *   1. Compute signature dei primi N header (sha256, normalizzati)
 *   2. Lookup ParserTemplate cache → se hit, applica mapping deterministico
 *   3. Se miss → invia prime 30 righe a Claude (con BETA_AI_FALLBACK_KEY,
 *      mai esposta al client) per inferire il mapping
 *   4. Salva mapping in cache → riutilizzato dalle prossime call con stessa
 *      signature (zero AI calls per formato già visto)
 *
 * Costi: 1 chiamata Claude per nuovo formato (~3-5 cents). Subsidiato dalla
 * dev key durante la beta. Mai usata per altre feature AI dell'app.
 */

export type TemplateMapping = {
  bankName?: string | null;
  /** Numero di righe da skippare prima dell'header (es. Fineco ha 12 righe di metadata) */
  skipRows: number;
  /** Indice (0-based) della riga header */
  headerRowIndex: number;
  /** Index colonna data */
  dateCol: number;
  /** Format data: "iso" | "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "excel-serial" */
  dateFormat: string;
  /** Index colonna amount signed (se mode = "signed") */
  amountCol?: number;
  /** Index colonna entrate (se mode = "split") */
  entrateCol?: number;
  /** Index colonna uscite (se mode = "split") */
  usciteCol?: number;
  /** "signed" = unica colonna con segno; "split" = entrate+uscite separate */
  amountMode: "signed" | "split";
  /** Separatore decimale: "," (IT/EU) o "." (US/UK) */
  decimalSep: "," | ".";
  /** Index colonna descrizione (beneficiary) */
  descriptionCol: number;
  /** Index colonna descrizione lunga (notes) — opzionale */
  longDescriptionCol?: number;
  /** Default currency (per row dove la colonna valuta manca) */
  defaultCurrency: string;
  /** Delimiter CSV: "," | ";" | "\t" */
  delimiter: string;
};

/**
 * Hash dei primi N header normalizzati. Stable signature: stessa banca →
 * stesso CSV header → stesso hash → cache hit.
 *
 * Normalizzazione: lowercase + trim + sort. Sortare ignora ordine colonne
 * (alcune banche cambiano ordine tra mesi).
 */
export function computeSignature(headers: string[]): string {
  const normalized = headers
    .filter((h) => h && h.trim())
    .map((h) => h.trim().toLowerCase())
    .sort()
    .join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

/**
 * Estrae la prima riga di header probabile. Cerca tra le prime 25 righe
 * quella con più cell non-vuote (di solito è l'header, dopo eventuali
 * pre-amboli di metadata).
 */
function findHeaderRow(rows: string[][]): { headerRowIndex: number; headers: string[] } {
  let bestIdx = 0;
  let bestCount = 0;
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const nonEmpty = (rows[i] ?? []).filter((c) => c && c.trim()).length;
    if (nonEmpty > bestCount) {
      bestCount = nonEmpty;
      bestIdx = i;
    }
  }
  return { headerRowIndex: bestIdx, headers: rows[bestIdx] ?? [] };
}

/** Parse robusto importo: gestisce "1.234,56" / "1234.56" / "1,234.56" */
function parseAmount(value: string, decimalSep: "," | "."): number {
  if (!value) return 0;
  const trimmed = value.trim().replace(/[€$£¥\s]/g, "");
  if (!trimmed) return 0;
  let clean = trimmed;
  if (decimalSep === ",") {
    // Formato EU: rimuovi punti (migliaia), virgola → punto
    clean = trimmed.replace(/\./g, "").replace(",", ".");
  } else {
    // Formato US: rimuovi virgole (migliaia)
    clean = trimmed.replace(/,/g, "");
  }
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

/** Parse data in vari format. Ritorna ISO yyyy-mm-dd o null se invalida. */
function parseDate(value: string, format: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (format === "excel-serial") {
    const num = Number(trimmed);
    if (Number.isFinite(num) && num > 30000 && num < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + num * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }

  // yyyy-mm-dd or ISO datetime
  if (format === "iso" || format === "yyyy-mm-dd") {
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  // dd/mm/yyyy or dd.mm.yyyy or dd-mm-yyyy
  if (format === "dd/mm/yyyy") {
    const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // mm/dd/yyyy (US)
  if (format === "mm/dd/yyyy") {
    const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const month = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Last resort: native Date parsing
  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) return native.toISOString().slice(0, 10);

  return null;
}

/**
 * Applica un template mapping al CSV completo. Ritorna ParsedRow[]
 * deterministicamente — niente AI per riga.
 */
export function applyTemplate(content: string, mapping: TemplateMapping): ParserResult {
  const parsed = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
    delimiter: mapping.delimiter,
  });
  const rawRows = parsed.data as string[][];
  const startRow = mapping.headerRowIndex + 1; // skip header
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let skippedInvalid = 0;

  for (let i = startRow; i < rawRows.length; i++) {
    const r = rawRows[i] ?? [];
    if (r.every((v) => !v || v === "")) continue;

    const dateStr = parseDate(r[mapping.dateCol] ?? "", mapping.dateFormat);
    if (!dateStr) {
      skippedInvalid++;
      continue;
    }

    let amount = 0;
    if (mapping.amountMode === "signed" && mapping.amountCol != null) {
      amount = parseAmount(r[mapping.amountCol] ?? "", mapping.decimalSep);
    } else if (mapping.amountMode === "split") {
      const entrata = parseAmount(r[mapping.entrateCol ?? -1] ?? "", mapping.decimalSep);
      const uscita = parseAmount(r[mapping.usciteCol ?? -1] ?? "", mapping.decimalSep);
      amount = entrata !== 0 ? Math.abs(entrata) : -Math.abs(uscita);
    }
    if (amount === 0) continue;

    const description = (r[mapping.descriptionCol] ?? "").trim();
    const longDesc =
      mapping.longDescriptionCol != null
        ? (r[mapping.longDescriptionCol] ?? "").trim()
        : "";

    const externalId = [dateStr, amount.toFixed(2), description.slice(0, 24)].join("|");

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description: description || longDesc.slice(0, 60),
      rawType: undefined,
      currency: mapping.defaultCurrency,
      notes: longDesc && longDesc !== description ? longDesc : null,
    });
  }

  if (skippedInvalid > 0) {
    warnings.push(`${skippedInvalid} righe con data invalida ignorate`);
  }

  return {
    format: mapping.bankName ? `ai:${mapping.bankName.toLowerCase()}` : "ai:unknown",
    rows,
    warnings,
  };
}

/**
 * Chiama Claude (con BETA_AI_FALLBACK_KEY, server-only) per inferire un
 * TemplateMapping dalle prime 30 righe di un CSV non riconosciuto.
 */
/**
 * Risolve la API key per il fallback. Priorità:
 *   1. `BETA_AI_FALLBACK_KEY` env var (production .app build, baked-in)
 *   2. Fallback dev: decrypt user key salvata in DB (Impostazioni → AI Features)
 *
 * Per il bundle distribuito agli amici, `BETA_AI_FALLBACK_KEY` DEVE essere
 * settata al build time — gli amici non hanno ancora una user key in DB
 * al primo upload.
 */
async function resolveFallbackApiKey(): Promise<string | null> {
  const fromEnv = process.env.BETA_AI_FALLBACK_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  // Dev fallback: usa la user key dal DB
  try {
    const cred = await prisma.apiCredential.findUnique({
      where: { provider: "anthropic" },
    });
    if (!cred) return null;
    return decrypt({
      ciphertext: cred.apiKey,
      iv: cred.iv,
      authTag: cred.authTag,
    });
  } catch {
    return null;
  }
}

async function inferTemplateWithAI(
  sampleRows: string[][],
  rawSample: string,
): Promise<{ mapping: TemplateMapping; costEur: number }> {
  const apiKey = await resolveFallbackApiKey();
  if (!apiKey) {
    throw new Error(
      "Nessuna API key disponibile per universal parser fallback. Configura BETA_AI_FALLBACK_KEY in .env oppure salva la tua chiave Anthropic da Impostazioni → AI Features.",
    );
  }

  const client = new Anthropic({ apiKey });
  const sampleText = sampleRows
    .slice(0, 30)
    .map((r, i) => `${i}: ${JSON.stringify(r)}`)
    .join("\n");

  const system = `Sei un esperto di parsing CSV bancari. Analizzi le prime righe di un export bancario (CSV/XLSX convertito) e ritorni il mapping per estrarre le transazioni.

Ritorna SOLO un JSON valido (no prosa, no markdown fence) con questo schema:
{
  "bankName": "string nome banca riconosciuto (es. N26, ING, Deutsche Bank) o null se generico",
  "skipRows": numero_intero_righe_pre_header,
  "headerRowIndex": indice_0based_della_riga_con_intestazioni,
  "dateCol": indice_0based_colonna_data,
  "dateFormat": "iso" | "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "excel-serial",
  "amountMode": "signed" | "split",
  "amountCol": indice_se_signed (omit se split),
  "entrateCol": indice_se_split (omit se signed),
  "usciteCol": indice_se_split (omit se signed),
  "decimalSep": "," | ".",
  "descriptionCol": indice_colonna_short_description_o_beneficiary,
  "longDescriptionCol": indice_colonna_long_description (omit se non c'è),
  "defaultCurrency": "EUR" | "USD" | ...,
  "delimiter": "," | ";" | "\\t"
}

Regole:
- Se la stessa colonna ha sia entrate (positivi) che uscite (negativi) → amountMode="signed"
- Se entrate e uscite sono in colonne separate → amountMode="split"
- Pre-amboli (es. "Conto:", "Periodo:", "Saldi:") → calcola skipRows correttamente
- Se incerto sul date format, preferisci "dd/mm/yyyy" (banche EU)`;

  const userMsg = `Prime 30 righe del CSV (formato: "indice: [array_celle]"):

${sampleText}

Ritorna solo il JSON mapping.`;

  const startMs = Date.now();
  const resp = await client.messages.create({
    model: AI_MODELS.sonnet,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const elapsedMs = Date.now() - startMs;

  const text = resp.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join("");

  // Strip eventuale markdown fence
  let cleanText = text.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  let mapping: TemplateMapping;
  try {
    mapping = JSON.parse(cleanText) as TemplateMapping;
  } catch (e) {
    throw new Error(
      `AI ha ritornato JSON invalido: ${cleanText.slice(0, 200)}... (${e})`,
    );
  }

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;
  const costEur = computeCallCostEur("sonnet", inputTokens, outputTokens);

  // Telemetry: AIUsage con feature dedicata. Nota: questa NON usa la API
  // dell'utente, è la dev key — l'usage track serve solo a Marco per
  // monitorare il budget della beta.
  await prisma.aIUsage
    .create({
      data: {
        feature: "universal-parser-fallback",
        model: AI_MODELS.sonnet,
        inputTokens,
        outputTokens,
        costEur,
        status: "ok",
      },
    })
    .catch(() => null);

  console.log(
    `[universal-parser] AI inferred template for "${mapping.bankName ?? "unknown"}" in ${elapsedMs}ms (${inputTokens}+${outputTokens} tokens, €${costEur.toFixed(4)})`,
  );
  void rawSample; // unused but kept for potential future caching of sample
  return { mapping, costEur };
}

/**
 * Entry point del fallback. Chiamato dal dispatcher quando i parser
 * deterministici non riconoscono il formato.
 *
 * Flusso:
 *   1. Compute signature
 *   2. Lookup cache `ParserTemplate`
 *   3. Se hit → applica mapping (no AI)
 *   4. Se miss → infer via AI → save cache → applica
 */
export async function parseUniversalWithFallback(
  content: string,
): Promise<ParserResult> {
  // Auto-detect delimiter (preview comma vs semicolon)
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  let delimiter = ",";
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ";";
  else if (tabCount > commaCount) delimiter = "\t";

  const parsed = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
    delimiter,
    preview: 30,
  });
  const sampleRows = (parsed.data as string[][]).filter((r) => r.length > 0);

  if (sampleRows.length === 0) {
    return {
      format: "unknown",
      rows: [],
      warnings: ["File vuoto o non parsable"],
    };
  }

  const { headers } = findHeaderRow(sampleRows);
  if (headers.length === 0) {
    return {
      format: "unknown",
      rows: [],
      warnings: ["Nessun header riconoscibile nelle prime 25 righe"],
    };
  }

  const signature = computeSignature(headers);

  // Cache lookup
  const cached = await prisma.parserTemplate.findUnique({ where: { signature } });
  if (cached) {
    const mapping = JSON.parse(cached.mapping) as TemplateMapping;
    // Bump usage counter (non-blocking)
    prisma.parserTemplate
      .update({
        where: { signature },
        data: { usageCount: { increment: 1 } },
      })
      .catch(() => null);
    const result = applyTemplate(content, mapping);
    result.warnings.unshift(
      `Riconosciuto come ${cached.bankName ?? "formato salvato"} (cache, no AI call)`,
    );
    return result;
  }

  // AI inference
  const sampleRaw = sampleRows
    .slice(0, 30)
    .map((r) => r.join(delimiter))
    .join("\n");

  const { mapping, costEur } = await inferTemplateWithAI(sampleRows, sampleRaw);

  // Save to cache (signature dedupe)
  await prisma.parserTemplate
    .create({
      data: {
        signature,
        bankName: mapping.bankName ?? null,
        mapping: JSON.stringify(mapping),
        sampleHeaders: headers.slice(0, 20).join(" | "),
        usageCount: 1,
        aiCostEur: costEur,
      },
    })
    .catch(() => null); // race: another request may have inserted same signature

  const result = applyTemplate(content, mapping);
  result.warnings.unshift(
    `Nuovo formato riconosciuto via AI: ${mapping.bankName ?? "generico"}. Aggiunto alle banche supportate.`,
  );
  return result;
}
