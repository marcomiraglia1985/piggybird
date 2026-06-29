import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "./types";

/**
 * Fineco xlsx (esportato dall'home banking) — formato:
 *   Riga 0..11: preambolo (Conto, Periodo, Saldi, Note)
 *   Riga 12:   header → Data_Operazione, Data_Valuta, Entrate, Uscite,
 *              Descrizione, Descrizione_Completa, Stato
 *   Riga 13+:  dati (date come Excel serial, entrate/uscite separate)
 *
 * L'xlsx viene convertito in CSV dal dispatcher (xlsx→sheet_to_csv).
 * Le date in CSV diventano stringhe numeriche (Excel serial) o "dd/mm/yyyy"
 * a seconda della versione di sheetjs — gestiamo entrambi i casi.
 */

const FINECO_HEADERS = [
  "Data_Operazione",
  "Data_Valuta",
  "Entrate",
  "Uscite",
  "Descrizione",
  "Descrizione_Completa",
  "Stato",
];

/**
 * Il CSV Fineco non fornisce una colonna categoria — solo Descrizione e
 * Descrizione_Completa. Il parser non applica regole di matching su
 * pattern testuali (es. "stipendio" → 💼, "cash park" → transfer):
 * sarebbe opinione personale e violerebbe la regola "universal app".
 *
 * Le descrizioni vengono passate downstream e l'auto-categorize AI le
 * userà insieme ai pattern personali dell'utente per categorizzare.
 */

export function isFineco(rawRows: string[][]): boolean {
  // Cerca una riga che matcha gli header Fineco entro le prime 25 righe
  for (let i = 0; i < Math.min(25, rawRows.length); i++) {
    const row = rawRows[i] ?? [];
    const matches = FINECO_HEADERS.filter((h) => row.includes(h)).length;
    if (matches >= 4) return true;
  }
  return false;
}

function parseExcelOrDate(v: string): Date | null {
  if (!v) return null;
  const trimmed = v.trim();
  // Excel serial number?
  const num = Number(trimmed);
  if (Number.isFinite(num) && num > 30000 && num < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + num * 86400000);
  }
  // dd/mm/yyyy ?
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month - 1, day));
  }
  // yyyy-mm-dd
  const iso = new Date(trimmed);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function parseAmount(v: string): number {
  if (!v) return 0;
  const trimmed = v.trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let clean = trimmed;

  if (hasComma && hasDot) {
    // Formato IT con migliaia: "1.234,56" → "1234.56"
    clean = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Solo virgola = decimale italiano: "1234,56"
    clean = trimmed.replace(",", ".");
  }
  // Solo punto: già decimale stile US ("1234.56") — non modificare

  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

export function parseFineco(content: string): ParserResult {
  const parsedRaw = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  });
  const rawRows = parsedRaw.data as string[][];

  if (!isFineco(rawRows)) {
    return { format: "unknown", rows: [], warnings: [] };
  }

  // Trova la riga header
  let headerIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    if ((rawRows[i] ?? []).includes("Data_Operazione")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { format: "unknown", rows: [], warnings: ["Header Fineco non trovato"] };
  }

  const header = rawRows[headerIdx];
  const colIdx = (name: string) => header.indexOf(name);
  const cData = colIdx("Data_Operazione");
  const cIn = colIdx("Entrate");
  const cOut = colIdx("Uscite");
  const cDesc = colIdx("Descrizione");
  const cDescFull = colIdx("Descrizione_Completa");
  const cState = colIdx("Stato");
  const cSaldo = colIdx("Saldo"); // -1 se Fineco non lo esporta in questo report

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  let skippedNotBooked = 0;

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i] ?? [];
    if (r.every((v) => !v || v === "")) continue;

    const date = parseExcelOrDate(r[cData] ?? "");
    if (!date) continue;

    const entrata = parseAmount(r[cIn] ?? "");
    const uscita = parseAmount(r[cOut] ?? "");
    const amount = entrata !== 0 ? entrata : uscita;
    if (amount === 0) continue;

    const state = (r[cState] ?? "").trim();
    if (state && !/contabilizzato/i.test(state)) {
      skippedNotBooked++;
      continue;
    }

    const desc = (r[cDesc] ?? "").trim();
    const descFull = (r[cDescFull] ?? "").trim();
    const description = desc || descFull.slice(0, 80);

    const dateStr = date.toISOString().slice(0, 10);
    const externalId = [dateStr, amount.toFixed(2), description.slice(0, 24)].join("|");

    const saldoRaw = cSaldo >= 0 ? (r[cSaldo] ?? "").trim() : "";
    const saldoNum = saldoRaw ? parseAmount(saldoRaw) : 0;
    const bankBalance = saldoRaw && saldoNum !== 0 ? saldoNum : null;

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description,
      rawType: desc,
      suggestedAccount: "Fineco",
      suggestedCategoryEmoji: null,
      bankBalance,
      rawLine: JSON.stringify(r),
      currency: "EUR",
      notes: descFull && descFull !== desc ? descFull : null,
    });
  }

  if (skippedNotBooked > 0) {
    warnings.push(`${skippedNotBooked} righe non contabilizzate ignorate`);
  }

  return { format: "fineco", rows, warnings };
}
