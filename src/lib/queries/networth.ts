import { prisma } from "../prisma";

/**
 * Net worth corrente: ogni saldo è moltiplicato per `ownershipShare`
 * (es. cointestato 2/3) per riflettere la quota effettivamente posseduta.
 */
export async function getCurrentNetWorth() {
  const accounts = await prisma.account.findMany({ where: { active: true } });
  const effective = (a: { currentBalance: number; ownershipShare: number }) =>
    a.currentBalance * a.ownershipShare;

  const liquidNonFs = accounts
    .filter((a) => a.type === "liquid" || a.type === "cash" || a.type === "joint")
    .reduce((s, a) => s + effective(a), 0);

  // Friendsplit: net debit/credit (sum di tutte le tx). Coerente con
  // /friendsplit page. Si somma alla liquidità come receivable/payable.
  const fsAccounts = accounts.filter((a) => a.type === "friendsplit");
  let friendsplitNet = 0;
  if (fsAccounts.length > 0) {
    const sums = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: fsAccounts.map((a) => a.id) } },
      _sum: { amount: true },
    });
    friendsplitNet = sums.reduce((s, x) => s + (x._sum.amount ?? 0), 0);
  }

  const liquidity = liquidNonFs + friendsplitNet;
  const savings = accounts.filter((a) => a.type === "savings").reduce((s, a) => s + effective(a), 0);
  const investments = await prisma.investment.findMany();
  const investTotal = investments.reduce((s, i) => s + i.currentValue, 0);
  const total = liquidity + savings + investTotal;
  return { total, liquidity, savings, investments: investTotal };
}

export async function getAccountsBreakdown() {
  return prisma.account.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getNetWorthHistory() {
  const snapshots = await prisma.netWorthSnapshot.findMany({
    orderBy: { month: "asc" },
  });
  const historical = snapshots.map((s) => ({
    month: s.month.toISOString(),
    total: s.total,
    isFuture: false as const,
  }));

  // Proietta il cashflow futuro fino a fine anno corrente partendo dal
  // net worth attuale. I punti futuri saranno tratteggiati nel chart.
  const today = new Date();
  const current = await getCurrentNetWorth();

  // Tutte le tx che NON sono ancora riflesse in currentBalance:
  //   - date > fine di oggi (future-dated, anche se confirmed)
  //   - confirmed=false (programmata, anche se data passata)
  // Escluso transfer interni (si annullano fra loro).
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const futureTxs = await prisma.transaction.findMany({
    where: {
      OR: [{ date: { gt: endOfToday } }, { confirmed: false }],
      transferGroupId: null,
    },
    include: { account: { select: { ownershipShare: true } } },
  });

  // Aggrega per mese (chiave "YYYY-MM" in UTC per evitare shift timezone)
  const monthlyDelta = new Map<string, number>();
  for (const tx of futureTxs) {
    const k = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const share = tx.ownershipShare ?? tx.account.ownershipShare;
    const effective = tx.amount * share;
    monthlyDelta.set(k, (monthlyDelta.get(k) ?? 0) + effective);
  }

  // Helper per generare il primo del mese in UTC
  const monthIsoUtc = (year: number, month: number) =>
    new Date(Date.UTC(year, month, 1)).toISOString();
  const monthKey = (year: number, month: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}`;

  // Punto di ancoraggio: net worth corrente al mese in corso.
  const curY = today.getFullYear();
  const curM = today.getMonth();
  const currentMonthIso = monthIsoUtc(curY, curM);
  const lastSnapshot = historical[historical.length - 1];
  if (lastSnapshot && lastSnapshot.month === currentMonthIso) {
    historical[historical.length - 1] = {
      month: currentMonthIso,
      total: current.total,
      isFuture: false,
    };
  } else {
    historical.push({
      month: currentMonthIso,
      total: current.total,
      isFuture: false,
    });
  }

  // Proiezione: ogni punto futuro è il "saldo a inizio mese" = saldo attuale
  // + delta cumulativo dei mesi precedenti. Va da maggio (1°) a gennaio
  // anno successivo (1°), che rappresenta "fine dicembre".
  const projected: typeof historical = [];
  let running = current.total;
  for (let m = curM + 1; m <= 12; m++) {
    running += monthlyDelta.get(monthKey(curY, m - 1)) ?? 0;
    const pointY = m === 12 ? curY + 1 : curY;
    const pointM = m === 12 ? 0 : m;
    projected.push({ month: monthIsoUtc(pointY, pointM), total: running, isFuture: true });
  }

  return [...historical, ...projected];
}
