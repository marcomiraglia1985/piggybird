import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchQuoteWithEur } from "@/lib/yahoo-finance";
import { syncStocksTotal } from "@/lib/stocks-sync";
import { z } from "zod";

export const runtime = "nodejs";

const PostSchema = z.object({
  ticker: z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
  shares: z.number().positive(),
  avgCost: z.number().positive().optional(),
  platform: z.string().default("Revolut"),
  notes: z.string().optional(),
});

export async function GET() {
  const positions = await prisma.stockPosition.findMany({
    orderBy: [{ platform: "asc" }, { ticker: "asc" }],
  });
  return NextResponse.json({ positions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const { ticker, shares, avgCost, platform, notes } = parsed.data;

  const quote = await fetchQuoteWithEur(ticker);
  if (!quote) {
    return NextResponse.json({ error: `Ticker "${ticker}" non trovato su Yahoo Finance` }, { status: 400 });
  }

  const created = await prisma.stockPosition.upsert({
    where: { platform_ticker: { platform, ticker } },
    create: {
      ticker,
      name: quote.longName ?? quote.shortName ?? ticker,
      shares,
      avgCost: avgCost ?? null,
      currentPrice: quote.price,
      currency: quote.currency,
      fxToEur: quote.fxToEur,
      platform,
      exchange: quote.exchangeName ?? null,
      notes: notes ?? null,
    },
    update: {
      shares,
      avgCost: avgCost ?? undefined,
      currentPrice: quote.price,
      currency: quote.currency,
      fxToEur: quote.fxToEur,
      lastUpdated: new Date(),
    },
  });

  await syncStocksTotal(platform);
  return NextResponse.json({ position: created });
}
