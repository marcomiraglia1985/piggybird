import { prisma } from "./prisma";
import { fetchQuoteWithEur } from "./yahoo-finance";
import { yahooFor } from "./yahoo-ticker-map";

type Lot = { shares: number; costPerShareEur: number };

const EPS = 1e-9;

/**
 * Rebuilda `StockPosition` + `TradingCash` per una piattaforma sommando in
 * ordine cronologico tutti gli eventi in `StockTrade`:
 *
 *   - BUY              → apre un lotto FIFO, scala il cash EUR
 *   - SELL             → consuma lotti più vecchi FIFO, accredita cash
 *   - STOCK_SPLIT      → scala shares (× factor) e cost-per-share (÷ factor) su
 *                        tutti i lotti del ticker; quantity nel record = shares
 *                        AGGIUNTE dallo split
 *   - TOP-UP/WITHDRAWAL → cashflow EUR puro (no shares)
 *   - DIVIDEND          → cash +
 *   - DIVIDEND_TAX      → cash −
 *
 * Dopo l'aggregazione: upsert delle posizioni vive, cancellazione di quelle
 * andate a zero MA SOLO se il ticker appare almeno in un trade event (non
 * tocchiamo posizioni inserite manualmente senza storia).
 *
 * Nota currentPrice/FX: per le posizioni esistenti preserva i valori già lì
 * (il refresh prezzi è separato). Per ticker nuovi tenta un fetch Yahoo;
 * se fallisce usa avgCost come fallback (currency/fxToEur euristici).
 */
export async function rebuildStockPositions(platform: string): Promise<{
  tickersUpdated: number;
  tickersRemoved: number;
  cashFinalEur: number;
}> {
  const trades = await prisma.stockTrade.findMany({
    where: { platform },
    orderBy: { date: "asc" },
  });

  const byTicker = new Map<string, Lot[]>();
  let cashEur = 0;

  for (const t of trades) {
    const qty = t.quantity ?? 0;
    const amt = t.amountEur ?? 0;

    switch (t.type) {
      case "TOP-UP":
        cashEur += amt;
        break;
      case "WITHDRAWAL":
        cashEur -= amt;
        break;
      case "DIVIDEND":
        cashEur += amt;
        break;
      case "DIVIDEND_TAX":
        cashEur -= amt;
        break;
      case "BUY": {
        if (!t.ticker || qty <= EPS) break;
        const lots = byTicker.get(t.ticker) ?? [];
        lots.push({ shares: qty, costPerShareEur: amt / qty });
        byTicker.set(t.ticker, lots);
        cashEur -= amt;
        break;
      }
      case "SELL": {
        if (!t.ticker || qty <= EPS) break;
        const lots = byTicker.get(t.ticker) ?? [];
        let remaining = qty;
        while (remaining > EPS && lots.length > 0) {
          const head = lots[0];
          if (head.shares <= remaining + EPS) {
            remaining -= head.shares;
            lots.shift();
          } else {
            head.shares -= remaining;
            remaining = 0;
          }
        }
        if (remaining > EPS) {
          console.warn(
            `[rebuildStockPositions] ${platform} ${t.ticker} SELL ${qty} eccede inventario di ${remaining} (data ${t.date.toISOString()})`,
          );
        }
        byTicker.set(t.ticker, lots);
        cashEur += amt;
        break;
      }
      case "STOCK_SPLIT": {
        if (!t.ticker) break;
        const lots = byTicker.get(t.ticker);
        if (!lots || lots.length === 0) break;
        const before = lots.reduce((s, l) => s + l.shares, 0);
        if (before <= EPS) break;
        const factor = (before + qty) / before;
        if (factor <= 0 || !isFinite(factor)) break;
        for (const l of lots) {
          l.shares *= factor;
          l.costPerShareEur /= factor;
        }
        break;
      }
      default:
        // Tipi sconosciuti: log e continua (non rompiamo il rebuild)
        console.warn(`[rebuildStockPositions] tipo evento sconosciuto: ${t.type}`);
    }
  }

  // Snapshot di ciò che c'è già — usato per:
  //  - preservare currentPrice/currency/fxToEur sulle posizioni esistenti
  //  - decidere quali cancellare (solo se il ticker compare nei trade)
  const existing = await prisma.stockPosition.findMany({ where: { platform } });
  const existingByTicker = new Map(existing.map((p) => [p.ticker, p]));

  const tickersInTrades = new Set<string>();
  for (const t of trades) if (t.ticker) tickersInTrades.add(t.ticker);

  const liveTickers = new Set<string>();
  let updated = 0;

  for (const [ticker, lots] of byTicker) {
    const totalShares = lots.reduce((s, l) => s + l.shares, 0);
    if (totalShares <= EPS) continue;
    const totalCost = lots.reduce((s, l) => s + l.shares * l.costPerShareEur, 0);
    const avgCost = totalCost / totalShares;
    liveTickers.add(ticker);

    const ex = existingByTicker.get(ticker);
    if (ex) {
      await prisma.stockPosition.update({
        where: { id: ex.id },
        data: { shares: totalShares, avgCost },
      });
    } else {
      // Nuovo ticker (mai esistito): tenta fetch Yahoo per currentPrice/FX.
      // Se Yahoo fallisce, usiamo avgCost come stima — la posizione esiste
      // comunque, il valore sarà corretto al prossimo refresh prezzi.
      const quote = await fetchQuoteWithEur(yahooFor(ticker)).catch(() => null);
      await prisma.stockPosition.create({
        data: {
          platform,
          ticker,
          shares: totalShares,
          avgCost,
          currentPrice: quote?.price && isFinite(quote.price) && quote.price > 0
            ? quote.price
            : avgCost,
          currency: quote?.currency ?? "USD",
          fxToEur: quote?.fxToEur && isFinite(quote.fxToEur) ? quote.fxToEur : 1,
        },
      });
    }
    updated++;
  }

  // Cancella posizioni tracciate da trade ma con shares=0 ora.
  // Posizioni manuali (ticker assente dai trade) NON vengono toccate.
  let removed = 0;
  for (const p of existing) {
    if (tickersInTrades.has(p.ticker) && !liveTickers.has(p.ticker)) {
      await prisma.stockPosition.delete({ where: { id: p.id } });
      removed++;
    }
  }

  // Upsert TradingCash EUR per la platform
  await prisma.tradingCash.upsert({
    where: { platform_currency: { platform, currency: "EUR" } },
    create: { platform, currency: "EUR", amount: cashEur, fxToEur: 1 },
    update: { amount: cashEur, fxToEur: 1, lastUpdated: new Date() },
  });

  return { tickersUpdated: updated, tickersRemoved: removed, cashFinalEur: cashEur };
}
