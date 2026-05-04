import Papa from "papaparse";
import type { ParsedRow, ParserResult } from "./types";

/**
 * Parser deterministico per il CSV "Estratto conto deposito" di Revolut
 * Italia/EU. Header univoco: `Tasso di interesse lordo guadagnato` è
 * specifico di questo report e non si confonde con altre banche.
 *
 * Esempio header: `Data,Descrizione,Tasso di interesse lordo guadagnato,Entrate,Uscite,Saldo`
 * Esempio riga: `1 apr 2026,"Interessi netti pagati nel conto ""Conto deposito"" in data 1 apr 2026",2.25%,"3,66€",,"80.177,93€"`
 */

const IT_MONTHS: Record<string, string> = {
  gen: "01", feb: "02", mar: "03", apr: "04",
  mag: "05", giu: "06", lug: "07", ago: "08",
  set: "09", ott: "10", nov: "11", dic: "12",
};

/** "1 apr 2026" → "2026-04-01" (ISO). Null se non matcha. */
function parseItDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})$/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = IT_MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

/** "3,66€" / "1.234,56€" / "" → number positivo. */
function parseEurAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.trim().replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

export function isRevolutSavings(headers: string[]): boolean {
  // Match su 3 header insieme: "Tasso di interesse" è quasi-univoco, ma
  // richiediamo anche Entrate + Uscite per essere certi della struttura.
  const hasInterestRate = headers.some((h) => /tasso di interesse/i.test(h));
  const hasEntrate = headers.some((h) => /^entrate$/i.test(h));
  const hasUscite = headers.some((h) => /^uscite$/i.test(h));
  return hasInterestRate && hasEntrate && hasUscite;
}

export function parseRevolutSavings(content: string): ParserResult {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  if (!isRevolutSavings(headers)) {
    return {
      format: "unknown",
      rows: [],
      warnings: [
        `Header non corrispondono a Revolut Savings: ${headers.slice(0, 6).join(", ")}`,
      ],
    };
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const r of parsed.data) {
    const dateStr = parseItDate(r.Data ?? "");
    if (!dateStr) {
      skipped++;
      continue;
    }
    const description = (r.Descrizione ?? "").trim();
    const entrate = parseEurAmount(r.Entrate ?? "");
    const uscite = parseEurAmount(r.Uscite ?? "");
    if (entrate === 0 && uscite === 0) {
      // Riga di solo saldo informativo / vuota
      skipped++;
      continue;
    }
    const amount = entrate > 0 ? entrate : -uscite;
    const externalId = [dateStr, amount.toFixed(2), description.slice(0, 32)].join("|");

    // Categoria suggerita per i pattern noti del CSV Savings:
    // - "Interessi netti pagati nel conto Conto deposito" → 💰 (Interessi)
    // - "Deposito sul conto Conto deposito" / "Prelievo dal conto" → ↔️ (Transfer)
    let suggestedCategoryEmoji: string | null = null;
    if (/interessi netti|interest paid/i.test(description)) {
      suggestedCategoryEmoji = "💰";
    } else if (/deposito sul conto|prelievo dal conto|transfer/i.test(description)) {
      suggestedCategoryEmoji = "↔️";
    }

    rows.push({
      externalId,
      date: dateStr,
      amount,
      description,
      suggestedAccount: "Revolut Savings",
      suggestedCategoryEmoji,
      currency: "EUR",
    });
  }

  if (skipped > 0) {
    warnings.push(`${skipped} righe saltate (data/importo non parsabili o solo saldo)`);
  }

  return { format: "revolut-savings", rows, warnings };
}
