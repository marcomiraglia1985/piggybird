import { prisma } from "../prisma";
import { getUserProfile } from "../user-profile";
import { getPersonalityProfile } from "../personality";
import { fetchMacroContext, type MacroContext } from "./macro";

/**
 * Detector per Investment Commentary — analisi profonda del portafoglio.
 *
 * Filosofia universal-app: funziona con qualsiasi conto/broker l'utente ha
 * (Revolut Trading, Binance, Revolut X, futuri broker IBKR/Fineco/etc).
 * Niente hard-code di nomi platform: aggrega per `Investment.type` e
 * `StockPosition.assetType` astrattamente.
 *
 * Differenza vs detector PF:
 *  - Profondità: ogni posizione, cost basis, traiettoria, FX exposure
 *  - Macro extended: VIX, MSCI World, T10y, Gold (oltre ai signal PF)
 *  - Non ha lens rotation né memory: è on-demand, 1-2× al mese
 */

export type PortfolioInput = {
  todayIso: string;

  // === Aggregati ===
  totals: {
    valueEur: number; // valore corrente totale di tutti gli investments
    costEur: number | null; // cost basis totale dove noto
    unrealizedGainEur: number | null;
    unrealizedGainPct: number | null;
  };

  // === Breakdown per asset class (universal: deriva da Investment.type) ===
  byAssetClass: Array<{
    type: string; // "stocks" | "crypto" | "metals" | ... (qualsiasi)
    valueEur: number;
    costEur: number | null;
    pctOfPortfolio: number;
    positionCount: number;
  }>;

  // === Posizioni dettaglio (top N per valore, con gain/loss) ===
  topPositions: Array<{
    ticker: string;
    name: string | null;
    assetType: string; // stock / etf / crypto / metal / ...
    platform: string;
    currency: string;
    valueEur: number;
    costEur: number | null;
    gainEur: number | null;
    gainPct: number | null;
    pctOfPortfolio: number;
  }>;

  // === Concentrazione ===
  concentration: {
    top1PctOfEquity: number | null; // top stock % degli stocks
    top3PctOfEquity: number | null;
    top1PctOfPortfolio: number | null;
  };

  // === FX exposure ===
  fxExposure: {
    nonEurValueEur: number;
    pctNonEur: number;
    breakdownByCurrency: Array<{ currency: string; valueEur: number; pctOfPortfolio: number }>;
  };

  // === Trading cash idle ===
  tradingCashEur: number;
  tradingCashByPlatform: Array<{ platform: string; currency: string; valueEur: number }>;

  // === Performance / traiettoria ===
  performance: {
    realizedPnLEurAllTime: number; // somma RealizedPnL
    netDepositsEur: number; // somma totalEur deposit−withdraw
    cagr1y: number | null; // se abbiamo 12+ mesi InvestmentsHistoryCache
  };

  // === Macro context (extended: VIX, MSCI, T10y, Gold) ===
  macro: MacroContext;

  // === User context — completo, allineato col detector PF (lib/insights/
  // detector.ts). Marco ha esplicitamente chiesto che tutti i dati del
  // profilo siano propagati ovunque ai paragoni/statistiche AI.
  // Vedi feedback: dato profilo importantissimo per ogni paragone. ===
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

  // === Personality layers (riusato da PF) ===
  personalityLayers: {
    archetype: { id: string; name: string; bird: string; tagline: string } | null;
    axes: { planning: number; risk: number; time: number; value: number; social: number } | null;
    moneyScripts: { avoidance: number; worship: number; status: number; vigilance: number } | null;
    behavioral: { lossAversion: number; composure: number } | null;
    literacyScore: number | null;
  } | null;
};

export async function buildPortfolioInput(): Promise<PortfolioInput | null> {
  const now = new Date();

  const [investments, stocks, tradingCash] = await Promise.all([
    prisma.investment.findMany(),
    prisma.stockPosition.findMany(),
    prisma.tradingCash.findMany(),
  ]);

  if (investments.length === 0 && stocks.length === 0) return null;

  // === Totali ===
  const valueEur = investments.reduce((s, i) => s + i.currentValue, 0);
  const costEur = investments.some((i) => i.costEur != null)
    ? investments.reduce((s, i) => s + (i.costEur ?? 0), 0)
    : null;
  const unrealizedGainEur = costEur != null ? valueEur - costEur : null;
  const unrealizedGainPct =
    costEur != null && costEur > 0 ? ((valueEur - costEur) / costEur) * 100 : null;

  // === Breakdown per asset class ===
  const classMap = new Map<string, { valueEur: number; costEur: number; hasCost: boolean; count: number }>();
  for (const inv of investments) {
    const cls = inv.type;
    const e = classMap.get(cls) ?? { valueEur: 0, costEur: 0, hasCost: false, count: 0 };
    e.valueEur += inv.currentValue;
    if (inv.costEur != null) {
      e.costEur += inv.costEur;
      e.hasCost = true;
    }
    e.count++;
    classMap.set(cls, e);
  }
  const byAssetClass = [...classMap.entries()].map(([type, e]) => ({
    type,
    valueEur: e.valueEur,
    costEur: e.hasCost ? e.costEur : null,
    pctOfPortfolio: valueEur > 0 ? (e.valueEur / valueEur) * 100 : 0,
    positionCount: e.count,
  }));

  // === Top positions (stock detail level) ===
  const topPositions = stocks
    .map((p) => {
      const valEur = p.shares * p.currentPrice * p.fxToEur;
      const cstEur = p.avgCost != null ? p.shares * p.avgCost * p.fxToEur : null;
      const gain = cstEur != null ? valEur - cstEur : null;
      const gainPct = cstEur != null && cstEur > 0 ? ((valEur - cstEur) / cstEur) * 100 : null;
      return {
        ticker: p.ticker,
        name: p.name,
        assetType: p.assetType,
        platform: p.platform,
        currency: p.currency,
        valueEur: valEur,
        costEur: cstEur,
        gainEur: gain,
        gainPct,
        pctOfPortfolio: valueEur > 0 ? (valEur / valueEur) * 100 : 0,
      };
    })
    .sort((a, b) => b.valueEur - a.valueEur)
    .slice(0, 10);

  // === Concentrazione ===
  const stocksTotal = stocks.reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
  const sortedByValue = [...stocks]
    .map((p) => p.shares * p.currentPrice * p.fxToEur)
    .sort((a, b) => b - a);
  const top1Equity = stocksTotal > 0 ? ((sortedByValue[0] ?? 0) / stocksTotal) * 100 : null;
  const top3Equity =
    stocksTotal > 0
      ? (sortedByValue.slice(0, 3).reduce((s, v) => s + v, 0) / stocksTotal) * 100
      : null;
  const top1Portfolio = valueEur > 0 ? ((sortedByValue[0] ?? 0) / valueEur) * 100 : null;

  // === FX exposure ===
  const fxMap = new Map<string, number>();
  for (const p of stocks) {
    const valEur = p.shares * p.currentPrice * p.fxToEur;
    const cur = (p.currency || "EUR").toUpperCase();
    fxMap.set(cur, (fxMap.get(cur) ?? 0) + valEur);
  }
  // Crypto sempre USD-denominato → bucket USD
  const cryptoTotal = investments
    .filter((i) => i.type === "crypto")
    .reduce((s, i) => s + i.currentValue, 0);
  if (cryptoTotal > 0) fxMap.set("USD", (fxMap.get("USD") ?? 0) + cryptoTotal);
  const fxBreakdown = [...fxMap.entries()]
    .map(([currency, vEur]) => ({
      currency,
      valueEur: vEur,
      pctOfPortfolio: valueEur > 0 ? (vEur / valueEur) * 100 : 0,
    }))
    .sort((a, b) => b.valueEur - a.valueEur);
  const nonEurVal = fxBreakdown
    .filter((b) => b.currency !== "EUR")
    .reduce((s, b) => s + b.valueEur, 0);

  // === Trading cash ===
  const tradingCashEur = tradingCash.reduce((s, t) => s + t.amount * t.fxToEur, 0);
  const tradingCashByPlatform = tradingCash.map((t) => ({
    platform: t.platform,
    currency: t.currency,
    valueEur: t.amount * t.fxToEur,
  }));

  // === Performance: realized PnL + net deposits ===
  // RealizedPnL.pnl è in valuta nativa (USD per stock US); fxAtSell la converte
  // in EUR al cambio del giorno di sell. Aggregate non può fare moltiplicazioni:
  // findMany + reduce.
  const realizedRecords = await prisma.realizedPnL.findMany({
    select: { pnl: true, fxAtSell: true },
  });
  const realizedPnLEurAllTime = realizedRecords.reduce(
    (s, r) => s + r.pnl * r.fxAtSell,
    0,
  );
  const stockTrades = await prisma.stockTrade.findMany({
    where: { type: { in: ["deposit", "withdraw"] } },
    select: { type: true, amountEur: true },
  });
  const netDepositsEur = stockTrades.reduce(
    (s, t) => s + (t.type === "deposit" ? t.amountEur : -t.amountEur),
    0,
  );

  // CAGR 1y: se InvestmentsHistoryCache ha 12+ mesi
  let cagr1y: number | null = null;
  try {
    const oneYearAgo = new Date(now.getTime() - 365 * 86_400_000);
    const histPoints = await prisma.investmentsHistoryCache.findMany({
      where: { date: { gte: oneYearAgo } },
      orderBy: { date: "asc" },
    });
    if (histPoints.length >= 200) {
      const first = histPoints[0];
      const last = histPoints[histPoints.length - 1];
      if (first.totalValue > 0 && last.totalValue > 0) {
        const years = (last.date.getTime() - first.date.getTime()) / (365.25 * 86_400_000);
        if (years > 0.5) {
          cagr1y = (Math.pow(last.totalValue / first.totalValue, 1 / years) - 1) * 100;
        }
      }
    }
  } catch {
    // schema può evolvere — gracefully degrada
  }

  // === Macro extended ===
  const wantsCrypto = cryptoTotal > 100;
  const wantsStocks = stocks.length > 0;
  const wantsFx = nonEurVal > 1000;
  const macro = await fetchMacroContext({
    wantsFx,
    wantsStocks,
    wantsCrypto,
    wantsExtended: true,
  }).catch(() => ({
    ecbDepositRatePct: null,
    eurozoneInflationYoyPct: null,
    eurUsdSpot: null,
    eurUsd1mChangePct: null,
    sp500_1mChangePct: null,
    btc_1mChangePct: null,
    vix_current: null,
    msciWorld_1mChangePct: null,
    treasury10y_currentPct: null,
    gold_1mChangePct: null,
  }));

  // === User profile (subset rilevante a investimenti) ===
  const profile = await getUserProfile().catch(() => null);
  const ageYears =
    profile?.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)
      ? Math.max(
          0,
          Math.floor(
            (now.getTime() - new Date(profile.birthDate).getTime()) /
              (365.25 * 86_400_000),
          ),
        )
      : null;
  // Tracking years: data della prima tx confermata in DB. Proxy semplice:
  // l'utente ha iniziato a usare l'app quando ha la prima tx.
  const firstTx = await prisma.transaction.findFirst({
    where: { confirmed: true },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  const trackingYearsActual = firstTx
    ? +(((now.getTime() - firstTx.date.getTime()) / (365.25 * 86_400_000)).toFixed(1))
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

  // === Personality layers ===
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
    todayIso: now.toISOString(),
    totals: { valueEur, costEur, unrealizedGainEur, unrealizedGainPct },
    byAssetClass,
    topPositions,
    concentration: {
      top1PctOfEquity: top1Equity,
      top3PctOfEquity: top3Equity,
      top1PctOfPortfolio: top1Portfolio,
    },
    fxExposure: {
      nonEurValueEur: nonEurVal,
      pctNonEur: valueEur > 0 ? (nonEurVal / valueEur) * 100 : 0,
      breakdownByCurrency: fxBreakdown,
    },
    tradingCashEur,
    tradingCashByPlatform,
    performance: {
      realizedPnLEurAllTime,
      netDepositsEur,
      cagr1y,
    },
    macro,
    userContext,
    personalityLayers,
  };
}
