/**
 * Helper price-history per Yahoo (stocks) e Binance (crypto).
 *
 * Fornisce:
 *  - daily klines cached (Yahoo + Binance)
 *  - lookup nearest-close per timestamp
 *  - utilities di tempo (UTC midnight, day-range iterator)
 *  - cryptoPriceEurAt: prezzo EUR di un asset crypto via Binance (con
 *    routing diretto, via USDT, e gestione stablecoins)
 *
 * Cache module-scoped: una sola istanza per processo (perfetto per server-side
 * Next.js); la chiave usa prefix `yh:` / `bn:` per evitare collisioni.
 */

export const MS_DAY = 86_400_000;

/** UTC midnight del giorno (drops time component). */
export function dayStartUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Iterator giornaliero (UTC midnight) tra due timestamp. */
export function* dayRange(fromMs: number, toMs: number): Generator<number> {
  let cur = fromMs;
  while (cur <= toMs) {
    yield cur;
    cur += MS_DAY;
  }
}

/** Trova il close più vicino al timestamp target (binary search). */
export function nearestClose(
  ts: number[],
  close: number[],
  target: number,
): number | null {
  if (ts.length === 0) return null;
  if (target <= ts[0]) return close[0];
  if (target >= ts[ts.length - 1]) return close[ts.length - 1];
  let lo = 0,
    hi = ts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= target) lo = mid;
    else hi = mid;
  }
  return close[lo];
}

const klineCache = new Map<string, { ts: number[]; close: number[] } | null>();

export async function fetchYahooDaily(
  yahooSymbol: string,
): Promise<{ ts: number[]; close: number[] } | null> {
  const cached = klineCache.get(`yh:${yahooSymbol}`);
  if (cached !== undefined) return cached;
  try {
    // Yahoo daily limit ~5y. Per coprire 5+ anni servirebbero più chiamate;
    // accettiamo per ora 5y di storia (sufficiente per holdings recenti).
    const periodStart = Math.floor(new Date("2020-01-01").getTime() / 1000);
    const periodEnd = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${periodStart}&period2=${periodEnd}&interval=1d&events=div%2Csplit`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Piggybird/1.0)" },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      klineCache.set(`yh:${yahooSymbol}`, null);
      return null;
    }
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
    if (!r || !r.timestamp) {
      klineCache.set(`yh:${yahooSymbol}`, null);
      return null;
    }
    const adj = r.indicators.adjclose?.[0]?.adjclose ?? [];
    const close = r.indicators.quote[0].close;
    const prices = adj.length === r.timestamp.length ? adj : close;
    const ts: number[] = [];
    const cs: number[] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const p = prices[i];
      if (p == null) continue;
      ts.push(r.timestamp[i] * 1000);
      cs.push(p);
    }
    const result = { ts, close: cs };
    klineCache.set(`yh:${yahooSymbol}`, result);
    return result;
  } catch {
    klineCache.set(`yh:${yahooSymbol}`, null);
    return null;
  }
}

/** Binance daily klines per simbolo (es. "BTCEUR" o "ETHUSDT"). */
export async function fetchBinanceDaily(
  symbol: string,
): Promise<{ ts: number[]; close: number[] } | null> {
  const cached = klineCache.get(`bn:${symbol}`);
  if (cached !== undefined) return cached;
  try {
    const data: Array<[number, string, string, string, string, ...unknown[]]> = [];
    let startTime = new Date("2017-07-01").getTime();
    const endTime = Date.now();
    while (startTime < endTime) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=1000`;
      const res = await fetch(url, { next: { revalidate: 86_400 } });
      if (!res.ok) break;
      const batch = (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
      if (!Array.isArray(batch) || batch.length === 0) break;
      data.push(...batch);
      const last = batch[batch.length - 1];
      if (batch.length < 1000) break;
      startTime = (typeof last[0] === "number" ? last[0] : 0) + MS_DAY;
    }
    if (data.length === 0) {
      klineCache.set(`bn:${symbol}`, null);
      return null;
    }
    const ts = data.map((k) => k[0]);
    const close = data.map((k) => parseFloat(k[4]));
    const result = { ts, close };
    klineCache.set(`bn:${symbol}`, result);
    return result;
  } catch {
    klineCache.set(`bn:${symbol}`, null);
    return null;
  }
}

/** Prezzo EUR di un asset crypto al timestamp dato (close giornaliero più vicino). */
export async function cryptoPriceEurAt(
  asset: string,
  tsMs: number,
): Promise<number | null> {
  if (asset === "EUR") return 1;
  const stables = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD"]);
  if (stables.has(asset)) {
    const eurUsdt = await fetchBinanceDaily("EURUSDT");
    if (!eurUsdt) return null;
    const v = nearestClose(eurUsdt.ts, eurUsdt.close, tsMs);
    return v != null && v > 0 ? 1 / v : null;
  }
  const direct = await fetchBinanceDaily(`${asset}EUR`);
  if (direct) {
    const v = nearestClose(direct.ts, direct.close, tsMs);
    if (v != null) return v;
  }
  // Via USDT
  const usdt = await fetchBinanceDaily(`${asset}USDT`);
  const eurUsdt = await fetchBinanceDaily("EURUSDT");
  if (usdt && eurUsdt) {
    const a = nearestClose(usdt.ts, usdt.close, tsMs);
    const e = nearestClose(eurUsdt.ts, eurUsdt.close, tsMs);
    if (a != null && e != null && e > 0) return a / e;
  }
  return null;
}
