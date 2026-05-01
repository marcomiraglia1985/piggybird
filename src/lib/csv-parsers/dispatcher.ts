import * as XLSX from "xlsx";
import { parseRevolutCSV, isRevolut } from "./revolut";
import { parseFineco, isFineco } from "./fineco";
import { parseBNP, isBNP } from "./bnp";
import { parseN26, isN26 } from "./n26";
import type { ParserResult } from "./types";
import Papa from "papaparse";
import { parseUniversalWithFallback } from "@/lib/universal-parser";

// Re-export per backward compat con import esistenti che usavano
// `from "@/lib/csv-parsers/dispatcher"`. Il file `banks.ts` è client-safe;
// importarlo da qui (server) è OK ma il client deve importare direttamente
// `@/lib/csv-parsers/banks` per evitare di tirare dentro Prisma/Anthropic.
export { SUPPORTED_BANKS, type SupportedBank, type DetectedFormat } from "./banks";

/**
 * Converte un xlsx in CSV (primo foglio) per riusare i parser CSV esistenti.
 */
export function xlsxToCsv(buffer: ArrayBuffer): string {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(firstSheet);
}

/**
 * Snapshot di header per debug quando il formato non è riconosciuto.
 */
export function inspectHeaders(content: string, max = 12): string[] {
  const parsed = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
    preview: 3,
  });
  return (parsed.data[0] ?? []).slice(0, max).map((h) => String(h));
}

/**
 * Sceglie il parser giusto in base agli header del CSV.
 */
export function parseAny(content: string): ParserResult {
  // Strip BOM (UTF-8 \uFEFF) all'inizio: Excel/Windows lo aggiunge spesso e
  // contamina il primo header impedendo il match dei formati conosciuti.
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const headers = inspectHeaders(content, 20);

  if (isRevolut(headers)) {
    return parseRevolutCSV(content);
  }

  // N26: header sulla prima riga, formato CSV standard quotato
  if (isN26(headers)) {
    return parseN26(content);
  }

  // Fineco / BNP: header non sulla prima riga, serve guardare le prime ~25
  const allRows = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
    preview: 25,
  }).data as string[][];
  if (isFineco(allRows)) {
    return parseFineco(content);
  }
  if (isBNP(allRows)) {
    return parseBNP(content);
  }

  return {
    format: "unknown",
    rows: [],
    warnings: [
      `Formato non riconosciuto. Header trovati: ${headers.slice(0, 8).join(", ") || "(nessuno)"}`,
    ],
  };
}

/**
 * Variante di parseAny con fallback AI universale: se nessun parser
 * deterministico riconosce il file, prova a inferire il mapping via Claude
 * (con dev key in beta) e applicarlo. Cache su `ParserTemplate` evita
 * chiamate ripetute per lo stesso formato.
 *
 * Usata da `/api/import/parse` come entry point principale.
 */
export async function parseAnyWithFallback(content: string): Promise<ParserResult> {
  const result = parseAny(content);
  if (result.format !== "unknown") return result;
  // Fallback AI — costa ~3 cents per nuovo formato (one-time, poi cache)
  try {
    return await parseUniversalWithFallback(content);
  } catch (e) {
    // Se fallback fallisce (no API key, AI error, ecc.), torniamo result
    // originale "unknown" con messaggio chiaro
    return {
      format: "unknown",
      rows: [],
      warnings: [
        ...result.warnings,
        `Fallback AI fallito: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }
}
