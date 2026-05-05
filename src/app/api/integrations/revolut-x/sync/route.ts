import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBalances } from "@/lib/revolut-x";
import { priceInEur } from "@/lib/crypto-prices";
import { markSynced } from "@/lib/credentials";
import { getBrokerPlatformName } from "@/lib/broker-platform-resolver";

export const runtime = "nodejs";

/**
 * Sincronizza le posizioni crypto di Revolut X.
 * - Recupera /balances (Ed25519 signed)
 * - Per ogni asset: calcola prezzo EUR (Binance public ticker)
 * - Upsert CryptoPosition con platform="Revolut X" source="spot"|"staked"
 * - Pulisce posizioni che non sono più presenti
 * - Aggiorna Investment "Crypto Revolut X" con valore totale
 */
export async function POST() {
  try {
    const balances = await getBalances();
    const platform = await getBrokerPlatformName("revolut-x");
    const seen = new Set<string>(); // chiave: source|asset

    for (const b of balances) {
      const asset = b.currency.toUpperCase();
      const total = parseFloat(b.total ?? b.available ?? "0");
      if (!isFinite(total) || total <= 0) continue;

      // Spezza available vs staked se presenti, altrimenti tutto in spot
      const available = parseFloat(b.available ?? "0") || 0;
      const staked = parseFloat(b.staked ?? "0") || 0;
      const reserved = parseFloat(b.reserved ?? "0") || 0;

      const eurUnit = await priceInEur(asset);
      if (eurUnit == null) continue; // skip asset senza prezzo

      // Spot include available + reserved (ordini aperti) — comunque tuo
      const spotAmount = available + reserved;
      if (spotAmount > 0) {
        await prisma.cryptoPosition.upsert({
          where: { platform_source_asset: { platform, source: "spot", asset } },
          create: {
            platform,
            source: "spot",
            asset,
            amount: spotAmount,
            eurValue: spotAmount * eurUnit,
            pricedVia: "binance-public",
          },
          update: {
            amount: spotAmount,
            eurValue: spotAmount * eurUnit,
            pricedVia: "binance-public",
            lastUpdated: new Date(),
          },
        });
        seen.add(`spot|${asset}`);
      }
      if (staked > 0) {
        await prisma.cryptoPosition.upsert({
          where: { platform_source_asset: { platform, source: "earn-locked", asset } },
          create: {
            platform,
            source: "earn-locked",
            asset,
            amount: staked,
            eurValue: staked * eurUnit,
            pricedVia: "binance-public",
          },
          update: {
            amount: staked,
            eurValue: staked * eurUnit,
            pricedVia: "binance-public",
            lastUpdated: new Date(),
          },
        });
        seen.add(`earn-locked|${asset}`);
      }
    }

    // Cleanup: rimuovi posizioni non più presenti (eccetto manual)
    const existing = await prisma.cryptoPosition.findMany({
      where: { platform, source: { not: "manual" } },
      select: { id: true, source: true, asset: true },
    });
    const toDelete = existing.filter((p) => !seen.has(`${p.source}|${p.asset}`));
    if (toDelete.length > 0) {
      await prisma.cryptoPosition.deleteMany({
        where: { id: { in: toDelete.map((p) => p.id) } },
      });
    }

    // Aggiorna l'Investment matchato col conto utente. Universal-app:
    // Investment.name = platform = nome conto utente.
    const allPositions = await prisma.cryptoPosition.findMany({ where: { platform } });
    const total = allPositions.reduce((s, p) => s + p.eurValue, 0);
    const legacyName = `Crypto ${platform}`;
    const existing =
      (await prisma.investment.findFirst({ where: { name: platform } })) ??
      (await prisma.investment.findFirst({ where: { name: legacyName } }));
    if (existing) {
      await prisma.investment.update({
        where: { id: existing.id },
        data: { name: platform, platform, currentValue: total, lastUpdated: new Date() },
      });
    } else {
      await prisma.investment.create({
        data: {
          name: platform,
          type: "crypto",
          platform,
          currentValue: total,
          currency: "EUR",
        },
      });
    }

    await markSynced("revolut-x");
    return NextResponse.json({
      ok: true,
      assetsSynced: seen.size,
      totalEur: total,
      removed: toDelete.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore sync" },
      { status: 500 },
    );
  }
}
