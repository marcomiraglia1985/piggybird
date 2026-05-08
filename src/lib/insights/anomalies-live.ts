import { prisma } from "../prisma";

/**
 * Detector real-time delle anomalie di spesa per il widget Live Anomalies.
 *
 * Approccio statistico (auto-adattivo, niente soglie hard-coded):
 *  1. Per ogni categoria expense, calcola la spesa giornaliera media degli
 *     ultimi 12 mesi completi (mean) e la deviazione standard (stddev).
 *  2. Calcola la spesa giornaliera del mese in corso (expense / giorni_passati).
 *  3. Z-score = (current_daily - mean_daily) / stddev_daily.
 *  4. Solo z-score positivi (sopra-spesa). Soglia z > 1.5 per "significativo".
 *  5. Severity = z-score × magnitude EUR del mese in corso → ordinamento.
 *
 * Perché 12 mesi e non 6: cattura il ciclo annuale completo (Travel estivo,
 * regali Natale, bonus) → se la categoria è stagionale, la varianza alta
 * naturale alza la stddev e rende l'anomaly detection robusta a quei pattern.
 * 12 punti dati per stddev sono anche statisticamente più solidi di 6.
 *
 * Filtri anti-rumore:
 *  - Categoria deve avere ≥3 mesi di storico non-zero per stddev affidabile.
 *  - Spesa corrente < €30 → ignorata (non degna di alert).
 *  - Categorie investment/transfer → escluse (non sono spese discrezionali).
 *
 * NB: questo detector non parla di "budget" perché l'app non ha il concetto di
 * budget pre-impostato. È puro confronto vs comportamento storico dell'utente.
 */

export type LiveAnomaly = {
  categoryId: string;
  categoryName: string;
  categoryEmoji: string;
  currentMonthEur: number;
  /** Spesa proiettata a fine mese se il ritmo continua. */
  projectedMonthEur: number;
  /** Media mensile sui 12 mesi precedenti completi. */
  avgMonthlyEur: number;
  /** Z-score della spesa giornaliera corrente vs storico. */
  zScore: number;
  /** Delta % vs media mensile (proiezione). */
  pctVsAvg: number;
  /** Top contributor: la singola tx più grande del mese in questa categoria. */
  topContributor: {
    date: string;
    beneficiary: string;
    amountEur: number;
  } | null;
};

const Z_THRESHOLD = 1.5;
const MIN_EUR_THRESHOLD = 30;
const MIN_HISTORY_MONTHS = 3;

export async function detectLiveAnomalies(now: Date = new Date()): Promise<LiveAnomaly[]> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const dayOfMonth = now.getUTCDate(); // 1-indexed
  const daysInCurrentMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Storico: ultimi 12 mesi COMPLETI (escluso il mese corrente). Finestra
  // annuale per coprire stagionalità (Travel estivo, regali Natale, bonus).
  const historyMonths: Array<{ year: number; month: number; days: number }> = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    historyMonths.push({
      year: y,
      month: m + 1, // 1-indexed per Prisma
      days: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    });
  }
  const oldestHistoryStart = new Date(
    Date.UTC(historyMonths[historyMonths.length - 1].year, historyMonths[historyMonths.length - 1].month - 1, 1),
  );
  const currentMonthStart = new Date(Date.UTC(year, month, 1));
  const currentMonthEndExcl = new Date(Date.UTC(year, month, dayOfMonth + 1)); // tx fino a oggi inclusa

  // Categorie expense: query unica, raggruppata per categoria + month
  // Filtri:
  //  - amount < 0 (uscite)
  //  - confirmed=true
  //  - transferGroupId IS NULL (no transfer interni)
  //  - category type=expense (esclude income e investment)
  const expenseCategories = await prisma.category.findMany({
    where: { type: "expense", active: true },
    select: { id: true, name: true, emoji: true },
  });
  if (expenseCategories.length === 0) return [];
  const categoryIdSet = new Set(expenseCategories.map((c) => c.id));
  const categoryMeta = new Map(
    expenseCategories.map((c) => [c.id, { name: c.name, emoji: c.emoji }]),
  );

  // Tutte le tx expense dal più vecchio mese di storia fino a oggi
  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      transferGroupId: null,
      categoryId: { in: [...categoryIdSet] },
      amount: { lt: 0 },
      date: { gte: oldestHistoryStart, lt: currentMonthEndExcl },
    },
    select: {
      amount: true,
      date: true,
      beneficiary: true,
      categoryId: true,
      ownershipShare: true,
      account: { select: { ownershipShare: true } },
    },
  });

  // Aggrega per (categoryId, year-month)
  type Bucket = { sumEur: number; count: number; topTx: { date: Date; beneficiary: string; amount: number } | null };
  const byCatMonth = new Map<string, Bucket>();
  function key(catId: string, y: number, m: number) {
    return `${catId}|${y}-${String(m).padStart(2, "0")}`;
  }

  for (const t of txs) {
    if (!t.categoryId) continue;
    const share = t.ownershipShare ?? t.account.ownershipShare;
    const eff = Math.abs(t.amount * share);
    const y = t.date.getUTCFullYear();
    const m = t.date.getUTCMonth() + 1;
    const k = key(t.categoryId, y, m);
    const b = byCatMonth.get(k) ?? { sumEur: 0, count: 0, topTx: null };
    b.sumEur += eff;
    b.count += 1;
    const txEur = eff;
    if (!b.topTx || txEur > b.topTx.amount) {
      b.topTx = { date: t.date, beneficiary: t.beneficiary ?? "(senza beneficiary)", amount: txEur };
    }
    byCatMonth.set(k, b);
  }

  const results: LiveAnomaly[] = [];

  for (const cat of expenseCategories) {
    const currentBucket = byCatMonth.get(key(cat.id, year, month + 1));
    const currentSum = currentBucket?.sumEur ?? 0;
    if (currentSum < MIN_EUR_THRESHOLD) continue;

    // Daily rates per mese storico
    const historyDailyRates: number[] = [];
    for (const h of historyMonths) {
      const b = byCatMonth.get(key(cat.id, h.year, h.month));
      const sum = b?.sumEur ?? 0;
      historyDailyRates.push(sum / h.days);
    }
    // Filtra: serve almeno N mesi non-zero per stddev meaningful
    const nonZero = historyDailyRates.filter((r) => r > 0);
    if (nonZero.length < MIN_HISTORY_MONTHS) continue;

    const meanDaily =
      historyDailyRates.reduce((s, r) => s + r, 0) / historyDailyRates.length;
    const variance =
      historyDailyRates.reduce((s, r) => s + (r - meanDaily) ** 2, 0) /
      historyDailyRates.length;
    const stdDevDaily = Math.sqrt(variance);
    if (stdDevDaily < 0.01) continue; // categoria troppo costante per anomaly detection

    const currentDaily = currentSum / dayOfMonth;
    const zScore = (currentDaily - meanDaily) / stdDevDaily;
    if (zScore < Z_THRESHOLD) continue;

    const projectedSum = currentDaily * daysInCurrentMonth;
    const avgMonthly = meanDaily * daysInCurrentMonth;
    const pctVsAvg = avgMonthly > 0 ? ((projectedSum - avgMonthly) / avgMonthly) * 100 : 0;

    const meta = categoryMeta.get(cat.id)!;
    results.push({
      categoryId: cat.id,
      categoryName: meta.name,
      categoryEmoji: meta.emoji,
      currentMonthEur: Math.round(currentSum),
      projectedMonthEur: Math.round(projectedSum),
      avgMonthlyEur: Math.round(avgMonthly),
      zScore: +zScore.toFixed(2),
      pctVsAvg: Math.round(pctVsAvg),
      topContributor: currentBucket?.topTx
        ? {
            date: currentBucket.topTx.date.toISOString().slice(0, 10),
            beneficiary: currentBucket.topTx.beneficiary,
            amountEur: Math.round(currentBucket.topTx.amount),
          }
        : null,
    });
  }

  // Severity = zScore × magnitude → sort desc, top 3
  results.sort(
    (a, b) => b.zScore * b.currentMonthEur - a.zScore * a.currentMonthEur,
  );
  return results.slice(0, 3);
}
