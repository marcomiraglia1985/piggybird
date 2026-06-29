import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashStockEvent,
  listSupportedBrokers,
} from "@/lib/broker-parsers";
import { parseAnyBrokerWithFallback } from "@/lib/universal-broker-parser";
import { rebuildStockPositions } from "@/lib/stock-positions-rebuilder";
import { refreshAllStockPrices } from "@/lib/stocks-sync";

export const runtime = "nodejs";

/**
 * GET: lista broker supportati (per UI).
 */
export async function GET() {
  return NextResponse.json({
    supported: listSupportedBrokers(),
  });
}

/**
 * POST: importa CSV trade history. Body: multipart/form-data con campo "file".
 * Rileva automaticamente il formato del broker, parsa, deduplica via hash,
 * e fa upsert in StockTrade.
 *
 * Risposta: { platform, total, inserted, skipped }
 */
export async function POST(req: NextRequest) {
  let csvContent: string;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Campo 'file' mancante o non valido" },
          { status: 400 },
        );
      }
      csvContent = await file.text();
    } else {
      csvContent = await req.text();
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Lettura body fallita: ${String(e)}` },
      { status: 400 },
    );
  }

  if (!csvContent.trim()) {
    return NextResponse.json({ error: "CSV vuoto" }, { status: 400 });
  }

  const parsed = await parseAnyBrokerWithFallback(csvContent);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Universal-app: il parser ritorna platform="Revolut" hardcoded, ma vogliamo
  // che lo storage usi il NOME del conto investimento configurato dall'utente
  // (es. "Revolut Trading"). Il broker parser ID è ancora utile come source
  // tag per debug/telemetria.
  const { getBrokerPlatformName } = await import("@/lib/broker-platform-resolver");
  const brokerKey =
    parsed.platform === "Revolut"
      ? "revolut-stocks"
      : parsed.platform === "Binance"
        ? "binance"
        : parsed.platform === "Revolut X"
          ? "revolut-x"
          : null;
  const platformName = brokerKey
    ? await getBrokerPlatformName(brokerKey)
    : parsed.platform;

  let inserted = 0;
  let skipped = 0;

  for (const ev of parsed.events) {
    const hash = hashStockEvent({ ...ev, platform: platformName });
    try {
      await prisma.stockTrade.create({
        data: {
          platform: platformName,
          type: ev.type,
          date: new Date(ev.date),
          ticker: ev.ticker,
          quantity: ev.quantity,
          pricePerUnit: ev.pricePerUnit,
          amountEur: ev.amountEur,
          currency: ev.currency,
          fxRate: ev.fxRate,
          source: `${parsed.platform.toLowerCase()}-csv-import`,
          hash,
        },
      });
      inserted++;
    } catch (e) {
      // Hash unique → già importato
      const msg = String(e);
      if (msg.includes("Unique constraint") || msg.includes("hash")) {
        skipped++;
      } else {
        // Errore inatteso: log e continua
        console.error("StockTrade import error:", e);
        skipped++;
      }
    }
  }

  // Dopo l'inserimento dei trade: riaggrega posizioni + TradingCash dallo
  // storico completo, poi rinfresca i prezzi live e ricalcola il totale.
  // Best-effort: errori in queste fasi non rollback-ano l'import dei trade,
  // ma vengono surface-ati nella response come `syncError`.
  let rebuildSummary: Awaited<ReturnType<typeof rebuildStockPositions>> | null = null;
  let syncError: string | null = null;
  try {
    rebuildSummary = await rebuildStockPositions(platformName);
    await refreshAllStockPrices(platformName);
  } catch (e) {
    syncError = e instanceof Error ? e.message : String(e);
    console.error("[stock-trades/import] post-import sync failed:", e);
  }

  return NextResponse.json({
    platform: platformName,
    total: parsed.events.length,
    inserted,
    skipped,
    rebuild: rebuildSummary,
    syncError,
  });
}

/**
 * DELETE: cancella tutti i trade di una platform (per re-import pulito).
 * Query: ?platform=Revolut
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  if (!platform) {
    return NextResponse.json({ error: "platform mancante" }, { status: 400 });
  }
  const result = await prisma.stockTrade.deleteMany({
    where: { platform },
  });
  return NextResponse.json({ deleted: result.count });
}
