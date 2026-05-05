/**
 * IRR (Internal Rate of Return) via Newton-Raphson.
 * Ritorna il tasso annuo composto che azzera la NPV dei cashflow.
 *
 * Convezione cashflow: negativo = soldi USCITI dall'investitore (BUY/TopUp),
 * positivo = soldi RIENTRATI (SELL/Withdraw/valore finale).
 *
 * NPV(rate) = Σ amount_i / (1 + rate)^t_i, dove t_i = anni dal primo flusso.
 */

export type IrrCashflow = {
  date: string; // ISO
  amount: number;
};

const YEAR_MS = 365.25 * 86_400_000;

export function computeIRR(
  cashflows: IrrCashflow[],
  guess = 0.1,
): number | null {
  if (cashflows.length < 2) return null;
  const sorted = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const years = sorted.map(
    (cf) => (new Date(cf.date).getTime() - t0) / YEAR_MS,
  );
  const amounts = sorted.map((cf) => cf.amount);

  // Sanity check: deve esserci sia almeno un negativo che un positivo
  const hasIn = amounts.some((a) => a < 0);
  const hasOut = amounts.some((a) => a > 0);
  if (!hasIn || !hasOut) return null;

  let rate = guess;
  let lastNpv = Infinity;
  for (let iter = 0; iter < 100; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (let i = 0; i < amounts.length; i++) {
      const t = years[i];
      const factor = Math.pow(1 + rate, t);
      npv += amounts[i] / factor;
      if (t > 0) dnpv -= (t * amounts[i]) / (factor * (1 + rate));
    }
    lastNpv = npv;
    if (Math.abs(dnpv) < 1e-12) break;
    const newRate = rate - npv / dnpv;
    if (!isFinite(newRate)) return null;
    if (Math.abs(newRate - rate) < 1e-7) return newRate;
    // Clamp per evitare divergenza in iterazioni intermedie
    rate = Math.max(-0.99, Math.min(10, newRate));
  }
  // Sanity check: dopo 100 iter senza convergenza, se NPV è ancora lontano da 0
  // o rate è ai bordi del clamp, l'IRR non è affidabile (es. portfolio con
  // troppo pochi flussi o senza cambio di segno) — meglio null.
  if (Math.abs(lastNpv) > 1 || rate <= -0.98 || rate >= 9.99) return null;
  return rate;
}
