/**
 * Macro context per "Piggybird Finance": fetcha dati pubblici free (ECB,
 * Yahoo Finance) e ritorna SOLO quelli rilevanti alla composizione del
 * portafoglio dell'utente. Niente "petrolio sale" se non hai esposizione.
 *
 * Failure-tolerant: se un fetch fallisce o va in timeout, ritorna null per
 * quel signal e continua. Mai bloccante per la generazione del numero.
 */

/** fetch con timeout: i provider macro possono essere lenti; non vogliamo
 * bloccare la generazione del numero per minuti. */
async function fetchWithTimeout(url: string, init?: RequestInit, ms = 5000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export type MacroContext = {
  ecbDepositRatePct: number | null; // ECB Deposit Facility Rate, % annuo
  eurozoneInflationYoyPct: number | null; // HICP all-items YoY %
  eurUsdSpot: number | null; // EUR/USD oggi
  eurUsd1mChangePct: number | null; // delta % vs 30gg fa (positivo = EUR si rafforza)
  sp500_1mChangePct: number | null; // ^GSPC ultimo mese
  btc_1mChangePct: number | null; // BTC-USD ultimo mese
};

type MacroOpts = {
  wantsFx: boolean;
  wantsStocks: boolean;
  wantsCrypto: boolean;
};

export async function fetchMacroContext(opts: MacroOpts): Promise<MacroContext> {
  const tasks: Promise<unknown>[] = [
    fetchEcbDepositRate(),
    fetchEurozoneInflation(),
    opts.wantsFx ? fetchEurUsdHistory() : Promise.resolve(null),
    opts.wantsStocks ? fetch1mChange("^GSPC") : Promise.resolve(null),
    opts.wantsCrypto ? fetch1mChange("BTC-USD") : Promise.resolve(null),
  ];
  const [ecbRate, inflation, eurUsd, sp500, btc] = (await Promise.allSettled(tasks)).map(
    (r) => (r.status === "fulfilled" ? r.value : null),
  );

  const eurUsdData = eurUsd as { spot: number; pct1m: number } | null;
  return {
    ecbDepositRatePct: typeof ecbRate === "number" ? ecbRate : null,
    eurozoneInflationYoyPct: typeof inflation === "number" ? inflation : null,
    eurUsdSpot: eurUsdData?.spot ?? null,
    eurUsd1mChangePct: eurUsdData?.pct1m ?? null,
    sp500_1mChangePct: typeof sp500 === "number" ? sp500 : null,
    btc_1mChangePct: typeof btc === "number" ? btc : null,
  };
}

/** ECB Deposit Facility Rate via SDMX JSON (free, no key). */
async function fetchEcbDepositRate(): Promise<number | null> {
  const url =
    "https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=jsondata&lastNObservations=1";
  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    dataSets?: Array<{ series?: Record<string, { observations?: Record<string, unknown[]> }> }>;
  };
  const series = data.dataSets?.[0]?.series;
  if (!series) return null;
  const firstKey = Object.keys(series)[0];
  const obs = series[firstKey]?.observations;
  if (!obs) return null;
  const firstObsKey = Object.keys(obs)[0];
  const value = obs[firstObsKey]?.[0];
  return typeof value === "number" ? value : null;
}

/** Eurozone HICP All-items YoY %. */
async function fetchEurozoneInflation(): Promise<number | null> {
  const url =
    "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=jsondata&lastNObservations=1";
  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    dataSets?: Array<{ series?: Record<string, { observations?: Record<string, unknown[]> }> }>;
  };
  const series = data.dataSets?.[0]?.series;
  if (!series) return null;
  const firstKey = Object.keys(series)[0];
  const obs = series[firstKey]?.observations;
  if (!obs) return null;
  const firstObsKey = Object.keys(obs)[0];
  const value = obs[firstObsKey]?.[0];
  return typeof value === "number" ? value : null;
}

/** EUR/USD spot + delta 1m via Yahoo (EURUSD=X). */
async function fetchEurUsdHistory(): Promise<{ spot: number; pct1m: number } | null> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=1mo";
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FinanzaPersonale/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta: { regularMarketPrice: number };
        indicators: { quote: Array<{ close: Array<number | null> }> };
      }>;
    };
  };
  const result = data.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((c): c is number => c != null);
  if (!result || !closes || closes.length < 2) return null;
  const first = closes[0];
  const last = result.meta.regularMarketPrice ?? closes[closes.length - 1];
  if (!first) return null;
  return { spot: last, pct1m: ((last - first) / first) * 100 };
}

/** Generic 1m change % via Yahoo chart (used per S&P, BTC). */
async function fetch1mChange(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FinanzaPersonale/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta: { regularMarketPrice: number };
        indicators: { quote: Array<{ close: Array<number | null> }> };
      }>;
    };
  };
  const result = data.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((c): c is number => c != null);
  if (!result || !closes || closes.length < 2) return null;
  const first = closes[0];
  const last = result.meta.regularMarketPrice ?? closes[closes.length - 1];
  if (!first) return null;
  return ((last - first) / first) * 100;
}
