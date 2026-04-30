/**
 * ECB reference rates (daily fix). Single source of truth europeo.
 * Endpoint: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 * Aggiornato ogni giorno lavorativo ~16:00 CET. Restituisce i tassi base EUR
 * (1 EUR = X currency).
 */

const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

let cache: { rates: Record<string, number>; date: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function fetchEcbRates(): Promise<{ rates: Record<string, number>; date: string }> {
  const res = await fetch(ECB_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  const xml = await res.text();
  const rates: Record<string, number> = { EUR: 1 };
  const dateMatch = xml.match(/<Cube time=['"](\d{4}-\d{2}-\d{2})['"]/);
  const date = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);
  for (const m of xml.matchAll(/<Cube currency=['"]([A-Z]{3})['"] rate=['"]([\d.]+)['"]/g)) {
    rates[m[1]] = parseFloat(m[2]);
  }
  return { rates, date };
}

export async function getEcbRates(): Promise<{ rates: Record<string, number>; date: string }> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { rates: cache.rates, date: cache.date };
  }
  const fresh = await fetchEcbRates();
  cache = { ...fresh, fetchedAt: Date.now() };
  return fresh;
}

/** Cambio currency → EUR via ECB reference rate. fallback 1 se non trovato. */
export async function ecbFxToEur(currency: string): Promise<number> {
  if (currency === "EUR") return 1;
  const { rates } = await getEcbRates();
  const rate = rates[currency.toUpperCase()];
  if (!rate || !isFinite(rate) || rate === 0) return 1;
  return 1 / rate; // ECB dà "1 EUR = X currency", noi vogliamo "1 currency = Y EUR"
}
