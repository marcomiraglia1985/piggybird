import { prisma } from "../prisma";

/**
 * History del capitale investito per il chart in /investimenti.
 *
 * Sorgente preferita (precisa): tabelle dedicate degli investimenti finanziari
 *   - `StockTrade` events TOP-UP/WITHDRAWAL → cashflow netto in/out su platform
 *     stocks (Revolut, IBKR, ecc.)
 *   - `CryptoTrade` events buy/sell → cashflow netto crypto
 *   - `Investment.costEur` per piattaforme con cost basis aggregato (es. Crypto
 *     Binance) ma senza event log → si aggiunge come lump sum nel primo mese
 *     in cui appare un altro evento, in modo da non distorcere la timeline.
 *
 * NON usa più il filtro generico `category.type === "investment"` perché
 * include erroneamente tx di acquisto immobiliare ("🔑 Acquisto", "🏗️ Acquisto")
 * che non sono investimenti finanziari → causava picchi falsati di centinaia
 * di k.
 *
 * Mese corrente: sum(Investment.currentValue) (riflette mark-to-market).
 * Snapshot con `investments != null` mantengono priorità (manual override).
 */
export async function getInvestmentsHistory() {
  const [snapshots, stockEvents, cryptoEvents, allInvestments] =
    await Promise.all([
      prisma.netWorthSnapshot.findMany({ orderBy: { month: "asc" } }),
      prisma.stockTrade.findMany({
        where: { type: { in: ["TOP-UP", "WITHDRAWAL"] } },
        orderBy: { date: "asc" },
      }),
      prisma.cryptoTrade.findMany({ orderBy: { date: "asc" } }),
      prisma.investment.findMany({
        select: { id: true, type: true, platform: true, currentValue: true, costEur: true },
      }),
    ]);

  // Eventi di cashflow unificati: positivo = capitale entrato nell'investimento
  type CFlow = { date: Date; eurDelta: number };
  const events: CFlow[] = [
    ...stockEvents.map((e) => ({
      date: e.date,
      eurDelta: e.type === "TOP-UP" ? e.amountEur : -e.amountEur,
    })),
    ...cryptoEvents.map((e) => ({
      date: e.date,
      eurDelta: e.direction === "buy" ? e.totalEur : -e.totalEur,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Lump-sum: piattaforme con `costEur` su Investment ma senza eventi nelle
  // tabelle Stock/CryptoTrade (es. Crypto Binance, importato manualmente con
  // cost basis aggregato). Inserisco la lump sum alla data del primo evento
  // disponibile (così non parte dal 2018 con un picco istantaneo).
  const platformsWithEvents = new Set<string>();
  for (const e of stockEvents) platformsWithEvents.add(`stocks|${e.platform}`);
  for (const e of cryptoEvents) platformsWithEvents.add(`crypto|${e.platform}`);
  const seedDate = events.length > 0 ? events[0].date : new Date();
  for (const inv of allInvestments) {
    if (inv.costEur == null || inv.costEur <= 0) continue;
    const key = `${inv.type}|${inv.platform ?? ""}`;
    if (platformsWithEvents.has(key)) continue;
    events.push({ date: seedDate, eurDelta: inv.costEur });
  }
  // Re-sort dopo lump-sum push
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Cumulativo per fine mese
  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const cumulativeByMonth = new Map<string, number>();
  let running = 0;
  for (const ev of events) {
    running += ev.eurDelta;
    cumulativeByMonth.set(monthKey(ev.date), running);
  }
  function cumulativeAt(month: Date): number {
    const target = month.getTime();
    let best = 0;
    for (const ev of events) {
      if (ev.date.getTime() <= target) best += ev.eurDelta;
      else break;
    }
    return best;
  }

  const points: { month: string; total: number; isFuture: false }[] = [];
  for (const s of snapshots) {
    const value =
      s.investments != null && s.investments > 0
        ? s.investments
        : cumulativeAt(s.month);
    if (value <= 0) continue;
    points.push({ month: s.month.toISOString(), total: value, isFuture: false });
  }

  // Mese corrente: usa il currentValue effettivo (riflette mark-to-market)
  const currentTotal = allInvestments.reduce((s, i) => s + i.currentValue, 0);
  if (currentTotal > 0) {
    const today = new Date();
    const currentMonthIso = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), 1),
    ).toISOString();
    const last = points[points.length - 1];
    if (last && last.month === currentMonthIso) {
      last.total = currentTotal;
    } else {
      points.push({ month: currentMonthIso, total: currentTotal, isFuture: false });
    }
  }
  return points;
}

export async function getInvestmentsGain() {
  const investments = await prisma.investment.findMany();
  const stockPositions = await prisma.stockPosition.findMany({});
  const cryptoCostBases = await prisma.cryptoCostBasis.findMany({});
  const cryptoPositions = await prisma.cryptoPosition.findMany({});

  const stocksCostEur = stockPositions.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.avgCost * p.fxToEur : s),
    0,
  );
  const stocksValueWithCost = stockPositions.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.currentPrice * p.fxToEur : s),
    0,
  );

  const cryptoCostByPlatformAsset = new Set(
    cryptoCostBases.map((c) => `${c.platform}|${c.asset}`),
  );
  const cryptoCostTotal = cryptoCostBases.reduce((s, c) => s + c.costEur, 0);
  const cryptoValueWithCost = cryptoPositions
    .filter((p) => cryptoCostByPlatformAsset.has(`${p.platform}|${p.asset}`))
    .reduce((s, p) => s + p.eurValue, 0);

  let investmentLevelCost = 0;
  let investmentLevelValue = 0;
  for (const inv of investments) {
    // Coerente con line 58: salta sia null sia ≤0 (cost basis invalido).
    // Senza il check ≤0, un Investment con costEur=0 (corruzione DB o
    // utente che ha azzerato manualmente) inquinerebbe il totale di gain.
    if (inv.costEur == null || inv.costEur <= 0) continue;
    const hasCryptoBreakdown =
      inv.type === "crypto" &&
      cryptoCostBases.some((c) => c.platform === inv.platform);
    if (hasCryptoBreakdown) continue;
    const hasStockBreakdown =
      inv.type === "stocks" && stockPositions.some((p) => p.platform === inv.platform);
    if (hasStockBreakdown) continue;
    investmentLevelCost += inv.costEur;
    investmentLevelValue += inv.currentValue;
  }

  const totalCost = stocksCostEur + cryptoCostTotal + investmentLevelCost;
  const valueOfPriced =
    stocksValueWithCost + cryptoValueWithCost + investmentLevelValue;
  const gain = totalCost > 0 ? valueOfPriced - totalCost : 0;
  const gainPct = totalCost > 0 ? gain / totalCost : 0;
  return { totalCost, gain, gainPct, hasCostData: totalCost > 0 };
}

export async function getInvestments() {
  return prisma.investment.findMany({ orderBy: { currentValue: "desc" } });
}

/**
 * Gain solo sulla parte stocks del portfolio (esclude crypto e altri asset).
 * Usa avgCost+currentPrice in nativa moltiplicati per fxToEur (corrente).
 */
export async function getStocksGain() {
  const stockPositions = await prisma.stockPosition.findMany({});
  let cost = 0;
  let value = 0;
  for (const p of stockPositions) {
    if (p.avgCost == null) continue;
    cost += p.shares * p.avgCost * p.fxToEur;
    value += p.shares * p.currentPrice * p.fxToEur;
  }
  const gain = value - cost;
  const gainPct = cost > 0 ? gain / cost : 0;
  return { cost, value, gain, gainPct, hasCostData: cost > 0 };
}

/**
 * Data della prima transazione confermata in un conto type="investment".
 * Approssima la data del primo trade (può includere crypto se mischiati nello
 * stesso conto — l'utente potrà override-are dalle settings del widget).
 */
export async function getFirstInvestmentTradeDate() {
  const tx = await prisma.transaction.findFirst({
    where: {
      confirmed: true,
      account: { type: "investment" },
    },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return tx?.date.toISOString() ?? null;
}

/**
 * Input per il widget S&P beat: cashflow del trading account (per IRR) +
 * valore finale del portfolio raggruppato per platform.
 *
 * - cashflows: TOP-UP (-) e WITHDRAWAL (+) di tutti i broker importati in DB
 * - finalByPlatform: valore corrente (stocks + cash) per platform
 * - platforms: lista platform disponibili (per il selector nelle settings)
 *
 * Sorgente cashflow: tabella StockTrade (popolata via /impostazioni → upload
 * CSV broker). Universalmente funzionante: niente path hardcoded.
 */
export async function getStockIrrInputs() {
  const events = await prisma.stockTrade.findMany({
    where: { type: { in: ["TOP-UP", "WITHDRAWAL"] } },
    orderBy: { date: "asc" },
  });
  const cashflows = events.map((e) => ({
    date: e.date.toISOString(),
    // Convenzione: TOP-UP = soldi MESSI nell'investimento (negativo da
    // prospettiva investitore), WITHDRAWAL = soldi USCITI (positivo).
    amountEur: e.type === "TOP-UP" ? -e.amountEur : e.amountEur,
    platform: e.platform,
    type: e.type as "TOP-UP" | "WITHDRAWAL",
  }));

  const stockPositions = await prisma.stockPosition.findMany({});
  const tradingCash = await prisma.tradingCash.findMany({});

  const finalByPlatform = new Map<string, number>();
  for (const p of stockPositions) {
    const v = p.shares * p.currentPrice * p.fxToEur;
    finalByPlatform.set(p.platform, (finalByPlatform.get(p.platform) ?? 0) + v);
  }
  for (const c of tradingCash) {
    const v = c.amount * c.fxToEur;
    finalByPlatform.set(c.platform, (finalByPlatform.get(c.platform) ?? 0) + v);
  }

  const platforms = Array.from(
    new Set([
      ...cashflows.map((cf) => cf.platform),
      ...finalByPlatform.keys(),
    ]),
  ).sort();

  return {
    cashflows,
    finalByPlatform: Object.fromEntries(finalByPlatform),
    platforms,
  };
}

/**
 * Helper generico: storico mensile (adjusted close, total return con dividendi
 * reinvestiti via Yahoo) di un qualsiasi ticker. Cached 1h via Next fetch.
 *
 * Usato dal widget S&P Beat per benchmark multipli (SPY index, MDLOX = fondo
 * attivo Larry Fink, BRK-B = Berkshire Buffett).
 *
 * Range: dal 2014 ad oggi (~150 punti, ~5KB JSON per ticker).
 *
 * Nota su FX: prezzi in valuta nativa del ticker. Il portfolio utente usa lo
 * stesso fxToEur per cost+value, quindi il rapporto value/cost è invariante
 * alla FX se la denominazione coincide. SPY/MDLOX/BRK sono tutti USD →
 * confronto apples-to-apples per portfolio prevalentemente USD-denominato.
 */
async function fetchYahooMonthlySeries(ticker: string) {
  const periodStart = Math.floor(
    new Date("2014-01-01T00:00:00Z").getTime() / 1000,
  );
  const periodEnd = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${periodStart}&period2=${periodEnd}&interval=1mo&events=div%2Csplit`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Piggybird/1.0)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart: {
        result?: Array<{
          timestamp: number[];
          indicators: {
            adjclose?: Array<{ adjclose: (number | null)[] }>;
            quote: Array<{ close: (number | null)[] }>;
          };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    if (!r) return null;
    const ts = r.timestamp ?? [];
    const adj = r.indicators.adjclose?.[0]?.adjclose ?? [];
    const close = r.indicators.quote[0].close;
    const prices = adj.length === ts.length ? adj : close;
    const series: { date: string; price: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const p = prices[i];
      if (p == null) continue;
      series.push({ date: new Date(ts[i] * 1000).toISOString(), price: p });
    }
    return series.length >= 2 ? series : null;
  } catch {
    return null;
  }
}

export const getSpyMonthlySeries = () => fetchYahooMonthlySeries("SPY");

/** BlackRock Global Allocation Fund — il flagship attivo di Larry Fink dal 1989. */
export const getMdloxMonthlySeries = () => fetchYahooMonthlySeries("MDLOX");

/** Berkshire Hathaway Class B — proxy per la performance di Warren Buffett.
 *  Nota: ticker Yahoo è BRK-B (con dash), NON BRK.B come si trova altrove. */
export const getBrkbMonthlySeries = () => fetchYahooMonthlySeries("BRK-B");
