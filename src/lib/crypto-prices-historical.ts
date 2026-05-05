/**
 * Prezzi crypto storici via Binance public klines API (no auth, no rate
 * limit per uso normale). Usato per backfill di CryptoTrade.totalEur quando
 * l'import API ha lasciato 0 (tipico per coppie crypto-to-crypto dove il
 * rate EUR storico al momento del trade non era disponibile).
 *
 * Strategia di fallback:
 *   1. Direct ASSET+EUR (es. BTCEUR, ETHEUR)
 *   2. Via USDT bridge: ASSET+USDT × USDT/EUR
 *   3. null se nemmeno questo riesce
 *
 * Cache in-memory dei klines per ridurre roundtrip API.
 */

const klineCache = new Map<string, { ts: number[]; close: number[] }>();

export async function loadDailyKlines(
  symbol: string,
): Promise<{ ts: number[]; close: number[] } | null> {
  const cached = klineCache.get(symbol);
  if (cached) return cached;
  try {
    const data: Array<[number, string, string, string, string, ...unknown[]]> = [];
    let startTime = new Date("2017-07-01").getTime();
    const endTime = Date.now();
    while (startTime < endTime) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const batch = (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
      if (!Array.isArray(batch) || batch.length === 0) break;
      data.push(...batch);
      const last = batch[batch.length - 1];
      const lastTs = typeof last[0] === "number" ? last[0] : 0;
      if (batch.length < 1000) break;
      startTime = lastTs + 86400_000;
    }
    if (data.length === 0) return null;
    const ts = data.map((k) => k[0]);
    const close = data.map((k) => parseFloat(k[4]));
    const result = { ts, close };
    klineCache.set(symbol, result);
    return result;
  } catch {
    return null;
  }
}

function nearestIdx(ts: number[], target: number): number {
  if (ts.length === 0) return 0;
  if (target <= ts[0]) return 0;
  if (target >= ts[ts.length - 1]) return ts.length - 1;
  let lo = 0;
  let hi = ts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

const STABLES = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD"]);

export async function priceEurAt(asset: string, tsMs: number): Promise<number | null> {
  if (asset === "EUR") return 1;
  if (STABLES.has(asset)) {
    const eurUsdt = await loadDailyKlines("EURUSDT");
    if (!eurUsdt) return null;
    const idx = nearestIdx(eurUsdt.ts, tsMs);
    const rate = eurUsdt.close[idx];
    return rate > 0 ? 1 / rate : null;
  }
  // Direct ASSET-EUR
  const direct = await loadDailyKlines(`${asset}EUR`);
  if (direct) {
    const idx = nearestIdx(direct.ts, tsMs);
    const p = direct.close[idx];
    if (p > 0) return p;
  }
  // Via USDT
  const usdt = await loadDailyKlines(`${asset}USDT`);
  const eurUsdt = await loadDailyKlines("EURUSDT");
  if (usdt && eurUsdt) {
    const i1 = nearestIdx(usdt.ts, tsMs);
    const i2 = nearestIdx(eurUsdt.ts, tsMs);
    const aUsdt = usdt.close[i1];
    const eu = eurUsdt.close[i2];
    if (aUsdt > 0 && eu > 0) return aUsdt / eu;
  }
  return null;
}
