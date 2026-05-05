import { prisma } from "../prisma";
import { getDisplayBalances } from "../account-freeze";
import { fetchMacroContext, type MacroContext } from "./macro";

/**
 * Detector deterministico per "Piggybird Finance" — l'editoriale mensile AI.
 *
 * Calcola signal macro (savings rate, allocation, YTD growth, milestone,
 * top/worst performer) e li passa a Sonnet che scrive un articolo
 * editoriale semi-serio in stile giornalistico.
 *
 * Filosofia: TUTTI i numeri sono pre-calcolati lato app. Claude sceglie
 * l'angolo narrativo e formula la prosa, mai inventa cifre.
 */

const MONTH_NAMES_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

const MILESTONE_THRESHOLDS = [
  25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000,
  500_000, 750_000, 1_000_000, 1_500_000, 2_000_000,
];

export type Opportunity =
  | { type: "cash_drag"; severity: number; data: { fromAccount: string; amount: number; estYearlyLoss: number; targetAccount: string | null; targetRate: number; rateIsEstimated: boolean } }
  | { type: "trading_cash_idle"; severity: number; data: { platform: string; currency: string; amount: number } }
  | { type: "concentration"; severity: number; data: { ticker: string; percent: number; portfolioValue: number } }
  | { type: "subscription_audit"; severity: number; data: { count: number; monthlyTotal: number; yearlyTotal: number } }
  | { type: "categorization_gap"; severity: number; data: { count: number } }
  | { type: "dormant_account"; severity: number; data: { accountName: string; daysSinceLastActivity: number } };

export type IssueInput = {
  // === Mese e contesto ===
  monthLabel: string; // "Aprile 2026"
  monthIsClosed: boolean; // true se mese passato (dati completi)
  todayIso: string;

  // === Net worth ===
  monthDelta: { eur: number; pct: number; current: number; previous: number };
  ytd: { eur: number; pct: number; current: number; startOfYear: number };
  streak: { months: number; direction: "up" | "down" | "flat" };
  last6Months: number[]; // sparkline data
  milestoneCrossed: { threshold: number; previousValue: number; currentValue: number } | null;

  // === Cashflow del mese target ===
  monthIncome: number;
  monthExpense: number; // positivo (magnitudine)
  savingsRate: number; // 0-1 = (income - expense) / income
  savingsRateVsAvg6m: number; // delta in punti percentuali vs media 6m precedenti

  // === Drivers AGGREGATI per categoria ===
  topIncomeCategories: Array<{ label: string; amount: number; count: number }>;
  topExpenseCategories: Array<{ label: string; amount: number; count: number }>;

  // === Allocation ===
  allocation: {
    liquidity: number; // EUR
    savings: number;
    investments: number;
    realEstate: number;
    total: number;
    pctLiquidity: number;
    pctSavings: number;
    pctInvestments: number;
    pctRealEstate: number;
  };

  // === Investments performance ===
  bestStockPosition: { ticker: string; gainPct: number; gainEur: number; valueEur: number } | null;
  worstStockPosition: { ticker: string; gainPct: number; gainEur: number; valueEur: number } | null;
  cryptoTotalGain: { gainEur: number; gainPct: number } | null;

  // === Anomalies categoria spesa ===
  anomalies: Array<{ category: string; thisMonth: number; avg6m: number; pctChange: number }>;

  // === Conti remunerati (APY > 0) ===
  interestBearingAccounts: Array<{ name: string; type: string; balanceEur: number; apyPct: number }>;

  // === Opportunities (ranked) ===
  opportunities: Opportunity[];

  // === Mutui aggregati (escluso interest residuo, focus su capitale + rata) ===
  mortgages: {
    totalResidualPrincipalEur: number;
    monthlyPaymentEur: number;
    avgRatePct: number | null;
    monthsRemaining: number | null;
  } | null;

  // === Cash runway: mesi di spesa coperti dalla liquidità (FIRE-style) ===
  cashRunwayMonths: number | null;

  // === FX exposure: % degli investimenti in valuta non-EUR ===
  fxExposure: { pctNonEur: number; nonEurAmountEur: number; totalInvestEur: number } | null;

  // === Macro context (subset rilevante alla composizione del portafoglio) ===
  macro: MacroContext;

  // === Lens del mese: angolo dominante a rotazione (cambia ogni mese) ===
  lens: {
    id: string; // es. "cashflow", "investments", "trajectory"
    label: string; // descrizione human-readable
    directive: string; // istruzione esplicita a Claude
  };

  // === Memoria: ultimi 2-3 numeri pubblicati per evitare ripetizioni ===
  lastIssues: Array<{ monthLabel: string; headline: string; lead: string }>;
};

export async function buildIssueInput(): Promise<IssueInput | null> {
  const now = new Date();
  // Mese da analizzare: se < giorno 15 prendiamo il mese chiuso precedente
  // (più dati, narrativa più ricca). Da metà mese in poi corrente.
  const useCurrentMonth = now.getDate() >= 15;
  const targetYear = useCurrentMonth
    ? now.getFullYear()
    : now.getMonth() === 0
      ? now.getFullYear() - 1
      : now.getFullYear();
  const targetMonth = useCurrentMonth
    ? now.getMonth()
    : now.getMonth() === 0
      ? 11
      : now.getMonth() - 1;
  const monthLabel = `${MONTH_NAMES_IT[targetMonth]} ${targetYear}`;
  const monthIsClosed = !useCurrentMonth;

  // === Net worth snapshots ===
  const snapshots = await prisma.netWorthSnapshot.findMany({
    orderBy: { month: "desc" },
    take: 18, // serve fino al gennaio dell'anno corrente per YTD
  });
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].reverse();
  const current = sorted[sorted.length - 1].total;
  const previous = sorted[sorted.length - 2].total;
  const eur = current - previous;
  const pct = previous !== 0 ? eur / previous : 0;

  // YTD: snapshot più vecchio dell'anno target ancora presente
  const yearStart = sorted.find(
    (s) => s.month.getFullYear() === targetYear && s.month.getMonth() === 0,
  );
  const ytdStart = yearStart?.total ?? sorted[0].total;
  const ytdEur = current - ytdStart;
  const ytdPct = ytdStart !== 0 ? ytdEur / ytdStart : 0;

  // Streak
  let streakMonths = 0;
  let direction: "up" | "down" | "flat" = "flat";
  if (Math.abs(eur) >= 0.01) {
    direction = eur > 0 ? "up" : "down";
    for (let i = sorted.length - 1; i >= 1; i--) {
      const d = sorted[i].total - sorted[i - 1].total;
      if (direction === "up" && d > 0) streakMonths++;
      else if (direction === "down" && d < 0) streakMonths++;
      else break;
    }
  }
  const last6 = sorted.slice(-6).map((s) => s.total);

  // Milestone: la più alta soglia attraversata fra previous e current
  let milestoneCrossed: IssueInput["milestoneCrossed"] = null;
  for (const t of MILESTONE_THRESHOLDS) {
    if (previous < t && current >= t) {
      milestoneCrossed = {
        threshold: t,
        previousValue: previous,
        currentValue: current,
      };
    }
  }

  // === Cashflow del mese target ===
  const monthStart = new Date(targetYear, targetMonth, 1);
  const monthEnd = new Date(targetYear, targetMonth + 1, 1);
  const tx = await prisma.transaction.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
      confirmed: true,
      transferGroupId: null,
    },
    include: { category: { select: { name: true } } },
  });
  const monthIncome = tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthExpense = tx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const savingsRate = monthIncome > 0 ? (monthIncome - monthExpense) / monthIncome : 0;

  // Savings rate medio 6 mesi precedenti
  const sixBack = new Date(targetYear, targetMonth - 6, 1);
  const txSix = await prisma.transaction.findMany({
    where: {
      date: { gte: sixBack, lt: monthStart },
      confirmed: true,
      transferGroupId: null,
    },
  });
  const monthAggSix = new Map<string, { income: number; expense: number }>();
  for (const t of txSix) {
    const k = `${t.date.getFullYear()}-${t.date.getMonth()}`;
    const e = monthAggSix.get(k) ?? { income: 0, expense: 0 };
    if (t.amount > 0) e.income += t.amount;
    else e.expense += Math.abs(t.amount);
    monthAggSix.set(k, e);
  }
  const sixSavingsRates = [...monthAggSix.values()]
    .filter((m) => m.income > 0)
    .map((m) => (m.income - m.expense) / m.income);
  const avgSavingsRate6m =
    sixSavingsRates.length > 0
      ? sixSavingsRates.reduce((s, v) => s + v, 0) / sixSavingsRates.length
      : 0;
  const savingsRateVsAvg6m = (savingsRate - avgSavingsRate6m) * 100;

  // === Drivers AGGREGATI per categoria ===
  function aggregate(side: "pos" | "neg") {
    const map = new Map<string, { sum: number; count: number }>();
    for (const t of tx) {
      if (side === "pos" && t.amount <= 0) continue;
      if (side === "neg" && t.amount >= 0) continue;
      const label = t.category?.name || t.beneficiary || (side === "pos" ? "Entrata" : "Spesa");
      const e = map.get(label) ?? { sum: 0, count: 0 };
      e.sum += t.amount;
      e.count++;
      map.set(label, e);
    }
    return [...map.entries()]
      .sort((a, b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))
      .slice(0, 3)
      .map(([label, v]) => ({ label, amount: Math.abs(v.sum), count: v.count }));
  }
  const topIncomeCategories = aggregate("pos");
  const topExpenseCategories = aggregate("neg");

  // === Allocation ===
  const accountsRaw = await prisma.account.findMany({
    where: { active: true, closedAt: null },
  });
  // Usa displayBalance così l'allocation riflette le tx confermate dopo
  // l'ultimo freeze (Live mode), come /conti e /risparmi.
  const accounts = await getDisplayBalances(accountsRaw);
  const liquidity = accounts
    .filter((a) => a.type === "liquid" || a.type === "cash" || a.type === "joint")
    .reduce((s, a) => s + a.displayBalance * a.ownershipShare, 0);
  const savings = accounts
    .filter((a) => a.type === "savings")
    .reduce((s, a) => s + a.displayBalance * a.ownershipShare, 0);
  const investments = (await prisma.investment.findMany()).reduce((s, i) => s + i.currentValue, 0);
  const realEstate = (
    await prisma.realEstate.findMany({
      where: { active: true, holding: "owned" },
      select: { currentValue: true, purchasePrice: true, ownershipShare: true },
    })
  ).reduce((s, r) => s + (r.currentValue ?? r.purchasePrice ?? 0) * r.ownershipShare, 0);
  const totalAlloc = liquidity + savings + investments + realEstate;
  const allocation = {
    liquidity,
    savings,
    investments,
    realEstate,
    total: totalAlloc,
    pctLiquidity: totalAlloc > 0 ? (liquidity / totalAlloc) * 100 : 0,
    pctSavings: totalAlloc > 0 ? (savings / totalAlloc) * 100 : 0,
    pctInvestments: totalAlloc > 0 ? (investments / totalAlloc) * 100 : 0,
    pctRealEstate: totalAlloc > 0 ? (realEstate / totalAlloc) * 100 : 0,
  };

  const interestBearingAccounts = accounts
    .filter((a) => (a.interestRateAnnual ?? 0) > 0)
    .map((a) => ({
      name: a.name,
      type: a.type,
      balanceEur: a.displayBalance * a.ownershipShare,
      apyPct: a.interestRateAnnual ?? 0,
    }))
    .sort((a, b) => b.apyPct - a.apyPct);

  // === Best/worst stock positions (lifetime gain) ===
  const stocks = await prisma.stockPosition.findMany();
  const stockPerf = stocks
    .filter((p) => p.avgCost && p.avgCost > 0)
    .map((p) => {
      const valueEur = p.shares * p.currentPrice * p.fxToEur;
      const costEur = p.shares * (p.avgCost ?? 0) * p.fxToEur;
      const gainEur = valueEur - costEur;
      const gainPct = costEur > 0 ? (gainEur / costEur) * 100 : 0;
      return { ticker: p.ticker, gainPct, gainEur, valueEur };
    });
  stockPerf.sort((a, b) => b.gainPct - a.gainPct);
  const bestStockPosition = stockPerf[0] ?? null;
  const worstStockPosition = stockPerf.length > 1 ? stockPerf[stockPerf.length - 1] : null;

  // Crypto aggregate gain (Investment.costEur vs currentValue per crypto)
  const cryptoInvestments = await prisma.investment.findMany({ where: { type: "crypto" } });
  let cryptoCostTotal = 0;
  let cryptoValueTotal = 0;
  for (const inv of cryptoInvestments) {
    if (inv.costEur != null && inv.costEur > 0) {
      cryptoCostTotal += inv.costEur;
      cryptoValueTotal += inv.currentValue;
    }
  }
  const cryptoTotalGain =
    cryptoCostTotal > 0
      ? {
          gainEur: cryptoValueTotal - cryptoCostTotal,
          gainPct: ((cryptoValueTotal - cryptoCostTotal) / cryptoCostTotal) * 100,
        }
      : null;

  // === Anomalies (categoria mese > 1.5× media 6m) ===
  const txHistorical = await prisma.transaction.findMany({
    where: {
      date: { gte: sixBack, lt: monthStart },
      confirmed: true,
      transferGroupId: null,
      amount: { lt: 0 },
    },
    include: { category: { select: { name: true } } },
  });
  const histByCatMonth = new Map<string, Map<string, number>>();
  for (const t of txHistorical) {
    const cat = t.category?.name ?? "Altro";
    const ym = `${t.date.getFullYear()}-${t.date.getMonth()}`;
    if (!histByCatMonth.has(cat)) histByCatMonth.set(cat, new Map());
    const map = histByCatMonth.get(cat)!;
    map.set(ym, (map.get(ym) ?? 0) + Math.abs(t.amount));
  }
  const thisMonthByCat = new Map<string, number>();
  for (const t of tx.filter((x) => x.amount < 0)) {
    const cat = t.category?.name ?? "Altro";
    thisMonthByCat.set(cat, (thisMonthByCat.get(cat) ?? 0) + Math.abs(t.amount));
  }
  const anomalies: IssueInput["anomalies"] = [];
  // Threshold scala col patrimonio: per portfolio grandi non interessano
  // anomalie da €50.
  const minAnomalyAbs = Math.max(100, totalAlloc * 0.0005);
  for (const [cat, thisVal] of thisMonthByCat) {
    if (thisVal < minAnomalyAbs) continue;
    const histMap = histByCatMonth.get(cat);
    if (!histMap || histMap.size < 3) continue;
    const histVals = [...histMap.values()];
    const avg6m = histVals.reduce((s, v) => s + v, 0) / histVals.length;
    if (avg6m < minAnomalyAbs * 0.5) continue;
    const ratio = thisVal / avg6m;
    if (ratio >= 1.5) {
      anomalies.push({
        category: cat,
        thisMonth: thisVal,
        avg6m,
        pctChange: (ratio - 1) * 100,
      });
    }
  }
  anomalies.sort((a, b) => b.pctChange - a.pctChange);

  // === Opportunities (riusiamo la logica dal detector originale) ===
  const opportunities: Opportunity[] = [];
  const savingsAccount = accounts.find(
    (a) => a.type === "savings" && a.displayBalance > 0,
  );
  const targetRate = savingsAccount?.interestRateAnnual ?? 2.0;
  const rateIsEstimated = !savingsAccount?.interestRateAnnual;
  for (const acc of accounts) {
    if (acc.type !== "liquid") continue;
    if (acc.displayBalance < 5000) continue;
    if ((acc.interestRateAnnual ?? 0) >= 1) continue;
    const estYearlyLoss = (acc.displayBalance * targetRate) / 100;
    opportunities.push({
      type: "cash_drag",
      severity: Math.min(10, Math.floor(estYearlyLoss / 50)),
      data: {
        fromAccount: acc.name,
        amount: acc.displayBalance,
        estYearlyLoss,
        targetAccount: savingsAccount?.name ?? null,
        targetRate,
        rateIsEstimated,
      },
    });
  }
  const tradingCash = await prisma.tradingCash.findMany();
  for (const tc of tradingCash) {
    const eurAmount = tc.amount * tc.fxToEur;
    if (eurAmount < 100) continue;
    opportunities.push({
      type: "trading_cash_idle",
      severity: Math.min(10, Math.floor(eurAmount / 200)),
      data: { platform: tc.platform, currency: tc.currency, amount: eurAmount },
    });
  }
  if (stocks.length > 0) {
    const stocksTotal = stocks.reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
    if (stocksTotal > 0) {
      for (const p of stocks) {
        const value = p.shares * p.currentPrice * p.fxToEur;
        const pctp = (value / stocksTotal) * 100;
        if (pctp >= 25) {
          opportunities.push({
            type: "concentration",
            severity: Math.min(10, Math.floor(pctp / 5)),
            data: { ticker: p.ticker, percent: pctp, portfolioValue: stocksTotal },
          });
        }
      }
    }
  }
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const recurring = await prisma.transaction.findMany({
    where: {
      date: { gte: ninetyDaysAgo },
      recurrenceGroupId: { not: null },
      amount: { lt: 0 },
      confirmed: true,
    },
  });
  const groups = new Map<string, { sum: number; count: number }>();
  for (const t of recurring) {
    const k = t.recurrenceGroupId!;
    const e = groups.get(k) ?? { sum: 0, count: 0 };
    e.sum += Math.abs(t.amount);
    e.count++;
    groups.set(k, e);
  }
  const trulyRecurring = [...groups.values()].filter((g) => g.count >= 2);
  if (trulyRecurring.length >= 3) {
    const monthlyTotal = trulyRecurring.reduce(
      (s, g) => s + g.sum / Math.max(g.count, 1),
      0,
    );
    opportunities.push({
      type: "subscription_audit",
      severity: Math.min(10, Math.floor(monthlyTotal / 20)),
      data: {
        count: trulyRecurring.length,
        monthlyTotal,
        yearlyTotal: monthlyTotal * 12,
      },
    });
  }
  const uncategorized = await prisma.transaction.count({
    where: {
      categoryId: null,
      transferGroupId: null,
      confirmed: true,
      date: { lt: now },
    },
  });
  if (uncategorized >= 5) {
    opportunities.push({
      type: "categorization_gap",
      severity: Math.min(10, Math.floor(uncategorized / 5)),
      data: { count: uncategorized },
    });
  }
  opportunities.sort((a, b) => b.severity - a.severity);

  // === Mutui ===
  const ownedEstates = await prisma.realEstate.findMany({
    where: { active: true, holding: "owned" },
  });
  const mortgagesAgg = aggregateMortgages(ownedEstates);

  // === Cash runway: liquidità totale / spesa media mensile 6m ===
  const liquidTotal = liquidity + savings;
  const expensesSix = [...monthAggSix.values()].map((m) => m.expense).filter((e) => e > 0);
  const avg6mExpense =
    expensesSix.length > 0
      ? expensesSix.reduce((s, v) => s + v, 0) / expensesSix.length
      : 0;
  const cashRunwayMonths =
    avg6mExpense > 0 ? Math.round((liquidTotal / avg6mExpense) * 10) / 10 : null;

  // === FX exposure ===
  const stocksNonEur = stocks
    .filter((p) => (p.currency ?? "EUR").toUpperCase() !== "EUR")
    .reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
  const cryptoEurValue = (await prisma.investment.findMany()).reduce(
    (s, i) => s + i.currentValue,
    0,
  );
  // Crypto è sempre denominato in valuta non-EUR (USD/USDT) → conteggia tutto
  const nonEurAmount = stocksNonEur + cryptoEurValue;
  const totalInvestEur = investments;
  const fxExposure =
    totalInvestEur > 0
      ? {
          pctNonEur: (nonEurAmount / totalInvestEur) * 100,
          nonEurAmountEur: nonEurAmount,
          totalInvestEur,
        }
      : null;

  // === Macro context (solo i signal rilevanti al portafoglio) ===
  const wantsFx = nonEurAmount > 1000; // soglia minima per parlare di FX
  const wantsStocks = stocks.length > 0;
  const wantsCrypto = cryptoEurValue > 100;
  const macro = await fetchMacroContext({ wantsFx, wantsStocks, wantsCrypto }).catch(
    () => ({
      ecbDepositRatePct: null,
      eurozoneInflationYoyPct: null,
      eurUsdSpot: null,
      eurUsd1mChangePct: null,
      sp500_1mChangePct: null,
      btc_1mChangePct: null,
    }),
  );

  // === Lens rotation: 6 angoli a rotazione mensile deterministica ===
  const lens = computeLens(targetYear, targetMonth);

  // === Memory: ultimi 2 numeri pubblicati ===
  const lastIssues = await loadLastIssues(targetYear, targetMonth);

  return {
    monthLabel,
    monthIsClosed,
    todayIso: now.toISOString(),
    monthDelta: { eur, pct, current, previous },
    ytd: { eur: ytdEur, pct: ytdPct, current, startOfYear: ytdStart },
    streak: { months: streakMonths, direction },
    last6Months: last6,
    milestoneCrossed,
    monthIncome,
    monthExpense,
    savingsRate,
    savingsRateVsAvg6m,
    topIncomeCategories,
    topExpenseCategories,
    allocation,
    bestStockPosition,
    worstStockPosition,
    cryptoTotalGain,
    anomalies: anomalies.slice(0, 3),
    interestBearingAccounts,
    opportunities: opportunities.slice(0, 5),
    mortgages: mortgagesAgg,
    cashRunwayMonths,
    fxExposure,
    macro,
    lens,
    lastIssues,
  };
}

// ============================================================================
// Helpers
// ============================================================================

type EstateForMortgage = {
  mortgageAmount: number | null;
  mortgageRate: number | null;
  mortgageDurationMonths: number | null;
  mortgageStartDate: Date | null;
  mortgageMonthlyPayment: number | null;
};

/**
 * Aggrega tutti i mutui attivi: capitale residuo (formula francese), rata
 * mensile totale, tasso medio ponderato, mesi rimanenti (massimo).
 */
function aggregateMortgages(estates: EstateForMortgage[]): {
  totalResidualPrincipalEur: number;
  monthlyPaymentEur: number;
  avgRatePct: number | null;
  monthsRemaining: number | null;
} | null {
  const withMortgage = estates.filter(
    (e) =>
      e.mortgageAmount && e.mortgageRate != null && e.mortgageDurationMonths && e.mortgageStartDate,
  );
  if (withMortgage.length === 0) return null;

  const now = new Date();
  let totalResidual = 0;
  let totalMonthly = 0;
  let weightedRateNum = 0;
  let weightedRateDen = 0;
  let maxMonthsLeft: number | null = null;
  for (const e of withMortgage) {
    const principal = e.mortgageAmount!;
    const annualRatePct = e.mortgageRate!;
    const totalMonths = e.mortgageDurationMonths!;
    const start = e.mortgageStartDate!;
    const r = annualRatePct / 100 / 12;
    const monthsElapsed = Math.max(
      0,
      Math.min(
        totalMonths,
        Math.round(((now.getTime() - start.getTime()) / 86_400_000 / 365.25) * 12),
      ),
    );
    const monthlyPmt = e.mortgageMonthlyPayment ?? amortPmt(principal, r, totalMonths);
    const residual =
      r > 0
        ? monthlyPmt * ((1 - Math.pow(1 + r, -(totalMonths - monthsElapsed))) / r)
        : principal * (1 - monthsElapsed / totalMonths);
    totalResidual += Math.max(0, residual);
    totalMonthly += monthlyPmt;
    weightedRateNum += annualRatePct * principal;
    weightedRateDen += principal;
    const monthsLeft = totalMonths - monthsElapsed;
    if (maxMonthsLeft == null || monthsLeft > maxMonthsLeft) maxMonthsLeft = monthsLeft;
  }
  return {
    totalResidualPrincipalEur: totalResidual,
    monthlyPaymentEur: totalMonthly,
    avgRatePct: weightedRateDen > 0 ? weightedRateNum / weightedRateDen : null,
    monthsRemaining: maxMonthsLeft,
  };
}

function amortPmt(principal: number, monthlyRate: number, months: number): number {
  if (monthlyRate <= 0) return principal / months;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

const LENSES = [
  {
    id: "cashflow",
    label: "Cashflow del mese",
    directive:
      "Focalizzati sul flusso del mese: income, expense, savings rate, top categorie. È il cuore della narrazione di QUESTO numero.",
  },
  {
    id: "investments",
    label: "Performance investimenti",
    directive:
      "Focalizzati sul portafoglio: best/worst stock, crypto, contesto macro (S&P, BTC). È il cuore di QUESTO numero.",
  },
  {
    id: "allocation_risk",
    label: "Allocation & rischio",
    directive:
      "Focalizzati su come è distribuito il capitale: liquidità vs investimenti vs immobili, concentrazioni, FX exposure. È il cuore di QUESTO numero.",
  },
  {
    id: "efficiency",
    label: "Efficienza spese & opportunità",
    directive:
      "Focalizzati su efficienza: cash drag, anomalie spesa, subscription, opportunità lasciate sul tavolo. È il cuore di QUESTO numero.",
  },
  {
    id: "trajectory",
    label: "Traiettoria & milestone",
    directive:
      "Focalizzati sul lungo periodo: streak, YTD, runway, distanza dal prossimo milestone, mutui residui. È il cuore di QUESTO numero.",
  },
  {
    id: "behavior",
    label: "Anomalie e comportamento",
    directive:
      "Focalizzati su pattern comportamentali: anomalie, categorie in salita, deviazioni dalla media. È il cuore di QUESTO numero.",
  },
];

function computeLens(year: number, monthIdx: number): {
  id: string;
  label: string;
  directive: string;
} {
  const idx = (year * 12 + monthIdx) % LENSES.length;
  return LENSES[idx];
}

/**
 * Carica gli ultimi 2 numeri pubblicati (escluso il mese target) per
 * passarli a Claude come "memoria": evita di riproporre headline simili.
 */
async function loadLastIssues(
  targetYear: number,
  targetMonth: number,
): Promise<Array<{ monthLabel: string; headline: string; lead: string }>> {
  const recent = await prisma.setting.findMany({
    where: { key: { startsWith: "insights.networth." } },
    orderBy: { key: "desc" },
    take: 6,
  });
  const targetKey = `insights.networth.${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
  const out: Array<{ monthLabel: string; headline: string; lead: string }> = [];
  for (const s of recent) {
    if (s.key === targetKey) continue;
    if (out.length >= 2) break;
    try {
      const parsed = JSON.parse(s.value) as { headline?: string; lead?: string };
      if (typeof parsed.headline !== "string") continue;
      const m = s.key.match(/(\d{4})-(\d{2})$/);
      if (!m) continue;
      const monthIdx = parseInt(m[2], 10) - 1;
      const label = `${MONTH_NAMES_IT[monthIdx]} ${m[1]}`;
      out.push({
        monthLabel: label,
        headline: parsed.headline,
        lead: parsed.lead ?? "",
      });
    } catch {
      // Setting con value non-JSON, skip
    }
  }
  return out;
}
