import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseAnyBroker,
  hashStockEvent,
  listSupportedBrokers,
} from "@/lib/broker-parsers";

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

  const parsed = parseAnyBroker(csvContent);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;

  for (const ev of parsed.events) {
    const hash = hashStockEvent(ev);
    try {
      await prisma.stockTrade.create({
        data: {
          platform: ev.platform,
          type: ev.type,
          date: new Date(ev.date),
          ticker: ev.ticker,
          quantity: ev.quantity,
          pricePerUnit: ev.pricePerUnit,
          amountEur: ev.amountEur,
          currency: ev.currency,
          fxRate: ev.fxRate,
          source: `${ev.platform.toLowerCase()}-csv-import`,
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

  return NextResponse.json({
    platform: parsed.platform,
    total: parsed.events.length,
    inserted,
    skipped,
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
