/**
 * Helper amortizzazione mutuo (formula francese — rata costante).
 *
 * Rata mensile P = (C·i) / (1 - (1+i)^-n)
 *   dove
 *     C = capitale (€)
 *     i = tasso mensile = tasso_annuo_pct / 100 / 12
 *     n = numero di rate (mesi)
 *
 * Edge cases:
 *   - rate=0: P = C/n (no interest)
 *   - amount<=0 o months<=0: ritorna 0
 */
export function calcMortgagePayment(
  amount: number,
  ratePct: number,
  months: number,
): number {
  if (amount <= 0 || months <= 0) return 0;
  if (ratePct === 0) return amount / months;
  const i = ratePct / 100 / 12;
  const factor = Math.pow(1 + i, -months);
  return (amount * i) / (1 - factor);
}
