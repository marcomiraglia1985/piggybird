/**
 * Mapping ticker Revolut → Yahoo Finance symbol.
 * Necessario perché Revolut usa codici "puliti" (VUSA, XAU) mentre Yahoo
 * richiede il suffisso di piazza (.AS, .DE, .L) o un simbolo futures (GC=F).
 */
export const YAHOO_TICKER_MAP: Record<string, string> = {
  // Metalli (futures)
  XAU: "GC=F",
  XAG: "SI=F",
  XPT: "PL=F",
  XPD: "PA=F",
  // ETF UCITS — usa la piazza che matcha la valuta in cui sono stati acquistati
  VUSA: "VUSA.AS", // Amsterdam, EUR (non Londra che è GBP)
  ESP0: "ESP0.DE",
  IS3Q: "IS3Q.DE",
  "2B76": "2B76.DE",
  SEJ1: "SEJ1.DE",
};

export function yahooFor(ticker: string): string {
  return YAHOO_TICKER_MAP[ticker] ?? ticker;
}
