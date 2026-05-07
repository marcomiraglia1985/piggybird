import { prisma } from "./prisma";
import { getBrokerPlatformName } from "./broker-platform-resolver";
import { priceEurAt } from "./crypto-prices-historical";

/**
 * Backfilla i `CryptoTrade` Binance dove `totalEur` è 0 (coppie crypto-to-crypto
 * importate via API senza rate EUR storico) e ricalcola `CryptoCostBasis` per
 * asset come `Σ BUY.totalEur − Σ SELL.totalEur` (clamp a 0).
 *
 * Non tocca `Investment.costEur`: quello rappresenta il baseline pre-API
 * dell'utente. `CryptoCostBasis` è la quota derivata dai trade Binance e si
 * SOMMA al baseline nel calcolo del costo totale (vedi crypto-platform-view).
 *
 * Salta deposit/withdraw (source != "binance-api") che hanno totalEur=0
 * intenzionalmente (sono trasferimenti, non trade).
 */
export type BackfillResult = {
  tradesUpdated: number;
  tradesSkipped: number;
  skipReasons: Record<string, number>;
  costBasisInserted: number;
  costBasisUpdated: number;
  assetsTotal: number;
  aggregateCostEur: number;
};

export async function backfillBinanceCostBasis(): Promise<BackfillResult> {
  const platform = await getBrokerPlatformName("binance");

  const broken = await prisma.cryptoTrade.findMany({
    where: {
      platform,
      source: "binance-api",
      OR: [{ totalEur: 0 }, { pricePerUnitEur: 0 }],
    },
    orderBy: { date: "asc" },
  });

  let tradesUpdated = 0;
  let tradesSkipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const t of broken) {
    const quoteRate = await priceEurAt(t.currency, t.date.getTime());
    if (quoteRate == null || quoteRate <= 0) {
      tradesSkipped++;
      const reason = `no-rate-${t.currency}`;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      continue;
    }
    const pricePerUnitEur = t.pricePerUnit * quoteRate;
    const totalEur = t.quantity * pricePerUnitEur;
    await prisma.cryptoTrade.update({
      where: { id: t.id },
      data: { pricePerUnitEur, totalEur },
    });
    tradesUpdated++;
  }

  const allTrades = await prisma.cryptoTrade.findMany({
    where: { platform, source: "binance-api" },
    orderBy: { date: "asc" },
  });
  const costByAsset = new Map<string, number>();
  for (const t of allTrades) {
    if (t.totalEur <= 0) continue;
    const sign = t.direction === "buy" ? 1 : -1;
    costByAsset.set(t.asset, (costByAsset.get(t.asset) ?? 0) + sign * t.totalEur);
  }

  let costBasisInserted = 0;
  let costBasisUpdated = 0;
  for (const [asset, costRaw] of costByAsset) {
    const costEur = Math.max(0, costRaw);
    if (costEur <= 0) continue;
    const existing = await prisma.cryptoCostBasis.findUnique({
      where: { platform_asset: { platform, asset } },
    });
    if (existing) {
      await prisma.cryptoCostBasis.update({
        where: { id: existing.id },
        data: { costEur, notes: "auto-backfill da CryptoTrade history" },
      });
      costBasisUpdated++;
    } else {
      await prisma.cryptoCostBasis.create({
        data: {
          platform,
          asset,
          costEur,
          notes: "auto-backfill da CryptoTrade history",
        },
      });
      costBasisInserted++;
    }
  }

  const aggregateCostEur = [...costByAsset.values()].reduce(
    (s, v) => s + Math.max(0, v),
    0,
  );

  return {
    tradesUpdated,
    tradesSkipped,
    skipReasons,
    costBasisInserted,
    costBasisUpdated,
    assetsTotal: costByAsset.size,
    aggregateCostEur,
  };
}
