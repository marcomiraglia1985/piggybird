import * as XLSX from "xlsx";
import { parseRevolutCSV, isRevolut } from "./revolut";
import { parseFineco, isFineco } from "./fineco";
import { parseBNP, isBNP } from "./bnp";
import type { ParserResult } from "./types";
import Papa from "papaparse";

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

export type DetectedFormat =
  | "revolut"
  | "fineco"
  | "bnp"
  | "unknown";

/**
 * Registry user-facing dei parser bancari supportati.
 * Visualizzato nella pagina /import come chip "banche supportate".
 *
 * Per aggiungere una nuova banca:
 *   1. Crea `./<bank>.ts` con detector (`isXxx`) e parser (`parseXxx`)
 *   2. Aggiungi al `parseAny` qui sotto
 *   3. Aggiungi metadata qui in SUPPORTED_BANKS — appare automaticamente in UI
 */
export type SupportedBank = {
  format: DetectedFormat;
  name: string;
  flag: string;
};

export const SUPPORTED_BANKS: SupportedBank[] = [
  { format: "revolut", name: "Revolut", flag: "💳" },
  { format: "fineco", name: "Fineco", flag: "🇮🇹" },
  { format: "bnp", name: "BNP Paribas", flag: "🇫🇷" },
];

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
