import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "./types";

/**
 * Parser BNP Paribas (export xlsx home banking, "Compte de chèques").
 *
 * Layout:
 *   Riga 0: header conto + saldo
 *   Riga 1: vuota
 *   Riga 2: header colonne FR
 *           Date operation | Categorie operation | Sous Categorie operation
 *           | Libelle operation | Montant operation | Pointage operation
 *           | Commentaire operation
 *   Riga 3+: dati (date DD-MM-YYYY, importi numerici, decimale ".")
 *
 * BNP categorizza già le tx nella colonna "Sous Categorie operation".
 * Quella categoria viene passata downstream tramite `rawType` → l'auto-
 * categorize AI la userà come segnale forte. Il parser NON applica regole
 * di matching su nomi merchant (es. CARREFOUR → 🍎): quella sarebbe
 * opinione personale e violerebbe la regola "universal app".
 */

const HEADERS = [
  "Date operation",
  "Categorie operation",
  "Sous Categorie operation",
  "Libelle operation",
  "Montant operation",
];

export function isBNP(rawRows: string[][]): boolean {
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const row = rawRows[i] ?? [];
    const matches = HEADERS.filter((h) => row.includes(h)).length;
    if (matches >= 4) return true;
  }
  return false;
}

function parseDateBNP(v: string): Date | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}

function parseAmount(v: string): number {
  if (!v) return 0;
  const s = v.trim();
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let clean = s;
  if (hasComma && hasDot) clean = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma && !hasDot) clean = s.replace(",", ".");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

export function parseBNP(content: string): ParserResult {
  const parsedRaw = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: false,
  });
  const rawRows = parsedRaw.data as string[][];

  if (!isBNP(rawRows)) {
    return { format: "unknown", rows: [], warnings: [] };
  }

  let headerIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    if ((rawRows[i] ?? []).includes("Date operation")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { format: "unknown", rows: [], warnings: ["Header BNP non trovato"] };
  }

  const header = rawRows[headerIdx];
  const idx = (name: string) => header.indexOf(name);
  const cDate = idx("Date operation");
  const cCat = idx("Categorie operation");
  const cSub = idx("Sous Categorie operation");
  const cLib = idx("Libelle operation");
  const cAmt = idx("Montant operation");
  const cComm = idx("Commentaire operation");

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i] ?? [];
    if (r.every((v) => !v || v === "")) continue;

    const date = parseDateBNP(r[cDate] ?? "");
    if (!date) continue;

    const amount = parseAmount(r[cAmt] ?? "");
    if (amount === 0) continue;

    const cat = (r[cCat] ?? "").trim();
    const sub = (r[cSub] ?? "").trim();
    const lib = (r[cLib] ?? "").trim();
    const comm = (r[cComm] ?? "").trim();

    // Description short (truncate libelle verboso a 60 char)
    const shortDesc = lib.length > 60 ? lib.slice(0, 60).trim() + "…" : lib;

    // Categoria BNP-fornita: passata in rawType così auto-categorize AI la
    // vede come signal forte (es. "Alimentation > Restaurants" → AI sa che è
    // ristorante senza ambiguità). Format: "Categorie > Sous Categorie".
    const bankCategory = [cat, sub].filter(Boolean).join(" > ");

    const dateStr = date.toISOString().slice(0, 10);
    const externalId = [dateStr, amount.toFixed(2), shortDesc.slice(0, 24)].join("|");

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description: shortDesc,
      rawType: bankCategory || undefined,
      suggestedAccount: "BNP Paribas",
      suggestedCategoryEmoji: null,
      currency: "EUR",
      notes: lib + (comm ? ` — ${comm}` : ""),
    });
  }

  return { format: "bnp", rows, warnings };
}
