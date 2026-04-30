/**
 * Wrapper sottile su Yahoo Finance unofficial endpoint.
 * Funziona senza API key. Per uso personale low-traffic.
 */

const BASE = "https://query1.finance.yahoo.com";

export type YahooQuote = {
  symbol: string;
  shortName?: string;
  longName?: string;
  price: number;
  currency: string;
  exchangeName?: string;
};

export async function fetchQuote(ticker: string): Promise<YahooQuote | null> {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FinanzaPersonale/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart: {
      result?: Array<{
        meta: {
          symbol: string;
          regularMarketPrice: number;
          currency: string;
          shortName?: string;
          longName?: string;
          exchangeName?: string;
        };
      }>;
      error?: unknown;
    };
  };
  const result = data.chart?.result?.[0];
  if (!result) return null;
  const m = result.meta;
  return {
    symbol: m.symbol,
    price: m.regularMarketPrice,
    currency: m.currency,
    shortName: m.shortName,
    longName: m.longName,
    exchangeName: m.exchangeName,
  };
}

/**
 * Cambio currency → EUR. Restituisce 1 se già EUR.
 * Usa ECB reference rate (single source of truth europeo, allineato a banche EU).
 * Fallback su Yahoo se ECB non risponde.
 */
export async function fxToEur(currency: string): Promise<number> {
  if (currency === "EUR") return 1;
  try {
    const { ecbFxToEur } = await import("./ecb-fx");
    const rate = await ecbFxToEur(currency);
    if (rate && isFinite(rate) && rate !== 1) return rate;
  } catch {
    /* fall through to Yahoo */
  }
  const symbol = `${currency}EUR=X`;
  const q = await fetchQuote(symbol);
  if (!q || !isFinite(q.price)) return 1;
  return q.price;
}

export async function fetchQuoteWithEur(
  ticker: string,
): Promise<(YahooQuote & { fxToEur: number; eurPrice: number }) | null> {
  const q = await fetchQuote(ticker);
  if (!q) return null;
  const fx = await fxToEur(q.currency);
  return { ...q, fxToEur: fx, eurPrice: q.price * fx };
}
