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

    // Allinea il conto Binance dell'utente: il dashboard widget legge
    // `Account.currentBalance` (via `displayBalance`), non `Investment.currentValue`.
    // Senza questo update, il widget BINANCE resta a 0 anche se la sync ha
    // popolato positions e Investment correttamente.
    //
    // L'API key Binance è UNA per installazione (in `ApiCredential`), ma
    // l'utente può avere più Account marcati provider="binance" (es. main +
    // sub-account). Senza un mapping per-account credential→account, non
    // sappiamo a quale assegnare il saldo. Politiche:
    //  - 0 account binance attivi → no-op (Investment.currentValue basta)
    //  - 1 account → update di quello (caso comune)
    //  - >1 account → skip + warning, l'utente deve linkare manualmente
    //    quale account corrisponde alla key (TODO: per-account API link)
    const binanceAccounts = await prisma.account.findMany({
      where: { provider: "binance", active: true },
      select: { id: true, name: true },
    });
    if (binanceAccounts.length === 1) {
      await prisma.account.update({
        where: { id: binanceAccounts[0].id },
        data: { currentBalance: totalEur },
      });
    } else if (binanceAccounts.length > 1) {
      console.warn(
        `[binance/sync] ${binanceAccounts.length} conti binance attivi: saldo Account.currentBalance non aggiornato per evitare ambiguità. Names: ${binanceAccounts.map((a) => a.name).join(", ")}`,
      );
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
