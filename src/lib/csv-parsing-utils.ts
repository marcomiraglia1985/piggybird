/**
 * Helpers di parsing CSV condivisi tra `universal-parser.ts` (banche) e
 * `universal-broker-parser.ts` (broker). I parser deterministici in
 * `csv-parsers/` hanno proprie implementazioni — qui sta solo ciò che è
 * realmente identico tra i due fallback universali.
 */

/** Parse robusto importo: gestisce "1.234,56" / "1234.56" / "1,234.56". */
export function parseAmount(value: string, decimalSep: "," | "."): number {
  if (!value) return 0;
  const trimmed = value.trim().replace(/[€$£¥\s]/g, "");
  if (!trimmed) return 0;
  const clean =
    decimalSep === ","
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(/,/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Estrae la riga di header probabile cercando tra le prime 25 quella con più
 * cell non-vuote (di solito è l'header, dopo eventuali pre-amboli di metadata).
 */
export function findHeaderRow(rows: string[][]): {
  headerRowIndex: number;
  headers: string[];
} {
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
