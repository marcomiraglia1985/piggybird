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

/**
 * Regole specifiche BNP per spese Parigi (e dintorni).
 * Match in ordine: vince la prima.
 */
const BNP_RULES: Array<{ pattern: RegExp; emoji: string; isTransfer?: boolean }> = [
  // Electricità Parigi
  { pattern: /\bEDF\b|\bENGIE\b|TOTAL ENERGIES/i, emoji: "💡🇫🇷" },
  // Telefonia Parigi
  { pattern: /\bSFR\b|\bORANGE\b|\bBOUYGUES\b|FREE\s*MOBILE|FREE\s*TELECOM|FREE\s*FRANCE/i, emoji: "☎️🇫🇷" },
  // Affitto Parigi (in ENTRATA — qualcuno ti paga)
  { pattern: /loyer|location|rent\b/i, emoji: "🏠🇫🇷" },
  // Tasse / sindacato condominiale Parigi
  { pattern: /SYND[.\s]|TRESOR\s*PUBLIC|IMPOTS|TAXE FONC/i, emoji: "⚖️🇫🇷" },
  // Banca / assicurazione Parigi
  { pattern: /CARDIF|ASSURANCE|ESPRIT LIBRE|FRAIS BANC|COMMISSION|COTISATION/i, emoji: "🏦🇫🇷" },
  // Alimentari
  { pattern: /CARREFOUR|MONOPRIX|FRANPRIX|G20|CASINO|LIDL|AUCHAN|LECLERC|INTERMARCHE/i, emoji: "🍎" },
  // Trasporti Parigi
  { pattern: /\bSNCF\b|\bRATP\b|\bUBER\b|\bLIME\b|VELIB|NAVIGO/i, emoji: "🚌" },
];

/**
 * Mapping fallback dalla "Sous Categorie operation" di BNP alle nostre categorie.
 */
const BNP_SUBCATEGORY_MAP: Record<string, string> = {
  "Électricité, gaz": "💡🇫🇷",
  Téléphone: "☎️🇫🇷",
  Internet: "☎️🇫🇷",
  Loyer: "🏠🇫🇷",
  "Frais bancaires": "🏦🇫🇷",
  Assurances: "🏦🇫🇷",
  Alimentation: "🍎",
  Restaurant: "🍝",
  "Café, snack, fast-food": "☕",
  Transports: "🚌",
  Carburant: "🛢️",
  "Habillement, chaussures": "👕",
  Santé: "💊",
};

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

    const sub = (r[cSub] ?? "").trim();
    const lib = (r[cLib] ?? "").trim();
    const comm = (r[cComm] ?? "").trim();

    // Description: prima 60 char di Libelle (BNP è verboso)
    const shortDesc = lib.length > 60 ? lib.slice(0, 60).trim() + "…" : lib;

    // Apply rules
    let suggestedCategoryEmoji: string | null = null;
    for (const rule of BNP_RULES) {
      if (rule.pattern.test(lib)) {
        suggestedCategoryEmoji = rule.emoji;
        break;
      }
    }
    if (!suggestedCategoryEmoji && sub && BNP_SUBCATEGORY_MAP[sub]) {
      suggestedCategoryEmoji = BNP_SUBCATEGORY_MAP[sub];
    }

    const dateStr = date.toISOString().slice(0, 10);
    const externalId = [dateStr, amount.toFixed(2), shortDesc.slice(0, 24)].join("|");

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description: shortDesc,
      rawType: sub,
      suggestedAccount: "BNP Paribas",
      suggestedCategoryEmoji,
      currency: "EUR",
      notes: lib + (comm ? ` — ${comm}` : ""),
    });
  }

  return { format: "bnp", rows, warnings };
}
