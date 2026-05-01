/**
 * Lista user-facing dei parser bancari supportati. File client-safe (no
 * imports server) — usato dalla UI di /import per mostrare i chip "banche
 * supportate" e dal dispatcher server-side per il routing.
 *
 * Per aggiungere una nuova banca:
 *   1. Crea `./<bank>.ts` con detector (`isXxx`) e parser (`parseXxx`)
 *   2. Aggiungi al `parseAny` in `dispatcher.ts`
 *   3. Aggiungi metadata qui — appare automaticamente in UI
 */

export type DetectedFormat =
  | "revolut"
  | "fineco"
  | "bnp"
  | "n26"
  | "unknown";

export type SupportedBank = {
  format: DetectedFormat;
  name: string;
  flag: string;
};

export const SUPPORTED_BANKS: SupportedBank[] = [
  { format: "revolut", name: "Revolut", flag: "💳" },
  { format: "fineco", name: "Fineco", flag: "🇮🇹" },
  { format: "bnp", name: "BNP Paribas", flag: "🇫🇷" },
  { format: "n26", name: "N26", flag: "🇩🇪" },
];
