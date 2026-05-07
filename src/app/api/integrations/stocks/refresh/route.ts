import { NextResponse } from "next/server";
import { refreshAllStockPrices } from "@/lib/stocks-sync";
import { getBrokerPlatformName } from "@/lib/broker-platform-resolver";

export const runtime = "nodejs";

export async function POST() {
  try {
    const platform = await getBrokerPlatformName("revolut-stocks");
    const updates = await refreshAllStockPrices(platform);
    const ok = updates.filter((u) => u.ok).length;
    const failed = updates.length - ok;
    // Se TUTTI i ticker hanno fallito (Yahoo down, network giù) torniamo 503
    // invece di 200 con array vuoto: l'utente capisce che è un'integrazione
    // rotta, non una sync regolare con 0 update.
    if (updates.length > 0 && ok === 0) {
      const sampleErr = updates[0].error ?? "errore sconosciuto";
      return NextResponse.json(
        {
          error: `Refresh fallito per tutti i ${updates.length} ticker (${sampleErr}). Yahoo Finance potrebbe essere temporaneamente irraggiungibile.`,
          updates,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ updates, summary: { ok, failed } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore" },
      { status: 500 },
    );
  }
}
