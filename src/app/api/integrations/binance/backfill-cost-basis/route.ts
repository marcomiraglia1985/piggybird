import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrokerPlatformName } from "@/lib/broker-platform-resolver";
import { priceEurAt } from "@/lib/crypto-prices-historical";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — backfill can be slow per Binance klines

/**
 * Backfilla i CryptoTrade Binance dove totalEur è 0 (coppie crypto-to-crypto
 * importate via API senza rate EUR storico). Per ogni trade:
 *   1. Carica le daily klines del quote asset (cached in memory)
 *   2. Trova il prezzo EUR del quote alla data del trade
 *   3. pricePerUnitEur = pricePerUnit_in_quote × quoteEurRate
 *   4. totalEur = quantity × pricePerUnitEur
 *   5. Update DB
 *
 * Dopo il backfill ricalcola CryptoCostBasis per asset (FIFO):
 *   cost_basis(asset) = Σ BUY.totalEur − Σ SELL.totalEur (con clamp a 0)
 *
 * Salta deposit/withdraw (source != "binance-api") che hanno totalEur=0
 * intenzionalmente (sono trasferimenti, non trade).
 */
export async function POST() {
  try {
    const platform = await getBrokerPlatformName("binance");

    const broken = await prisma.cryptoTrade.findMany({
      where: {
        platform,
        source: "binance-api",
        OR: [{ totalEur: 0 }, { pricePerUnitEur: 0 }],
      },
      orderBy: { date: "asc" },
    });

    let updated = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    for (const t of broken) {
      const quoteRate = await priceEurAt(t.currency, t.date.getTime());
      if (quoteRate == null || quoteRate <= 0) {
        skipped++;
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
      updated++;
    }

    // Ricalcola CryptoCostBasis per ogni asset Binance
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

    // NON tocchiamo Investment.costEur: l'aggregato manuale dell'utente è la
    // source of truth (include trade pre-API + crypto-to-crypto + transferi
    // da wallet esterni con cost basis che nessuna API può recuperare).
    // Per-asset CryptoCostBasis è informativo, partial — l'utente lo override
    // quando vuole dal pulsante ✏️.
    const totalCost = [...costByAsset.values()].reduce(
      (s, v) => s + Math.max(0, v),
      0,
    );

    return NextResponse.json({
      ok: true,
      tradesUpdated: updated,
      tradesSkipped: skipped,
      skipReasons,
      costBasisInserted,
      costBasisUpdated,
      assetsTotal: costByAsset.size,
      aggregateCostEur: totalCost,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore backfill" },
      { status: 500 },
    );
  }
}
