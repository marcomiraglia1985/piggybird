import crypto from "node:crypto";
import { getCredential, markSynced } from "./credentials";

/**
 * Client Binance Spot REST. Tutte le chiamate signed usano HMAC-SHA256
 * su query string + timestamp.
 */

const BASE = "https://api.binance.com";

type SignedOptions = { method?: "GET" | "POST" };

async function signedRequest<T>(
  path: string,
  params: Record<string, string> = {},
  opts: SignedOptions = {},
): Promise<T> {
  const cred = await getCredential("binance");
  if (!cred) throw new Error("Binance non connesso");

  const qs = new URLSearchParams({
    ...params,
    timestamp: Date.now().toString(),
    recvWindow: "10000",
  });
  const signature = crypto
    .createHmac("sha256", cred.apiSecret)
    .update(qs.toString())
    .digest("hex");
  qs.append("signature", signature);

  const url = `${BASE}${path}?${qs.toString()}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: { "X-MBX-APIKEY": cred.apiKey },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Binance ${path} ${res.status}: ${err}`);
  }
  return (await res.json()) as T;
}

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Binance public ${res.status}`);
  return (await res.json()) as T;
}

export type RawAsset = { asset: string; amount: number; source: WalletSource };

export type WalletSource =
  | "spot"
  | "funding"
  | "earn-flexible"
  | "earn-locked"
  | "margin-cross"
  | "margin-isolated"
  | "futures-usdm"
  | "futures-coinm";

const SOURCE_LABELS: Record<WalletSource, string> = {
  spot: "Spot",
  funding: "Funding",
  "earn-flexible": "Earn Flexible",
  "earn-locked": "Earn Locked",
  "margin-cross": "Cross Margin",
  "margin-isolated": "Isolated Margin",
  "futures-usdm": "USDⓈ-M Futures",
  "futures-coinm": "COIN-M Futures",
};

export function sourceLabel(s: WalletSource): string {
  return SOURCE_LABELS[s] ?? s;
}

/** Spot + Funding wallets via /sapi/v3/asset/getUserAsset (POST). */
async function fetchSpotAndFunding(): Promise<RawAsset[]> {
  const data = await signedRequest<
    { asset: string; free: string; locked: string; freeze: string; withdrawing: string; ipoable: string }[]
  >("/sapi/v3/asset/getUserAsset", {}, { method: "POST" });
  return data
    .map((d) => {
      const total =
        parseFloat(d.free) +
        parseFloat(d.locked) +
        parseFloat(d.freeze) +
        parseFloat(d.withdrawing) +
        parseFloat(d.ipoable);
      return { asset: d.asset, amount: total, source: "spot" as WalletSource };
    })
    .filter((a) => a.amount > 0);
}

/** Simple Earn Flexible. */
async function fetchEarnFlexible(): Promise<RawAsset[]> {
  const data = await signedRequest<{
    rows: { asset: string; totalAmount: string }[];
    total: number;
  }>("/sapi/v1/simple-earn/flexible/position", { size: "100" });
  return data.rows
    .map((r) => ({
      asset: r.asset,
      amount: parseFloat(r.totalAmount),
      source: "earn-flexible" as WalletSource,
    }))
    .filter((a) => a.amount > 0);
}

/** Simple Earn Locked. */
async function fetchEarnLocked(): Promise<RawAsset[]> {
  try {
    const data = await signedRequest<{
      rows: { asset: string; amount: string }[];
      total: number;
    }>("/sapi/v1/simple-earn/locked/position", { size: "100" });
    return data.rows
      .map((r) => ({
        asset: r.asset,
        amount: parseFloat(r.amount),
        source: "earn-locked" as WalletSource,
      }))
      .filter((a) => a.amount > 0);
  } catch {
    return [];
  }
}

/** USD-M Futures wallet (se attivo). */
async function fetchFuturesUsdm(): Promise<RawAsset[]> {
  try {
    const data = await signedRequest<{ asset: string; balance: string }[]>(
      "/fapi/v2/balance",
    );
    return data
      .map((d) => ({
        asset: d.asset,
        amount: parseFloat(d.balance),
        source: "futures-usdm" as WalletSource,
      }))
      .filter((a) => a.amount > 0);
  } catch {
    return [];
  }
}

/** Aggrega tutte le posizioni da tutti i wallet. */
export async function fetchAllPositions(): Promise<RawAsset[]> {
  const results = await Promise.allSettled([
    fetchSpotAndFunding(),
    fetchEarnFlexible(),
    fetchEarnLocked(),
    fetchFuturesUsdm(),
  ]);
  const positions: RawAsset[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") positions.push(...r.value);
  }
  return positions;
}

const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD"]);

export type ValuedPosition = {
  asset: string;
  amount: number;
  eurValue: number;
  source: WalletSource;
  pricedVia: "EUR" | "USDT" | "stablecoin" | "unknown";
};

/** Aggrega tutte le posizioni dai vari wallet, valorizzandole in EUR. */
export async function getCompleteWalletValuation(): Promise<{
  totalEur: number;
  positions: ValuedPosition[];
  bySource: Record<WalletSource, number>;
}> {
  const [rawPositions, prices] = await Promise.all([
    fetchAllPositions(),
    publicRequest<{ symbol: string; price: string }[]>("/api/v3/ticker/price"),
  ]);

  const priceMap = new Map<string, number>();
  for (const p of prices) priceMap.set(p.symbol, parseFloat(p.price));

  const eurUsdt = priceMap.get("EURUSDT");
  const usdtToEur = eurUsdt ? 1 / eurUsdt : null;

  const positions: ValuedPosition[] = [];
  const bySource: Record<string, number> = {};
  let totalEur = 0;

  for (const r of rawPositions) {
    let eurValue = 0;
    let pricedVia: ValuedPosition["pricedVia"] = "unknown";

    if (r.asset === "EUR") {
      eurValue = r.amount;
      pricedVia = "EUR";
    } else if (STABLECOINS.has(r.asset) && usdtToEur) {
      eurValue = r.amount * usdtToEur;
      pricedVia = "stablecoin";
    } else {
      const direct = priceMap.get(`${r.asset}EUR`);
      if (direct) {
        eurValue = r.amount * direct;
        pricedVia = "EUR";
      } else if (usdtToEur) {
        const viaUsdt = priceMap.get(`${r.asset}USDT`);
        if (viaUsdt) {
          eurValue = r.amount * viaUsdt * usdtToEur;
          pricedVia = "USDT";
        }
      }
    }

    totalEur += eurValue;
    bySource[r.source] = (bySource[r.source] ?? 0) + eurValue;
    positions.push({ ...r, eurValue, pricedVia });
  }

  positions.sort((a, b) => b.eurValue - a.eurValue);
  return {
    totalEur,
    positions,
    bySource: bySource as Record<WalletSource, number>,
  };
}

export async function syncBinanceWallet() {
  const result = await getCompleteWalletValuation();
  await markSynced("binance");
  return result;
}

/* ============================================================================
 *  TRADE HISTORY (BUY/SELL spot trades)
 * ============================================================================ */

export type BinanceTrade = {
  id: number;
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
  isBestMatch: boolean;
};

export type BinanceDeposit = {
  id: string;
  amount: string;
  coin: string;
  network: string;
  status: number;
  address: string;
  txId: string;
  insertTime: number;
  transferType: number;
};

export type BinanceWithdraw = {
  id: string;
  amount: string;
  transactionFee: string;
  coin: string;
  status: number;
  address: string;
  txId: string;
  applyTime: string;
  network: string;
  transferType: number;
};

export type BinanceFiatOrder = {
  orderNo: string;
  fiatCurrency: string;
  indicatedAmount: string;
  amount: string;
  totalFee: string;
  method: string;
  status: string;
  createTime: number;
  updateTime: number;
};

/** Lista di info sulle coppie di trading, da exchangeInfo. Cached pubblico. */
type ExchangeSymbol = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
};

async function fetchExchangeSymbols(): Promise<ExchangeSymbol[]> {
  const data = await publicRequest<{ symbols: ExchangeSymbol[] }>(
    "/api/v3/exchangeInfo",
  );
  return data.symbols.filter((s) => s.status === "TRADING");
}

/**
 * Restituisce le coppie da interrogare per ottenere la trade history. Si parte
 * dagli asset attualmente in wallet, si aggiunge una lista di asset comuni
 * (per catturare quelli già completamente venduti), e si filtra exchangeInfo
 * per includere solo coppie esistenti su Binance.
 */
async function buildTradePairs(currentAssets: string[]): Promise<string[]> {
  const popular = [
    "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOT", "MATIC", "LINK",
    "UNI", "AVAX", "DOGE", "SHIB", "TRX", "LTC", "ATOM", "NEAR", "FIL",
    "APE", "OP", "ARB", "PEPE", "FLOKI", "ICP", "ETC", "BCH",
  ];
  const baseSet = new Set<string>([...currentAssets, ...popular]);
  baseSet.delete("EUR");
  baseSet.delete("USDT");
  baseSet.delete("USDC");
  baseSet.delete("BUSD");

  const quotes = ["EUR", "USDT", "USDC", "BUSD", "FDUSD", "BTC", "ETH", "BNB"];

  // exchangeInfo per filtrare le coppie davvero esistenti
  const symbols = await fetchExchangeSymbols();
  const valid = new Set(symbols.map((s) => s.symbol));

  const pairs: string[] = [];
  for (const base of baseSet) {
    for (const quote of quotes) {
      if (base === quote) continue;
      const pair = `${base}${quote}`;
      if (valid.has(pair)) pairs.push(pair);
    }
  }
  return pairs;
}

/**
 * Fetch ALL trades per una specifica coppia. Pagina via fromId (start da 0,
 * incrementa col last id ricevuto). Si ferma quando il batch torna < limit.
 */
async function fetchTradesForPair(symbol: string): Promise<BinanceTrade[]> {
  const all: BinanceTrade[] = [];
  let fromId = 0;
  for (let page = 0; page < 100; page++) {
    const params: Record<string, string> = { symbol, limit: "1000" };
    if (fromId > 0) params.fromId = String(fromId);
    let batch: BinanceTrade[];
    try {
      batch = await signedRequest<BinanceTrade[]>("/api/v3/myTrades", params);
    } catch (e) {
      // Coppia non valida o errore temporaneo: skip
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("400") || msg.includes("Invalid symbol")) return [];
      throw e;
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
    const lastId = batch[batch.length - 1].id;
    fromId = lastId + 1;
  }
  return all;
}

/** Fetch ALL spot trades (per tutte le coppie probabili). */
export async function fetchAllTrades(
  currentAssets: string[],
): Promise<BinanceTrade[]> {
  const pairs = await buildTradePairs(currentAssets);
  const all: BinanceTrade[] = [];
  // Sequenziale per non sforare rate limit (1200 weight/min). 1 trade = ~10w.
  for (const pair of pairs) {
    const t = await fetchTradesForPair(pair);
    if (t.length > 0) all.push(...t);
  }
  return all;
}

/** Crypto deposits (asset entrati in Binance). */
export async function fetchAllDeposits(): Promise<BinanceDeposit[]> {
  const all: BinanceDeposit[] = [];
  // Endpoint richiede un periodo max 90 giorni. Iteriamo a ritroso da oggi
  // fino al 2017 (data di lancio Binance).
  const endMs = Date.now();
  const startMs = new Date("2017-07-01").getTime();
  const WINDOW = 90 * 86400_000;
  for (let cursor = endMs; cursor > startMs; cursor -= WINDOW) {
    const start = Math.max(cursor - WINDOW, startMs);
    try {
      const batch = await signedRequest<BinanceDeposit[]>(
        "/sapi/v1/capital/deposit/hisrec",
        {
          startTime: String(start),
          endTime: String(cursor),
          status: "1",
        },
      );
      if (Array.isArray(batch) && batch.length > 0) all.push(...batch);
    } catch {
      // ignora errori per finestre senza dati
    }
  }
  return all;
}

/** Crypto withdrawals (asset usciti da Binance). */
export async function fetchAllWithdrawals(): Promise<BinanceWithdraw[]> {
  const all: BinanceWithdraw[] = [];
  const endMs = Date.now();
  const startMs = new Date("2017-07-01").getTime();
  const WINDOW = 90 * 86400_000;
  for (let cursor = endMs; cursor > startMs; cursor -= WINDOW) {
    const start = Math.max(cursor - WINDOW, startMs);
    try {
      const batch = await signedRequest<BinanceWithdraw[]>(
        "/sapi/v1/capital/withdraw/history",
        {
          startTime: String(start),
          endTime: String(cursor),
          status: "6",
        },
      );
      if (Array.isArray(batch) && batch.length > 0) all.push(...batch);
    } catch {
      /* ignore */
    }
  }
  return all;
}

/** Fiat (EUR) orders: deposit + withdraw. */
export async function fetchFiatOrders(
  type: "0" | "1",
): Promise<BinanceFiatOrder[]> {
  const all: BinanceFiatOrder[] = [];
  const endMs = Date.now();
  const startMs = new Date("2017-07-01").getTime();
  const WINDOW = 90 * 86400_000;
  for (let cursor = endMs; cursor > startMs; cursor -= WINDOW) {
    const start = Math.max(cursor - WINDOW, startMs);
    try {
      const data = await signedRequest<{
        code: string;
        message: string;
        data: BinanceFiatOrder[];
      }>("/sapi/v1/fiat/orders", {
        transactionType: type,
        beginTime: String(start),
        endTime: String(cursor),
        rows: "500",
      });
      if (Array.isArray(data?.data)) all.push(...data.data);
    } catch {
      /* ignore */
    }
  }
  return all;
}
