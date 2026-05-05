import { NextResponse } from "next/server";
import { syncBinanceWallet, sourceLabel } from "@/lib/binance";
import { prisma } from "@/lib/prisma";
import { markSynced } from "@/lib/credentials";
import { getBrokerPlatformName } from "@/lib/broker-platform-resolver";

export const runtime = "nodejs";

export async function POST() {
  try {
    const { totalEur, positions, bySource } = await syncBinanceWallet();
    const platform = await getBrokerPlatformName("binance");

    // Pulisci e ri-inserisci le posizioni
    await prisma.cryptoPosition.deleteMany({ where: { platform } });
    if (positions.length > 0) {
      await prisma.cryptoPosition.createMany({
        data: positions.map((p) => ({
          asset: p.asset,
          amount: p.amount,
          eurValue: p.eurValue,
          source: p.source,
          platform,
          pricedVia: p.pricedVia,
        })),
      });
    }

    // Aggiorna l'Investment matchato con il conto utente.
    // Lookup tollerante: prima per name === account name (universal-app),
    // poi fallback al legacy "Crypto Binance" per retrocompat.
    const existing =
      (await prisma.investment.findFirst({ where: { name: platform } })) ??
      (await prisma.investment.findFirst({ where: { name: "Crypto Binance" } }));
    if (existing) {
      await prisma.investment.update({
        where: { id: existing.id },
        data: {
          name: platform,
          platform,
          currentValue: totalEur,
          lastUpdated: new Date(),
        },
      });
    } else {
      await prisma.investment.create({
        data: {
          name: platform,
          type: "crypto",
          platform,
          currentValue: totalEur,
          currency: "EUR",
        },
      });
    }

    await markSynced("binance");
    return NextResponse.json({
      ok: true,
      totalEur,
      positions: positions.map((p) => ({
        asset: p.asset,
        amount: p.amount,
        eurValue: p.eurValue,
        source: p.source,
        sourceLabel: sourceLabel(p.source),
        pricedVia: p.pricedVia,
      })),
      bySource: Object.fromEntries(
        Object.entries(bySource).map(([k, v]) => [sourceLabel(k as never), v]),
      ),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
