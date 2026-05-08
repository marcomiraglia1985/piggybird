import { prisma } from "../prisma";
import { getDisplayBalances } from "../account-freeze";
import { getUserProfile } from "../user-profile";
import { getPersonalityProfile } from "../personality";
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

  // === Liquid net worth (cash + savings, escluso investments + real estate) ===
  // Storia separata dal NW totale: il totale può salire perché crescono gli
  // investimenti mentre la liquidità si erode (acquisti casa, spese grandi).
  // Narrativamente sono storie distinte che vanno raccontate separatamente.
  liquidityDelta: { eur: number; pct: number; current: number; previous: number };
  liquidityYtd: { eur: number; pct: number; current: number; startOfYear: number };
  liquidityLast12Months: number[]; // sparkline 12 punti per stagionalità

  // === Pillar breakdown: delta MoM di ogni componente del NW. L'AI vede
  // quale pillar ha guidato il movimento del mese (es. "il NW sale +€8K
  // ma è tutto investments in crescita; la liquidità è scesa di €3K"). ===
  pillarBreakdown: {
    liquidity: { current: number; eurDeltaMoM: number; pctDeltaMoM: number };
    savings: { current: number; eurDeltaMoM: number; pctDeltaMoM: number };
    investments: { current: number; eurDeltaMoM: number; pctDeltaMoM: number };
  };

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

  // === Anniversary check: pattern ricorrenti YoY (es. bonus annuale, premio
  // assicurazione): mostra cosa è atteso vs cosa è arrivato. L'AI scrive
  // cose del tipo "il bonus Courage di maggio (l'anno scorso €3K) non è
  // ancora visto, ma c'è una tx programmata per giugno". ===
  anniversaries: Array<{
    pattern: string; // "Pagamento da COURAGE S.R.L."
    lastYearLabel: string; // "maggio 2025"
    lastYearEur: number;
    status: "arrived-as-expected" | "missing" | "scheduled-future";
    thisYearEur: number | null;
    /** Descrizione status leggibile (es. "atteso 12 giugno"). */
    thisYearNote: string;
  }>;

  // === Eventi straordinari del periodo: signal narrativi che l'AI usa per
  // tessere la cronaca del mese. Diversi da `anomalies` (che è solo spike
  // categoria-vs-storico): qui catturiamo cambi strutturali di vita
  // finanziaria — acquisto immobile, mutuo nuovo, drawdown forte, ecc. ===
  events: Array<{
    type:
      | "estate-purchase"
      | "mortgage-start"
      | "nw-inversion"
      | "category-spike"
      | "milestone-crossed";
    label: string; // human-readable, es. "Acquisto Casa Roma il 12 marzo"
    /** Importo associato (es. prezzo acquisto, capitale residuo, delta NW). */
    eurAmount?: number;
    /** Data ISO se l'evento ha un timestamp specifico. */
    dateIso?: string;
    /** Contesto extra leggibile (es. "rata €880/mese, durata 25 anni"). */
    context?: string;
  }>;

  // === Forward-looking: agenda finanziaria dei prossimi 60gg basata su tx
  // programmate (date > oggi OPPURE confirmed=false). L'AI scrive la
  // sezione "cosa aspettarsi" del numero ("in arrivo €3.5K bonus, –€880
  // mutuo Casa Roma, saldo atteso a +€42K"). ===
  forwardLooking: {
    windowDays: number;
    expectedIncomeEur: number;
    expectedExpenseEur: number; // magnitude positive
    expectedNetEur: number;
    bigItems: Array<{
      dateIso: string;
      label: string; // beneficiary o categoria leggibile
      amountEur: number; // signed
    }>;
  };

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

  // === Memoria: ultime 6 edizioni pubblicate. Usate dall'AI per cronaca
  // continuativa (callback espliciti agli eventi raccontati prima) e per
  // evitare ripetizioni di angoli/aperture. ===
  lastIssues: Array<{
    monthLabel: string;
    headline: string;
    lead: string;
    highlights: string[];
    watchout: string | null;
  }>;

  // === Profilo utente (campi non-null) — context, mai usato come "tu/Marco" ===
  userContext: {
    ageYears: number | null;
    countries: string[];
    city: string | null;
    trackingYearsActual: number | null;
    goals: string[];
    retirementAgeRange: string | null;
    riskTolerance: string | null;
    familyStatus: string | null;
    childrenCount: string | null;
    profession: string | null;
    housingType: string | null;
  };

  // === Personality test layers (se completato) — psico-finanziario ===
  personalityLayers: {
    archetype: { id: string; name: string; bird: string; tagline: string } | null;
    axes: {
      planning: number;
      risk: number;
      time: number;
      value: number;
      social: number;
    } | null;
    moneyScripts: {
      avoidance: number;
      worship: number;
      status: number;
      vigilance: number;
    } | null;
    behavioral: { lossAversion: number; composure: number } | null;
    literacyScore: number | null;
  } | null;
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
  // 24 take per coprire 12 mesi sparkline + YTD anche su anno calendario
  // largo (gennaio dell'anno scorso ancora reperibile).
  const snapshots = await prisma.netWorthSnapshot.findMany({
    orderBy: { month: "desc" },
    take: 24,
  });
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].reverse();
  const current = sorted[sorted.length - 1].total;
  const previous = sorted[sorted.length - 2].total;
  const eur = current - previous;
  const pct = previous !== 0 ? eur / previous : 0;

  // Liquid NW = liquidity + savings (escluso investments). Snapshot ha
  // entrambi i campi nullable: fallback a 0 se mancanti, ma se NULL su
  // entrambi i mesi confrontati il delta è 0 (innocuo).
  const liquidOf = (s: { liquidity: number | null; savings: number | null }) =>
    (s.liquidity ?? 0) + (s.savings ?? 0);
  const investOf = (s: { investments: number | null }) => s.investments ?? 0;
  const liqCurrent = liquidOf(sorted[sorted.length - 1]);
  const liqPrevious = liquidOf(sorted[sorted.length - 2]);
  const liqEur = liqCurrent - liqPrevious;
  const liqPct = liqPrevious !== 0 ? liqEur / liqPrevious : 0;

  // YTD: snapshot più vecchio dell'anno target ancora presente
  const yearStart = sorted.find(
    (s) => s.month.getFullYear() === targetYear && s.month.getMonth() === 0,
  );
  const ytdStart = yearStart?.total ?? sorted[0].total;
  const ytdEur = current - ytdStart;
  const ytdPct = ytdStart !== 0 ? ytdEur / ytdStart : 0;

  // Liquid YTD usa stessa anchor del totale (gennaio anno corrente).
  const liqYearStart = yearStart ? liquidOf(yearStart) : liquidOf(sorted[0]);
  const liqYtdEur = liqCurrent - liqYearStart;
  const liqYtdPct = liqYearStart !== 0 ? liqYtdEur / liqYearStart : 0;

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
  const liquidityLast12Months = sorted.slice(-12).map((s) => liquidOf(s));

  // Pillar breakdown MoM
  const cur = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const pillarDelta = (curr: number, prv: number) => ({
    current: curr,
    eurDeltaMoM: curr - prv,
    pctDeltaMoM: prv !== 0 ? (curr - prv) / prv : 0,
  });
  const pillarBreakdown = {
    liquidity: pillarDelta(cur.liquidity ?? 0, prev.liquidity ?? 0),
    savings: pillarDelta(cur.savings ?? 0, prev.savings ?? 0),
    investments: pillarDelta(investOf(cur), investOf(prev)),
  };

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

  // === Profilo utente: campi non-null come context narrativo ===
  const profile = await getUserProfile().catch(() => null);
  const ageYears =
    profile?.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)
      ? Math.max(0, Math.floor(
          (now.getTime() - new Date(profile.birthDate).getTime()) /
            (365.25 * 86_400_000),
        ))
      : null;
  const trackingYearsActual = sorted.length > 0
    ? +(((now.getTime() - sorted[0].month.getTime()) / (365.25 * 86_400_000)).toFixed(1))
    : null;
  const userContext = {
    ageYears,
    countries: profile?.countries ?? [],
    city: profile?.city || null,
    trackingYearsActual,
    goals: profile?.goals ?? [],
    retirementAgeRange: profile?.retirementAge || null,
    riskTolerance: profile?.riskTolerance || null,
    familyStatus: profile?.familyStatus || null,
    childrenCount: profile?.childrenCount || null,
    profession: profile?.profession || null,
    housingType: profile?.housingType || null,
  };

  // === Personality layers — psico-finanziario, attinge cross-feature ===
  const personality = await getPersonalityProfile().catch(() => null);
  const personalityLayers =
    personality?.completed && personality.archetype && personality.axes
      ? {
          archetype: {
            id: personality.archetype.id,
            name: personality.archetype.name,
            bird: personality.archetype.bird,
            tagline: personality.archetype.tagline,
          },
          axes: personality.axes,
          moneyScripts: personality.moneyScripts ?? null,
          behavioral: personality.behavioral ?? null,
          literacyScore: personality.literacyScore,
        }
      : null;

  return {
    monthLabel,
    monthIsClosed,
    todayIso: now.toISOString(),
    monthDelta: { eur, pct, current, previous },
    ytd: { eur: ytdEur, pct: ytdPct, current, startOfYear: ytdStart },
    streak: { months: streakMonths, direction },
    last6Months: last6,
    milestoneCrossed,
    liquidityDelta: {
      eur: liqEur,
      pct: liqPct,
      current: liqCurrent,
      previous: liqPrevious,
    },
    liquidityYtd: {
      eur: liqYtdEur,
      pct: liqYtdPct,
      current: liqCurrent,
      startOfYear: liqYearStart,
    },
    liquidityLast12Months,
    pillarBreakdown,
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
    anniversaries: await detectAnniversaries({
      now,
      targetYear,
      targetMonth,
    }),
    forwardLooking: await buildForwardLooking(now),
    events: await detectEvents({
      now,
      targetYear,
      targetMonth,
      monthDelta: { eur, pct, current, previous },
      milestoneCrossed,
      anomalies,
    }),
    interestBearingAccounts,
    opportunities: opportunities.slice(0, 5),
    mortgages: mortgagesAgg,
    cashRunwayMonths,
    fxExposure,
    macro,
    lens,
    lastIssues,
    userContext,
    personalityLayers,
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
): Promise<
  Array<{
    monthLabel: string;
    headline: string;
    lead: string;
    highlights: string[];
    watchout: string | null;
  }>
> {
  // Take 7 per garantire 6 utili anche dopo skip del target. Le issue sono
  // ordinate desc per chiave (YYYY-MM stringa lex-sortable), quindi la
  // più recente è in cima.
  const recent = await prisma.setting.findMany({
    where: { key: { startsWith: "insights.networth." } },
    orderBy: { key: "desc" },
    take: 7,
  });
  const targetKey = `insights.networth.${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
  const out: Array<{
    monthLabel: string;
    headline: string;
    lead: string;
    highlights: string[];
    watchout: string | null;
  }> = [];
  for (const s of recent) {
    if (s.key === targetKey) continue;
    if (out.length >= 6) break;
    try {
      const parsed = JSON.parse(s.value) as {
        headline?: string;
        lead?: string;
        highlights?: unknown;
        watchout?: unknown;
      };
      if (typeof parsed.headline !== "string") continue;
      const m = s.key.match(/(\d{4})-(\d{2})$/);
      if (!m) continue;
      const monthIdx = parseInt(m[2], 10) - 1;
      const label = `${MONTH_NAMES_IT[monthIdx]} ${m[1]}`;
      const highlights = Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((h): h is string => typeof h === "string")
        : [];
      const watchout =
        typeof parsed.watchout === "string" && parsed.watchout.trim()
          ? parsed.watchout
          : null;
      out.push({
        monthLabel: label,
        headline: parsed.headline,
        lead: parsed.lead ?? "",
        highlights,
        watchout,
      });
    } catch {
      // Setting con value non-JSON, skip
    }
  }
  return out;
}

/**
 * Detect "eventi straordinari" del periodo per il widget Piggybird Finance.
 * Sono signal narrativi che l'AI tesse nella cronaca: cambi strutturali di
 * vita finanziaria che giustificano l'andamento dei numeri.
 *
 * Tipologie:
 *  - estate-purchase: nuovo `RealEstate.purchaseDate` negli ultimi 180gg
 *    (6 mesi: l'arredamento e il setup di una casa post-rogito durano mesi,
 *    non settimane — narrativamente l'evento è ancora "fresco").
 *  - mortgage-start: `mortgageStartDate` negli ultimi 90gg
 *  - nw-inversion: monthDelta MoM < -5% (drawdown forte)
 *  - category-spike: derivato da `anomalies` (>200% vs media 6m)
 *  - milestone-crossed: pass-through del milestone già calcolato
 */
async function detectEvents(args: {
  now: Date;
  targetYear: number;
  targetMonth: number;
  monthDelta: { eur: number; pct: number; current: number; previous: number };
  milestoneCrossed: IssueInput["milestoneCrossed"];
  anomalies: IssueInput["anomalies"];
}): Promise<IssueInput["events"]> {
  const events: IssueInput["events"] = [];
  const nowMs = args.now.getTime();
  const ms180d = 180 * 86_400_000;
  const ms90d = 90 * 86_400_000;

  // 1. Estate purchase recente (ultimi 180gg = 6 mesi)
  const estates = await prisma.realEstate.findMany({
    where: {
      active: true,
      holding: "owned",
      purchaseDate: { not: null, gte: new Date(nowMs - ms180d) },
    },
    select: {
      name: true,
      purchaseDate: true,
      purchasePrice: true,
      city: true,
    },
  });
  for (const e of estates) {
    if (!e.purchaseDate) continue;
    events.push({
      type: "estate-purchase",
      label: e.city ? `Acquisto ${e.name} (${e.city})` : `Acquisto ${e.name}`,
      eurAmount: e.purchasePrice ?? undefined,
      dateIso: e.purchaseDate.toISOString(),
    });
  }

  // 2. Mortgage start recente (ultimi 90gg)
  const newMortgages = await prisma.realEstate.findMany({
    where: {
      active: true,
      mortgageStartDate: { not: null, gte: new Date(nowMs - ms90d) },
      mortgageAmount: { not: null },
    },
    select: {
      name: true,
      mortgageStartDate: true,
      mortgageAmount: true,
      mortgageRate: true,
      mortgageDurationMonths: true,
      mortgageMonthlyPayment: true,
    },
  });
  for (const m of newMortgages) {
    if (!m.mortgageStartDate) continue;
    const ratePart =
      m.mortgageRate != null ? ` al ${m.mortgageRate.toFixed(2)}%` : "";
    const durationPart =
      m.mortgageDurationMonths != null
        ? ` per ${Math.round(m.mortgageDurationMonths / 12)} anni`
        : "";
    const paymentPart =
      m.mortgageMonthlyPayment != null
        ? `rata €${Math.round(m.mortgageMonthlyPayment)}/mese`
        : "";
    events.push({
      type: "mortgage-start",
      label: `Mutuo nuovo su ${m.name}${ratePart}${durationPart}`,
      eurAmount: m.mortgageAmount ?? undefined,
      dateIso: m.mortgageStartDate.toISOString(),
      context: paymentPart || undefined,
    });
  }

  // 3. NW inversion: drawdown >5% nel mese
  if (args.monthDelta.pct < -0.05) {
    events.push({
      type: "nw-inversion",
      label: `Drawdown del mese: NW ${(args.monthDelta.pct * 100).toFixed(1)}% (€${Math.round(args.monthDelta.eur)})`,
      eurAmount: args.monthDelta.eur,
    });
  }

  // 4. Category spike: top 2 anomalies con >200% di delta
  for (const a of args.anomalies.slice(0, 2)) {
    if (a.pctChange < 200) continue;
    events.push({
      type: "category-spike",
      label: `Spesa "${a.category}" a €${Math.round(a.thisMonth)} (+${Math.round(a.pctChange)}% vs media 6m)`,
      eurAmount: a.thisMonth,
      context: `Media 6m: €${Math.round(a.avg6m)}`,
    });
  }

  // 5. Milestone crossed: pass-through
  if (args.milestoneCrossed) {
    events.push({
      type: "milestone-crossed",
      label: `Soglia €${Math.round(args.milestoneCrossed.threshold / 1000)}K attraversata`,
      eurAmount: args.milestoneCrossed.threshold,
    });
  }

  return events;
}

/**
 * Detect "anniversari" finanziari: tx grandi (>€500) che si ripetono YoY.
 * Per ogni pattern (raggruppato su beneficiary normalizzato + categoryId)
 * trovato nello stesso mese di anni precedenti, controlla:
 *   - "arrived-as-expected": tx simile arrivata quest'anno entro il window
 *   - "scheduled-future": tx programmata futura (confirmed=false o date>oggi)
 *   - "missing": niente in arrivo, l'anniversary è "saltato"
 *
 * L'AI usa questo per scrivere "il bonus Courage di maggio (l'anno scorso
 * €3K) non è ancora arrivato — c'è una tx programmata per giugno". Il caso
 * "missing senza scheduled" è il più narrativamente forte: anomalia silente.
 */
async function detectAnniversaries(args: {
  now: Date;
  targetYear: number;
  targetMonth: number;
}): Promise<IssueInput["anniversaries"]> {
  const { targetYear, targetMonth } = args;
  const ANNIVERSARY_THRESHOLD = 500; // €
  const TX_LIMIT = 200; // safety cap

  // Stesso mese degli ultimi 2 anni precedenti (target_year - 1, -2)
  const out: IssueInput["anniversaries"] = [];
  const lastYear = targetYear - 1;

  const lastYearStart = new Date(Date.UTC(lastYear, targetMonth, 1));
  const lastYearEnd = new Date(Date.UTC(lastYear, targetMonth + 1, 1));

  const historicalTxs = await prisma.transaction.findMany({
    where: {
      date: { gte: lastYearStart, lt: lastYearEnd },
      transferGroupId: null,
      confirmed: true,
      OR: [
        { amount: { gte: ANNIVERSARY_THRESHOLD } },
        { amount: { lte: -ANNIVERSARY_THRESHOLD } },
      ],
    },
    select: { amount: true, beneficiary: true, categoryId: true, date: true },
    take: TX_LIMIT,
  });

  if (historicalTxs.length === 0) return out;

  // Group historical by (normalized beneficiary, categoryId, sign)
  type Key = string;
  const groups = new Map<
    Key,
    { beneficiary: string; categoryId: string | null; sign: number; totalEur: number; count: number }
  >();
  function normBen(s: string | null): string {
    if (!s) return "";
    return s.toLowerCase().trim().replace(/\s+/g, " ");
  }
  for (const t of historicalTxs) {
    const ben = normBen(t.beneficiary);
    if (!ben) continue;
    const sign = t.amount > 0 ? 1 : -1;
    const k = `${ben}|${t.categoryId ?? ""}|${sign}`;
    const g = groups.get(k) ?? {
      beneficiary: t.beneficiary ?? ben,
      categoryId: t.categoryId,
      sign,
      totalEur: 0,
      count: 0,
    };
    g.totalEur += t.amount;
    g.count += 1;
    groups.set(k, g);
  }

  // Per ogni gruppo storico, controlla quest'anno entro target month ±60gg
  // (passato e futuro) per match (amount entro ±30%, stesso beneficiary).
  const thisYearStart = new Date(Date.UTC(targetYear, targetMonth - 2, 1));
  const thisYearEnd = new Date(Date.UTC(targetYear, targetMonth + 3, 1));
  const todayMs = args.now.getTime();

  for (const g of groups.values()) {
    if (out.length >= 5) break; // cap per non inflazionare il prompt
    if (Math.abs(g.totalEur) < ANNIVERSARY_THRESHOLD) continue;
    const expected = Math.abs(g.totalEur);
    const candidates = await prisma.transaction.findMany({
      where: {
        date: { gte: thisYearStart, lt: thisYearEnd },
        transferGroupId: null,
        beneficiary: { contains: g.beneficiary.split(" ")[0] }, // prefix loose match
      },
      select: {
        amount: true,
        beneficiary: true,
        date: true,
        confirmed: true,
        categoryId: true,
      },
      take: 30,
    });
    // Filter: stesso segno, amount entro ±30% del totale storico,
    // beneficiary normalizzato match
    const matching = candidates.filter((c) => {
      if (Math.sign(c.amount) !== g.sign) return false;
      const ratio = Math.abs(c.amount) / expected;
      if (ratio < 0.7 || ratio > 1.5) return false;
      return normBen(c.beneficiary).includes(g.beneficiary.split(" ")[0].toLowerCase());
    });
    const arrived = matching.find(
      (c) => c.confirmed && c.date.getTime() <= todayMs,
    );
    const scheduled = matching.find(
      (c) => !arrived && (c.date.getTime() > todayMs || !c.confirmed),
    );

    const monthLabel = `${MONTH_NAMES_IT[targetMonth]} ${lastYear}`;
    if (arrived) {
      out.push({
        pattern: g.beneficiary,
        lastYearLabel: monthLabel,
        lastYearEur: Math.round(expected),
        status: "arrived-as-expected",
        thisYearEur: Math.round(Math.abs(arrived.amount)),
        thisYearNote: `arrivato il ${arrived.date.toISOString().slice(0, 10)}`,
      });
    } else if (scheduled) {
      out.push({
        pattern: g.beneficiary,
        lastYearLabel: monthLabel,
        lastYearEur: Math.round(expected),
        status: "scheduled-future",
        thisYearEur: Math.round(Math.abs(scheduled.amount)),
        thisYearNote: `programmato per ${scheduled.date.toISOString().slice(0, 10)}`,
      });
    } else {
      out.push({
        pattern: g.beneficiary,
        lastYearLabel: monthLabel,
        lastYearEur: Math.round(expected),
        status: "missing",
        thisYearEur: null,
        thisYearNote: `non ancora visto né programmato`,
      });
    }
  }

  return out;
}

/**
 * Costruisce l'agenda finanziaria dei prossimi 60gg per il widget Piggybird
 * Finance. Legge tx programmate (date>oggi o confirmed=false), aggrega
 * income/expense attesi, isola gli "eventi grossi" (>€500) con data e
 * label.
 *
 * Esclude transfer interni: quelli si annullano fra conti dell'utente.
 *
 * Nota: ricorrenze programmate (Netflix, mutuo, ecc.) sono già in DB con
 * confirmed=false o date>oggi → vengono incluse automaticamente. Niente
 * forecasting fantasioso, solo dati reali dal DB.
 */
async function buildForwardLooking(
  now: Date,
): Promise<IssueInput["forwardLooking"]> {
  const WINDOW_DAYS = 60;
  const BIG_THRESHOLD = 500;
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);

  const txs = await prisma.transaction.findMany({
    where: {
      transferGroupId: null,
      date: { lte: horizon },
      OR: [{ date: { gt: now } }, { confirmed: false }],
    },
    select: {
      amount: true,
      date: true,
      beneficiary: true,
      category: { select: { name: true, emoji: true } },
      account: { select: { ownershipShare: true } },
      ownershipShare: true,
    },
    orderBy: { date: "asc" },
    take: 200,
  });

  let expectedIncomeEur = 0;
  let expectedExpenseEur = 0;
  const bigItems: IssueInput["forwardLooking"]["bigItems"] = [];

  for (const t of txs) {
    const share = t.ownershipShare ?? t.account.ownershipShare;
    const eff = t.amount * share;
    if (eff > 0) expectedIncomeEur += eff;
    else expectedExpenseEur += Math.abs(eff);

    if (Math.abs(eff) >= BIG_THRESHOLD && bigItems.length < 8) {
      const label =
        t.beneficiary ||
        t.category?.name ||
        (eff > 0 ? "Entrata programmata" : "Uscita programmata");
      bigItems.push({
        dateIso: t.date.toISOString(),
        label,
        amountEur: Math.round(eff),
      });
    }
  }

  return {
    windowDays: WINDOW_DAYS,
    expectedIncomeEur: Math.round(expectedIncomeEur),
    expectedExpenseEur: Math.round(expectedExpenseEur),
    expectedNetEur: Math.round(expectedIncomeEur - expectedExpenseEur),
    bigItems,
  };
}
