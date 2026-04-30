/**
 * Tipo unificato per tutti gli eventi del trading account, qualsiasi broker.
 * I parser specifici (Revolut, Fineco, eToro, ...) producono questo tipo.
 */
export type StockEvent = {
  platform: string; // "Revolut", "Fineco", ...
  /** "BUY" | "SELL" | "TOP-UP" | "WITHDRAWAL" | "DIVIDEND" | "DIVIDEND_TAX" | "STOCK_SPLIT" */
  type: string;
  date: string; // ISO
  ticker: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  /** Magnitudine assoluta in EUR (sempre positiva). Il segno è dato dal type. */
  amountEur: number;
  currency: string;
  fxRate: number;
};

export type ParseResult = {
  ok: true;
  platform: string;
  events: StockEvent[];
} | {
  ok: false;
  error: string;
};

/**
 * Interfaccia che ogni parser broker deve implementare.
 *
 * `detect(csvContent)`: ritorna true se il CSV sembra di questo broker.
 *   Tipicamente confronta l'header con quello atteso.
 *
 * `parse(csvContent)`: parsa e ritorna gli eventi normalizzati.
 */
export type BrokerParser = {
  /** Nome user-facing del broker, es. "Revolut Trading" */
  name: string;
  /** Identificatore platform breve usato come Account.platform, es. "Revolut" */
  platform: string;
  detect: (csv: string) => boolean;
  parse: (csv: string) => ParseResult;
};
