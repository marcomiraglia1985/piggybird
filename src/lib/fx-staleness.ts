import { prisma } from "./prisma";

/**
 * Rileva posizioni di trading con FX rate sospetto:
 *   1. fxToEur === 1.0 exact su currency ≠ EUR → mai aggiornato (default)
 *   2. lastUpdated > 30 giorni AND currency ≠ EUR → rate vecchio
 *
 * Output usato in dashboard per mostrare un alert "FX rates da aggiornare".
 * Senza questo controllo, un portfolio in USD può mostrare valori sballati
 * silenziosamente (es. 100 USD shown as €100 invece di €92).
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type FxStalenessReport = {
  staleCount: number;
  /** Riassunto per UI: lista breve di "TICKER (USD, last updated 2 mesi fa)" */
  examples: string[];
};

export async function getFxStalenessReport(): Promise<FxStalenessReport> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const [stockPositions, tradingCash] = await Promise.all([
    prisma.stockPosition.findMany({
      where: {
        currency: { not: "EUR" },
        OR: [{ fxToEur: 1.0 }, { lastUpdated: { lt: cutoff } }],
      },
      select: { ticker: true, currency: true, lastUpdated: true, fxToEur: true },
    }),
    prisma.tradingCash.findMany({
      where: {
        currency: { not: "EUR" },
        amount: { gt: 0 },
        OR: [{ fxToEur: 1.0 }, { lastUpdated: { lt: cutoff } }],
      },
      select: { platform: true, currency: true, lastUpdated: true, fxToEur: true },
    }),
  ]);

  const examples: string[] = [];
  for (const sp of stockPositions.slice(0, 3)) {
    const reason =
      sp.fxToEur === 1.0
        ? "FX mai impostato"
        : `aggiornato il ${sp.lastUpdated.toLocaleDateString("it-IT")}`;
    examples.push(`${sp.ticker} (${sp.currency}, ${reason})`);
  }
  for (const tc of tradingCash.slice(0, 3 - examples.length)) {
    const reason =
      tc.fxToEur === 1.0
        ? "FX mai impostato"
        : `aggiornato il ${tc.lastUpdated.toLocaleDateString("it-IT")}`;
    examples.push(`Cash ${tc.platform} ${tc.currency} (${reason})`);
  }

  return {
    staleCount: stockPositions.length + tradingCash.length,
    examples,
  };
}
