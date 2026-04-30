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

/**
 * Stats per il widget Category Tracker.
 * Per ogni categoria: totale anno corrente, conteggio movimenti, ultima data.
 * Restituisce solo categorie con almeno una transazione confermata nell'anno.
 */
export async function getCategoryYearStats(year: number) {
  const today = new Date();
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      year,
      confirmed: true,
      date: { lte: today },
      transferGroupId: null,
      categoryId: { not: null },
    },
    _sum: { amount: true },
    _count: true,
    _max: { date: true },
  });

  return grouped.map((g) => ({
    categoryId: g.categoryId as string,
    total: g._sum.amount ?? 0,
    count: g._count,
    lastDate: g._max.date?.toISOString() ?? null,
  }));
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
 * - firstDate: data della prima transazione confermata (inizio tracking)
 * - income / expense: somma lifetime di entrate/uscite (esclusi transfer interni)
 * - txCount: numero totale di movimenti non-transfer
 */
export async function getLifetimeStats() {
  const today = new Date();
  const firstTx = await prisma.transaction.findFirst({
    where: { confirmed: true, date: { lte: today } },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  if (!firstTx) return null;

  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      date: { lte: today },
      transferGroupId: null,
    },
    select: { amount: true },
  });

  let income = 0;
  let expense = 0;
  for (const tx of txs) {
    if (tx.amount > 0) income += tx.amount;
    else expense += tx.amount;
  }

  return {
    firstDate: firstTx.date.toISOString(),
    income,
    expense, // negativo
    txCount: txs.length,
  };
}
