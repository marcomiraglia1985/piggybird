import { prisma } from "../prisma";

/**
 * Riepilogo mensile basato su movimenti effettivi (data <= oggi e confermati).
 * I movimenti schedulati (confirmed=false) e quelli futuri vengono esclusi.
 */
export async function getMonthSummary(year: number, month: number, isJoint = false) {
  const today = new Date();
  const result = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { year, month, isJoint, date: { lte: today }, confirmed: true },
    _sum: { amount: true },
  });
  const categories = await prisma.category.findMany();
  const catById = new Map(categories.map((c) => [c.id, c]));

  const breakdown = result
    .map((r) => {
      const cat = r.categoryId ? catById.get(r.categoryId) ?? null : null;
      return {
        category: cat,
        amount: r._sum.amount ?? 0,
      };
    })
    .filter((b): b is { category: NonNullable<typeof b.category>; amount: number } =>
      b.category !== null && b.category.type !== "transfer",
    );

  const income = breakdown.filter((b) => b.amount > 0).reduce((s, b) => s + b.amount, 0);
  const expense = breakdown.filter((b) => b.amount < 0).reduce((s, b) => s + b.amount, 0);
  return { breakdown, income, expense, net: income + expense };
}

export async function getTopExpenses(year: number, month: number, limit = 6) {
  const { breakdown } = await getMonthSummary(year, month);
  return breakdown
    .filter((b) => b.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit);
}

/**
 * Movimenti recenti — solo quelli già accaduti e confermati.
 * Esclude movimenti programmati (confirmed=false) e quelli futuri.
 */
export async function getRecentTransactions(limit = 10) {
  const today = new Date();
  return prisma.transaction.findMany({
    where: { date: { lte: today }, confirmed: true },
    take: limit,
    orderBy: { date: "desc" },
    include: { account: true, category: true },
  });
}

export type CategoryPeriodStat = {
  total: number;
  count: number;
  lastDate: string | null;
};
export type CategoryMultiStat = {
  categoryId: string;
  currentYear: CategoryPeriodStat;
  prevYear: CategoryPeriodStat;
  lifetime: CategoryPeriodStat;
};

/**
 * Stats multi-periodo per i widget categoria-based (Coffee tracker, ecc.).
 * Per ogni categoria restituisce totali / counts / ultima data per:
 *   - anno corrente
 *   - anno precedente
 *   - lifetime (tutto lo storico confermato)
 *
 * Una sola query groupBy per anno: 3 query in parallelo, poi merge per
 * categoryId. Categorie con 0 movimenti in tutti i periodi vengono escluse.
 */
export async function getCategoryStatsMulti(currentYear: number) {
  const today = new Date();
  const baseWhere = {
    confirmed: true,
    date: { lte: today },
    transferGroupId: null,
    categoryId: { not: null as null },
  };

  const [groupedCurrent, groupedPrev, groupedLifetime] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...baseWhere, year: currentYear },
      _sum: { amount: true },
      _count: true,
      _max: { date: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { ...baseWhere, year: currentYear - 1 },
      _sum: { amount: true },
      _count: true,
      _max: { date: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: baseWhere,
      _sum: { amount: true },
      _count: true,
      _max: { date: true },
    }),
  ]);

  const empty: CategoryPeriodStat = { total: 0, count: 0, lastDate: null };
  const map = new Map<string, CategoryMultiStat>();

  function ensure(catId: string): CategoryMultiStat {
    let v = map.get(catId);
    if (!v) {
      v = {
        categoryId: catId,
        currentYear: { ...empty },
        prevYear: { ...empty },
        lifetime: { ...empty },
      };
      map.set(catId, v);
    }
    return v;
  }

  for (const g of groupedCurrent) {
    if (!g.categoryId) continue;
    const v = ensure(g.categoryId);
    v.currentYear = {
      total: g._sum.amount ?? 0,
      count: g._count,
      lastDate: g._max.date?.toISOString() ?? null,
    };
  }
  for (const g of groupedPrev) {
    if (!g.categoryId) continue;
    const v = ensure(g.categoryId);
    v.prevYear = {
      total: g._sum.amount ?? 0,
      count: g._count,
      lastDate: g._max.date?.toISOString() ?? null,
    };
  }
  for (const g of groupedLifetime) {
    if (!g.categoryId) continue;
    const v = ensure(g.categoryId);
    v.lifetime = {
      total: g._sum.amount ?? 0,
      count: g._count,
      lastDate: g._max.date?.toISOString() ?? null,
    };
  }

  return Array.from(map.values());
}

/**
 * Tutte le categorie attive (per i picker dei widget).
 */
export async function getAllCategoriesLight() {
  const cats = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      emoji: true,
      name: true,
      type: true,
      group: true,
      estateId: true,
      displayOrder: true,
    },
  });
  return cats;
}

/**
 * Lifetime stats per il widget Anniversary.
 * - firstDate: prima data tracciata — usa il MINIMO tra primo movimento
 *   confermato e primo NetWorthSnapshot (allineato al chart Net Worth, che
 *   parte dal primo snapshot anche se le transazioni sono importate solo
 *   da una data più recente).
 * - startNetWorth: total del primo NW snapshot (null se non esistono)
 * - currentNetWorth: NW attuale (calcolato dal chiamante e passato in)
 * - txCount: numero totale di movimenti non-transfer confermati
 *
 * Niente income/expense da somma transazioni: avrebbero contato anche capex
 * (acquisti investimenti, anticipi immobili), rettifiche 💸 Unknown e
 * cointestato senza ownershipShare → numeri inflazionati. Si usa il delta
 * Net Worth, coerente col chart e robusto.
 */
export async function getLifetimeStats(currentNetWorth: number) {
  const today = new Date();
  const [firstTx, firstSnap, txCount] = await Promise.all([
    prisma.transaction.findFirst({
      where: { confirmed: true, date: { lte: today } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.netWorthSnapshot.findFirst({
      orderBy: { month: "asc" },
      select: { month: true, total: true },
    }),
    prisma.transaction.count({
      where: {
        confirmed: true,
        date: { lte: today },
        transferGroupId: null,
      },
    }),
  ]);
  // Prendi la data più antica tra le due fonti.
  const candidates: Date[] = [];
  if (firstTx) candidates.push(firstTx.date);
  if (firstSnap) candidates.push(firstSnap.month);
  if (candidates.length === 0) return null;
  const firstDate = candidates.reduce((a, b) => (a < b ? a : b));

  return {
    firstDate: firstDate.toISOString(),
    startNetWorth: firstSnap?.total ?? null,
    currentNetWorth,
    txCount,
  };
}
