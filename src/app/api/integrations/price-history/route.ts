import { NextRequest, NextResponse } from "next/server";
import { yahooFor } from "@/lib/yahoo-ticker-map";
import { fxToEur } from "@/lib/yahoo-finance";

export const runtime = "nodejs";

/**
 * Storico prezzi per asset (stock o crypto). Restituisce array di
 * { date: ISO, close: number_in_eur }.
 *
 * Query:
 *  - symbol: ticker (AAPL, BTC, ETH, VUSA, ecc.)
 *  - kind: "stock" | "crypto"
 *  - range: "1mo" | "3mo" | "6mo" | "1y" | "5y" | "max"  (default 1y)
 *  - currency: valuta nativa (per crypto USDT default, per stock dipende da Yahoo)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const kind = (searchParams.get("kind") as "stock" | "crypto") ?? "stock";
  const range = searchParams.get("range") ?? "1y";
  if (!symbol) return NextResponse.json({ error: "symbol mancante" }, { status: 400 });

  if (kind === "crypto") {
    return await fetchCrypto(symbol, range);
  }
  return await fetchStock(symbol, range);
}

async function fetchStock(symbol: string, range: string) {
  const yahooSym = yahooFor(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoneybirdFinance/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: `Yahoo ${res.status}` }, { status: 502 });
  const json = (await res.json()) as {
    chart: {
      result?: Array<{
        meta: { currency: string };
        timestamp: number[];
        indicators: {
          quote: Array<{
            open: (number | null)[];
            high: (number | null)[];
            low: (number | null)[];
            close: (number | null)[];
          }>;
        };
      }>;
    };
  };
  const r = json.chart?.result?.[0];
  if (!r) return NextResponse.json({ error: "no data" }, { status: 404 });
  const currency = r.meta.currency.toUpperCase();
  const fx = currency === "EUR" ? 1 : await fxToEur(currency);
  const q = r.indicators.quote[0];
  const series = r.timestamp
    .map((ts, i) => {
      const o = q.open[i],
        h = q.high[i],
        l = q.low[i],
        c = q.close[i];
      if (o == null || h == null || l == null || c == null) return null;
      return {
        date: new Date(ts * 1000).toISOString(),
        open: o * fx,
        high: h * fx,
        low: l * fx,
        close: c * fx,
      };
    })
    .filter(Boolean);
  return NextResponse.json({ symbol, currency, fxToEur: fx, series, source: "yahoo" });
}

async function fetchCrypto(symbol: string, range: string) {
  // Map range → klines limit + interval (giornaliero per ranges fino a 1y, weekly per più lunghi)
  const today = Date.now();
  let interval = "1d";
  let startMs = today - 365 * 86400 * 1000;
  if (range === "1mo") startMs = today - 30 * 86400 * 1000;
  else if (range === "3mo") startMs = today - 90 * 86400 * 1000;
  else if (range === "6mo") startMs = today - 180 * 86400 * 1000;
  else if (range === "1y") startMs = today - 365 * 86400 * 1000;
  else if (range === "5y") {
    startMs = today - 5 * 365 * 86400 * 1000;
    interval = "1w";
  } else if (range === "max") {
    startMs = today - 10 * 365 * 86400 * 1000;
    interval = "1w";
  }

  const limit = 1000;
  const tryPair = async (quote: string) => {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}${quote}&interval=${interval}&startTime=${startMs}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
  };

  type Series = Array<{ date: string; open: number; high: number; low: number; close: number }>;
  function toSeriesOhlc(
    klines: Array<[number, string, string, string, string, ...unknown[]]>,
    fx: number,
  ): Series {
    return klines.map((k) => ({
      date: new Date(k[0]).toISOString(),
      open: parseFloat(k[1]) * fx,
      high: parseFloat(k[2]) * fx,
      low: parseFloat(k[3]) * fx,
      close: parseFloat(k[4]) * fx,
    }));
  }

  // Prova prima ASSET-EUR poi ASSET-USDT con conversione
  const eurData = await tryPair("EUR");
  if (eurData && eurData.length > 0) {
    return NextResponse.json({
      symbol,
      currency: "EUR",
      fxToEur: 1,
      series: toSeriesOhlc(eurData, 1),
      source: "binance",
    });
  }
  const usdtData = await tryPair("USDT");
  if (usdtData && usdtData.length > 0) {
    const usdtEur = await fxToEur("USD");
    return NextResponse.json({
      symbol,
      currency: "USDT",
      fxToEur: usdtEur,
      series: toSeriesOhlc(usdtData, usdtEur),
      source: "binance",
    });
  }
  return NextResponse.json({ error: "no data" }, { status: 404 });
}
