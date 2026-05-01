import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "./types";

/**
 * Parser N26 (export CSV ufficiale, "Trasferisci movimenti / Download").
 *
 * Layout:
 *   Riga 0: header con quote ("Booking Date","Value Date","Partner Name",
 *           "Partner Iban",Type,"Payment Reference","Account Name",
 *           "Amount (EUR)","Original Amount","Original Currency","Exchange Rate")
 *   Riga 1+: dati. Date ISO YYYY-MM-DD, importi numerici (segno = direzione,
 *           positivo = entrata, negativo = uscita), decimale ".".
 *
 * N26 supporta multi-account/spazi: il campo "Account Name" cambia tra le
 * righe quando l'utente ha più conti/spazi. Ogni Account Name distinto
 * diventa un account suggerito separato in app (es. "N26 — Conto principale",
 * "N26 — Spazio Vacanze").
 *
 * Original Amount + Original Currency + Exchange Rate sono popolati solo per
 * transazioni FX. Storiamo solo l'importo in EUR già convertito.
 */

const N26_REQUIRED_HEADERS = [
  "Booking Date",
  "Partner Name",
  "Type",
  "Payment Reference",
  "Account Name",
  "Amount (EUR)",
];

export function isN26(headers: string[]): boolean {
  const matches = N26_REQUIRED_HEADERS.filter((h) => headers.includes(h)).length;
  return matches >= 5;
}

function parseDateISO(v: string): Date | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(
    Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)),
  );
}

function parseAmount(v: string): number {
  if (!v) return 0;
  const n = parseFloat(v.trim());
  return Number.isFinite(n) ? n : 0;
}

export function parseN26(content: string): ParserResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  if (!isN26(headers)) {
    return { format: "unknown", rows: [], warnings: [] };
  }

  const warnings: string[] = [];
  const rows: ParsedRow[] = [];

  for (const r of parsed.data) {
    const date =
      parseDateISO(r["Booking Date"] ?? "") ??
      parseDateISO(r["Value Date"] ?? "");
    if (!date) continue;

    const amount = parseAmount(r["Amount (EUR)"] ?? "");
    if (amount === 0) continue;

    const partnerName = (r["Partner Name"] ?? "").trim();
    const type = (r["Type"] ?? "").trim();
    const paymentRef = (r["Payment Reference"] ?? "").trim();
    const accountName = (r["Account Name"] ?? "").trim();

    // Convention: short desc → beneficiary, long causale → notes.
    // Partner Name (es. nome merchant) come beneficiary. Se vuoto fallback al Type.
    const beneficiary = partnerName || type || "(N26)";
    const notes = paymentRef;

    // Multi-account: ogni "Account Name" distinto diventa un account separato
    // in app. Prefisso "N26 — " per chiarezza visuale.
    const suggestedAccount = accountName ? `N26 — ${accountName}` : "N26";

    const dateStr = date.toISOString().slice(0, 10);
    const externalId = [
      dateStr,
      amount.toFixed(2),
      beneficiary.slice(0, 24),
    ].join("|");

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description: beneficiary,
      rawType: type,
      suggestedAccount,
      suggestedCategoryEmoji: null,
      currency: "EUR",
      notes,
    });
  }

  return { format: "n26", rows, warnings };
}
