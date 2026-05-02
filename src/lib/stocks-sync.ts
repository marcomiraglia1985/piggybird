import { prisma } from "./prisma";
import { fetchQuoteWithEur } from "./yahoo-finance";
import { yahooFor } from "./yahoo-ticker-map";

/**
 * Aggiorna il valore "Stocks Revolut" (o altro platform) nella tabella Investment
 * sommando tutte le posizioni in EUR.
 */
export async function syncStocksTotal(platform: string) {
  const [positions, cashRows] = await Promise.all([
    prisma.stockPosition.findMany({ where: { platform } }),
    prisma.tradingCash.findMany({ where: { platform } }),
  ]);
  const positionsValue = positions
    .filter((p) => p.assetType !== "metal")
    .reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
  const metalsValue = positions
    .filter((p) => p.assetType === "metal")
    .reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
  const cashValue = cashRows.reduce((s, c) => s + c.amount * c.fxToEur, 0);
  const total = positionsValue + cashValue; // stocks/etf + cash, escluso materie prime
  const investmentName = `Stocks ${platform}`;
  const existing = await prisma.investment.findUnique({ where: { name: investmentName } });
  if (existing) {
    await prisma.investment.update({
      where: { id: existing.id },
      data: { currentValue: total, lastUpdated: new Date() },
    });
  } else {
    await prisma.investment.create({
      data: {
        name: investmentName,
        type: "stocks",
        platform,
        currentValue: total,
        currency: "EUR",
      },
    });
  }
  return total;
}

/** Refresh prezzi live di tutte le posizioni di un platform.
 *  Parallelizza le chiamate Yahoo con concurrency cap 5 — drastica
 *  velocizzazione per portfolio con 10+ posizioni rispetto al loop
 *  sequenziale (dove ogni ticker bloccava sul precedente). */
export async function refreshAllStockPrices(platform: string) {
  const positions = await prisma.stockPosition.findMany({ where: { platform } });
  const CONCURRENCY = 5;
  const updates: Array<{ ticker: string; ok: boolean; error?: string }> = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= positions.length) return;
      const p = positions[idx];
      try {
        const quote = await fetchQuoteWithEur(yahooFor(p.ticker));
        if (!quote || !quote.price || !isFinite(quote.price) || quote.price <= 0) {
          updates.push({ ticker: p.ticker, ok: false, error: "quote non valido" });
          continue;
        }
        await prisma.stockPosition.update({
          where: { id: p.id },
          data: {
            currentPrice: quote.price,
            currency: quote.currency,
            fxToEur: quote.fxToEur,
            lastUpdated: new Date(),
          },
        });
        updates.push({ ticker: p.ticker, ok: true });
      } catch (e) {
        updates.push({
          ticker: p.ticker,
          ok: false,
          error: e instanceof Error ? e.message : "errore",
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, positions.length) }, () => worker()),
  );
  await syncStocksTotal(platform);
  return updates;
}
