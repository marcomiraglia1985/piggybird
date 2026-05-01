import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { yahooFor } from "@/lib/yahoo-ticker-map";
import {
  cryptoPriceEurAt,
  dayRange,
  dayStartUtc,
  fetchBinanceDaily,
  fetchYahooDaily,
  nearestClose,
} from "@/lib/price-history";

/**
 * Storico mensile del valore mark-to-market del portafoglio investimenti.
 *
 * Strategia:
 *   1. Per ogni asset (stock o crypto), ricostruisce le HOLDINGS a fine di
 *      ogni mese partendo dalle posizioni CORRENTI (StockPosition /
 *      CryptoPosition) e "ribobinando" all'indietro tramite i trade events
 *      (StockTrade BUY/SELL, CryptoTrade buy/sell). In questo modo il punto
 *      "now" è sempre allineato col valore live, e i punti passati riflettono
 *      le quantità realmente possedute (per la parte coperta da trade events).
 *   2. Per ogni mese, moltiplica holdings × prezzo storico (Yahoo per stocks,
 *      Binance klines per crypto) e somma tutto in EUR.
 *
 * Limitazioni:
 *   - Per asset con holdings correnti ma senza event log completo (es. crypto
 *     trasferiti via deposit da altro exchange), le holdings storiche
 *     restano costanti = current_holdings. Il chart approssima questa parte.
 *   - I prezzi sono close-of-month (da daily/monthly klines).
 *   - FX storica: per stocks USD-denominati usiamo il rate corrente come
 *     proxy (l'errore è < 5% su orizzonte 2 anni, accettabile per visual chart).
 */

export type HistoryPoint = {
  /** ISO date dell'osservazione (granularità giornaliera). Il campo si chiama
   *  ancora "month" per backward-compat col chart, ma è una data piena. */
  month: string;
  total: number;
  /** Cost basis cumulativo: net cash deployed = stocks TOP-UP-WITHDRAWAL +
   *  crypto buys-sells + lump sum platforms (Binance). Permette di mostrare
   *  gain/loss nello stesso chart confrontando total vs costBasis. */
  costBasis: number;
  isFuture: false;
};

/**
 * Computa signature hash di tutti i dati input che impattano il calcolo
 * della history. Stesso hash → safe cache hit. Diverso hash → ricalcolo.
 *
 * Include: tutte le posizioni, tutti i trade, tutti i cost basis, tutte le
 * Investment con costEur/currentValue. Anche `Date.now()` rounded a 1h
 * (perché il "punto oggi" del chart usa currentValue + currentPrice che
 * possono cambiare, e vogliamo refresh ogni ora minimo).
 */
async function computeInputSignature(): Promise<string> {
  const [
    stockPositions,
    stockTrades,
    cryptoPositions,
    cryptoTrades,
    cryptoCostBases,
    investments,
  ] = await Promise.all([
    prisma.stockPosition.findMany({
      select: { ticker: true, shares: true, avgCost: true, currentPrice: true, fxToEur: true, platform: true },
      orderBy: [{ platform: "asc" }, { ticker: "asc" }],
    }),
    prisma.stockTrade.findMany({
      select: { id: true, date: true, type: true, ticker: true, quantity: true, pricePerUnit: true, amountEur: true, fxRate: true, platform: true },
      orderBy: { date: "asc" },
    }),
    prisma.cryptoPosition.findMany({
      select: { asset: true, amount: true, eurValue: true, platform: true },
      orderBy: [{ platform: "asc" }, { asset: "asc" }],
    }),
    prisma.cryptoTrade.findMany({
      select: { id: true, date: true, direction: true, asset: true, quantity: true, totalEur: true, platform: true },
      orderBy: { date: "asc" },
    }),
    prisma.cryptoCostBasis.findMany({
      select: { platform: true, asset: true, costEur: true },
      orderBy: [{ platform: "asc" }, { asset: "asc" }],
    }),
    prisma.investment.findMany({
      select: { type: true, platform: true, costEur: true, currentValue: true },
      orderBy: [{ type: "asc" }, { platform: "asc" }],
    }),
  ]);
  // Includo anche l'hour bucket corrente: "current value" può cambiare
  // intraday (currentPrice), vogliamo refresh max 1 volta/ora.
  const hourBucket = Math.floor(Date.now() / (3600 * 1000));
  const payload = JSON.stringify({
    stockPositions,
    stockTrades,
    cryptoPositions,
    cryptoTrades,
    cryptoCostBases,
    investments,
    hourBucket,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * Invalida esplicitamente la cache (es. dopo sync API che ha aggiornato i
 * prezzi correnti). Dopo questa chiamata il prossimo getInvestmentsHistoryV2
 * forza il ricalcolo.
 */
export async function invalidateInvestmentsHistoryCache(): Promise<void> {
  await prisma.investmentsHistoryCache
    .delete({ where: { id: "current" } })
    .catch(() => null);
}

export async function getInvestmentsHistoryV2(): Promise<HistoryPoint[]> {
  // Cache lookup via signature hash dei dati input
  const signature = await computeInputSignature();
  const cached = await prisma.investmentsHistoryCache
    .findUnique({ where: { id: "current" } })
    .catch(() => null);
  if (cached && cached.signature === signature) {
    try {
      return JSON.parse(cached.history) as HistoryPoint[];
    } catch {
      // Cache corrupted: fall through al recompute
    }
  }

  // Cache miss → recompute
  const startMs = Date.now();
  const result = await computeHistoryFromScratch();
  const elapsedMs = Date.now() - startMs;

  // Save to cache (upsert per signature singleton)
  await prisma.investmentsHistoryCache
    .upsert({
      where: { id: "current" },
      create: {
        id: "current",
        signature,
        history: JSON.stringify(result),
        computeMs: elapsedMs,
      },
      update: {
        signature,
        history: JSON.stringify(result),
        computeMs: elapsedMs,
      },
    })
    .catch((e) => {
      console.warn("[investments-history] cache save failed:", e);
    });

  console.log(
    `[investments-history] computed in ${elapsedMs}ms (sig=${signature.slice(0, 8)}, points=${result.length})`,
  );
  return result;
}

async function computeHistoryFromScratch(): Promise<HistoryPoint[]> {
  const [stockPositions, stockTrades, cryptoPositions, cryptoTrades, allInvestments] =
    await Promise.all([
      prisma.stockPosition.findMany({}),
      prisma.stockTrade.findMany({
        where: { type: { in: ["BUY", "SELL", "TOP-UP", "WITHDRAWAL"] } },
        orderBy: { date: "asc" },
      }),
      prisma.cryptoPosition.findMany({}),
      prisma.cryptoTrade.findMany({ orderBy: { date: "asc" } }),
      prisma.investment.findMany({
        select: { type: true, platform: true, costEur: true, currentValue: true },
      }),
    ]);

  // === HOLDINGS CORRENTI (anchor) ===
  const currentShares = new Map<string, number>();
  const tickerFx = new Map<string, number>();
  for (const p of stockPositions) {
    currentShares.set(p.ticker, (currentShares.get(p.ticker) ?? 0) + p.shares);
    tickerFx.set(p.ticker, p.fxToEur);
  }
  for (const t of stockTrades) {
    if (!t.ticker) continue;
    if (!currentShares.has(t.ticker)) {
      currentShares.set(t.ticker, 0);
      tickerFx.set(t.ticker, t.fxRate ?? 1);
    }
  }

  const currentCryptoQty = new Map<string, number>();
  for (const p of cryptoPositions) {
    currentCryptoQty.set(p.asset, (currentCryptoQty.get(p.asset) ?? 0) + p.amount);
  }
  for (const t of cryptoTrades) {
    if (!currentCryptoQty.has(t.asset)) currentCryptoQty.set(t.asset, 0);
  }

  // === COST BASIS POSITION-LEVEL (allineato col box "Unrealized P/L") ===
  //
  // Stocks: per ogni ticker, avg-cost accounting su BUY/SELL events.
  //   - BUY:  avgCost = (oldShares*oldAvg + qty*price*fx) / (oldShares+qty); shares += qty
  //   - SELL: shares -= qty (avgCost invariato — il cost dei venduti è "realized")
  //   cost_at_T = sum(shares_T × avgCost_T)  per tickers held a T
  //
  // Crypto: per ogni piattaforma, scegliere in ordine di preferenza:
  //   1. CryptoCostBasis (per asset, sommato — più dettagliato)
  //   2. Investment.costEur (per piattaforma, aggregato manuale)
  //   3. Cumulative buy-sell totalEur dai CryptoTrade events (fallback puro
  //      da dati API/CSV — vanilla user senza override manuali)
  //   Anchored al primo evento (anche deposit) per quella platform.
  //
  // Output: costAtDay(dayMs) → cost basis totale al giorno T (stocks + crypto).

  // ---- STOCKS: pre-compute avg-cost evolution ----
  // avgCost tenuta in CURRENCY NATIVA (di solito USD), poi convertita in EUR
  // al display usando il fxToEur CORRENTE della posizione (matching top box).
  type StockSnap = { dayMs: number; cost: number };
  const stockCostTimeline: StockSnap[] = [];
  const stockState = new Map<
    string,
    { shares: number; avgCostNative: number }
  >();
  const buySellAsc = stockTrades
    .filter(
      (t) =>
        (t.type === "BUY" || t.type === "SELL") &&
        t.ticker &&
        t.quantity != null &&
        t.quantity > 0,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  function totalStockCost(): number {
    let tot = 0;
    for (const [tk, s] of stockState) {
      if (s.shares <= 0) continue;
      const fx = tickerFx.get(tk) ?? 1;
      tot += s.shares * s.avgCostNative * fx;
    }
    return tot;
  }

  for (const t of buySellAsc) {
    const tk = t.ticker!;
    const cur = stockState.get(tk) ?? { shares: 0, avgCostNative: 0 };
    const qty = t.quantity!;
    const priceNative = t.pricePerUnit ?? 0;
    if (t.type === "BUY") {
      const newShares = cur.shares + qty;
      const newAvg =
        newShares > 0
          ? (cur.shares * cur.avgCostNative + qty * priceNative) / newShares
          : 0;
      stockState.set(tk, { shares: newShares, avgCostNative: newAvg });
    } else {
      // SELL: avgCostNative invariato, shares -= qty (cost realizzato "stacca")
      const newShares = Math.max(0, cur.shares - qty);
      stockState.set(tk, {
        shares: newShares,
        avgCostNative: cur.avgCostNative,
      });
    }
    stockCostTimeline.push({
      dayMs: dayStartUtc(t.date),
      cost: totalStockCost(),
    });
  }

  // ---- CRYPTO: per platform cost basis con priorità CCB > Investment > events ----
  const cryptoCostBases = await prisma.cryptoCostBasis.findMany();
  const ccbByPlatform = new Map<string, number>();
  for (const c of cryptoCostBases) {
    const k = `crypto|${c.platform}`;
    ccbByPlatform.set(k, (ccbByPlatform.get(k) ?? 0) + c.costEur);
  }
  const investCostByPlatform = new Map<string, number>();
  for (const inv of allInvestments) {
    if (inv.type !== "crypto" || inv.costEur == null || inv.costEur <= 0) continue;
    investCostByPlatform.set(`crypto|${inv.platform ?? ""}`, inv.costEur);
  }

  // First event per platform (per anchor temporale)
  const firstEventByPlatform = new Map<string, number>();
  for (const e of cryptoTrades) {
    const k = `crypto|${e.platform}`;
    const dms = dayStartUtc(e.date);
    if (!firstEventByPlatform.has(k) || dms < firstEventByPlatform.get(k)!) {
      firstEventByPlatform.set(k, dms);
    }
  }

  // Tutte le piattaforme menzionate (ovunque)
  const allCryptoPlatforms = new Set<string>([
    ...ccbByPlatform.keys(),
    ...investCostByPlatform.keys(),
    ...firstEventByPlatform.keys(),
  ]);

  // Eventi cost-basis crypto (lump constants + cumulative-event-fallback)
  type Cf = { dayMs: number; eur: number };
  const cryptoCostEvents: Cf[] = [];
  for (const k of allCryptoPlatforms) {
    const ccb = ccbByPlatform.get(k);
    const inv = investCostByPlatform.get(k);
    const anchor = firstEventByPlatform.get(k) ?? dayStartUtc(new Date());
    if (ccb && ccb > 0) {
      // Tier 1: CryptoCostBasis manuale (più affidabile, override esplicito)
      cryptoCostEvents.push({ dayMs: anchor, eur: ccb });
    } else if (inv && inv > 0) {
      // Tier 2: Investment.costEur manuale (aggregato platform-level)
      cryptoCostEvents.push({ dayMs: anchor, eur: inv });
    } else {
      // Tier 3: cumulative buy-sell da CryptoTrade events (puro CSV/API)
      for (const e of cryptoTrades) {
        if (`crypto|${e.platform}` !== k) continue;
        if (e.totalEur === 0) continue;
        cryptoCostEvents.push({
          dayMs: dayStartUtc(e.date),
          eur: e.direction === "buy" ? e.totalEur : -e.totalEur,
        });
      }
    }
  }
  cryptoCostEvents.sort((a, b) => a.dayMs - b.dayMs);

  // Helper: cost basis totale al giorno T (stocks + crypto)
  function costAtDay(dayMs: number): number {
    // Stocks: ultimo snapshot ≤ dayMs (avg-cost timeline)
    let stockCost = 0;
    for (const s of stockCostTimeline) {
      if (s.dayMs <= dayMs) stockCost = s.cost;
      else break;
    }
    // Crypto: cumulative ≤ dayMs su lump+events
    let cryptoCost = 0;
    for (const e of cryptoCostEvents) {
      if (e.dayMs <= dayMs) cryptoCost += e.eur;
      else break;
    }
    return stockCost + cryptoCost;
  }

  // === TICKER/CRYPTO TRADE EVENTS sorted asc per replay forward ===
  const tickerTrades = stockTrades
    .filter((t) => (t.type === "BUY" || t.type === "SELL") && t.ticker && t.quantity != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const cryptoEventsAsc = [...cryptoTrades].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Per ribobinare correttamente: holdings_at_day_D = currentHoldings
  //   - sum(BUY events with date > D) + sum(SELL events with date > D)
  // Equivalente: parto da current, scorro events asc e applico delta ad ogni day
  // walk forward; ma il risultato finale = current. Per holdings al passato uso
  // current - delta_after.
  // Ottimizzazione: precomputiamo "delta_after_day_D" iterando una sola volta,
  // poi per ogni giorno applichiamo lookup.

  // Range: dal primo evento (cost o trade) ad oggi
  const allEventTs: number[] = [
    ...stockCostTimeline.map((c) => c.dayMs),
    ...cryptoCostEvents.map((c) => c.dayMs),
    ...tickerTrades.map((t) => dayStartUtc(t.date)),
    ...cryptoEventsAsc.map((c) => dayStartUtc(c.date)),
  ];
  if (allEventTs.length === 0) return [];
  const fromMs = Math.min(...allEventTs);
  const toMs = dayStartUtc(new Date());

  // === Pre-fetch storico prezzi ===
  const yahooByTicker = new Map<string, { ts: number[]; close: number[] } | null>();
  await Promise.all(
    [...currentShares.keys()].map(async (t) => {
      const yahoo = yahooFor(t);
      yahooByTicker.set(t, await fetchYahooDaily(yahoo));
    }),
  );

  // Pre-fetch crypto klines for each asset (sequential to avoid rate limiting)
  for (const asset of currentCryptoQty.keys()) {
    if (asset === "EUR") continue;
    // priming via cryptoPriceEurAt cache
    await cryptoPriceEurAt(asset, toMs);
  }
  // Prime EURUSDT for FX
  await fetchBinanceDaily("EURUSDT");

  // === BUILD: walk day-by-day ===
  const points: HistoryPoint[] = [];

  // State per cost basis: cumulative running, decremento solo quando il day
  // attraversa un evento.
  // Per holdings: parto da current e ribobino indietro (ma è più semplice
  // andare forward dalla data di start).

  // Forward replay: parto da tutti zero, applico events fino ad oggi.
  // Più affidabile e identico al risultato.
  const sharesNow = new Map<string, number>();
  for (const t of currentShares.keys()) sharesNow.set(t, 0);
  const cryptoNow = new Map<string, number>();
  for (const a of currentCryptoQty.keys()) cryptoNow.set(a, 0);

  // Eventi indicizzati per dayMs ascendente
  const tickerByDay = new Map<number, typeof tickerTrades>();
  for (const t of tickerTrades) {
    const d = dayStartUtc(t.date);
    const arr = tickerByDay.get(d) ?? [];
    arr.push(t);
    tickerByDay.set(d, arr);
  }
  const cryptoByDay = new Map<number, typeof cryptoEventsAsc>();
  for (const t of cryptoEventsAsc) {
    const d = dayStartUtc(t.date);
    const arr = cryptoByDay.get(d) ?? [];
    arr.push(t);
    cryptoByDay.set(d, arr);
  }

  // Per holdings non coperti da event log (es. crypto Binance che arriva via
  // deposit), forziamo il match al "current" alla fine del replay aggiungendo
  // un adjustment al primo giorno. Calcoliamo il delta a fine replay e lo
  // pre-aggiungiamo come "anchor" al giorno earliestEventMs.
  // Stocks: è completo (BUY/SELL = current), nessun adjustment.
  // Crypto: replay manca dei deposit → adjustment necessario per ogni asset.
  const cryptoReplayFinal = new Map<string, number>();
  for (const a of cryptoNow.keys()) cryptoReplayFinal.set(a, 0);
  for (const t of cryptoEventsAsc) {
    const cur = cryptoReplayFinal.get(t.asset) ?? 0;
    const delta = t.direction === "buy" ? t.quantity : -t.quantity;
    cryptoReplayFinal.set(t.asset, cur + delta);
  }
  const cryptoAnchorAdjust = new Map<string, number>();
  for (const [a, target] of currentCryptoQty.entries()) {
    const replayed = cryptoReplayFinal.get(a) ?? 0;
    const adjust = target - replayed;
    if (Math.abs(adjust) > 1e-12) cryptoAnchorAdjust.set(a, adjust);
  }

  // Stesso per stocks: shares correnti vs replay finale
  const stocksReplayFinal = new Map<string, number>();
  for (const t of currentShares.keys()) stocksReplayFinal.set(t, 0);
  for (const t of tickerTrades) {
    if (!t.ticker || t.quantity == null) continue;
    const cur = stocksReplayFinal.get(t.ticker) ?? 0;
    const delta = t.type === "BUY" ? t.quantity : -t.quantity;
    stocksReplayFinal.set(t.ticker, cur + delta);
  }
  const stockAnchorAdjust = new Map<string, number>();
  for (const [tk, target] of currentShares.entries()) {
    const replayed = stocksReplayFinal.get(tk) ?? 0;
    const adjust = target - replayed;
    if (Math.abs(adjust) > 1e-9) stockAnchorAdjust.set(tk, adjust);
  }

  // Helper: prezzo EUR di un ticker al timestamp (cache lookup)
  function stockPriceEur(ticker: string, ms: number): number | null {
    const k = yahooByTicker.get(ticker);
    if (!k) return null;
    const native = nearestClose(k.ts, k.close, ms);
    if (native == null) return null;
    const fx = tickerFx.get(ticker) ?? 1;
    return native * fx;
  }

  // Apply anchor adjustment al primo giorno (così holdings_at_day_0 è già
  // allineato al "passato implicito" non coperto da event log)
  const firstDay = fromMs;

  for (const dayMs of dayRange(fromMs, toMs)) {
    // Anchor injection nel primo giorno
    if (dayMs === firstDay) {
      for (const [a, adj] of cryptoAnchorAdjust)
        cryptoNow.set(a, (cryptoNow.get(a) ?? 0) + adj);
      for (const [tk, adj] of stockAnchorAdjust)
        sharesNow.set(tk, (sharesNow.get(tk) ?? 0) + adj);
    }

    // Apply events di OGGI
    const tT = tickerByDay.get(dayMs);
    if (tT) {
      for (const t of tT) {
        if (!t.ticker || t.quantity == null) continue;
        const cur = sharesNow.get(t.ticker) ?? 0;
        const d = t.type === "BUY" ? t.quantity : -t.quantity;
        sharesNow.set(t.ticker, cur + d);
      }
    }
    const tC = cryptoByDay.get(dayMs);
    if (tC) {
      for (const t of tC) {
        const cur = cryptoNow.get(t.asset) ?? 0;
        const d = t.direction === "buy" ? t.quantity : -t.quantity;
        cryptoNow.set(t.asset, cur + d);
      }
    }
    // Compute portfolio total
    let total = 0;
    let counted = false;
    for (const [tk, sh] of sharesNow) {
      if (sh <= 0) continue;
      const px = stockPriceEur(tk, dayMs);
      if (px != null) {
        total += sh * px;
        counted = true;
      }
    }
    for (const [a, qty] of cryptoNow) {
      if (qty <= 0) continue;
      const px = await cryptoPriceEurAt(a, dayMs);
      if (px != null) {
        total += qty * px;
        counted = true;
      }
    }

    if (counted && total > 0) {
      points.push({
        month: new Date(dayMs).toISOString(),
        total,
        costBasis: costAtDay(dayMs),
        isFuture: false,
      });
    }
  }

  // Last point: allinea col "Valore totale" del box sopra il chart.
  // Il box mostra Investment.currentValue total (include TradingCash idle del
  // broker), il chart day-by-day calcolerebbe solo position-value (senza cash).
  // Diff = liveTotal - positionedNow = cash idle non-position-tracked.
  // Aggiungiamo questo delta SIA al total SIA al costBasis dell'ultimo punto:
  // la cash è "fully recovered" cioè value = cost → P/L invariato sul cash, e
  // il chart oggi mostra esattamente lo stesso totale del box.
  if (points.length > 0) {
    const last = points[points.length - 1];
    const liveTotal = allInvestments.reduce((s, i) => s + i.currentValue, 0);
    if (liveTotal > 0) {
      const cashIdle = Math.max(0, liveTotal - last.total);
      last.total = liveTotal;
      last.costBasis += cashIdle;
    }
  }

  return points;
}

/** Indica se l'utente ha sufficient data per generare il chart. */
export async function hasInvestmentData(): Promise<{
  hasStocks: boolean;
  hasCrypto: boolean;
  hasAny: boolean;
}> {
  const [stockCount, cryptoCount, investmentCount] = await Promise.all([
    prisma.stockTrade.count({ where: { type: { in: ["BUY", "SELL"] } } }),
    prisma.cryptoTrade.count(),
    prisma.investment.count({ where: { currentValue: { gt: 0 } } }),
  ]);
  return {
    hasStocks: stockCount > 0,
    hasCrypto: cryptoCount > 0,
    hasAny: stockCount + cryptoCount + investmentCount > 0,
  };
}
