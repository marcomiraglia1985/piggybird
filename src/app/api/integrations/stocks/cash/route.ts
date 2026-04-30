import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fxToEur } from "@/lib/yahoo-finance";
import { syncStocksTotal } from "@/lib/stocks-sync";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const cash = await prisma.tradingCash.findMany({
    where: { platform: "Revolut" },
    orderBy: { currency: "asc" },
  });
  return NextResponse.json({ cash });
}

const PutSchema = z.object({
  currency: z.string().min(2).max(8).transform((s) => s.trim().toUpperCase()),
  amount: z.number(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const { currency, amount } = parsed.data;
  const fx = await fxToEur(currency);
  const result = await prisma.tradingCash.upsert({
    where: { platform_currency: { platform: "Revolut", currency } },
    create: { platform: "Revolut", currency, amount, fxToEur: fx },
    update: { amount, fxToEur: fx, lastUpdated: new Date() },
  });
  await syncStocksTotal("Revolut");
  return NextResponse.json({ cash: result });
}

const DeleteSchema = z.object({
  currency: z.string().transform((s) => s.trim().toUpperCase()),
});

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = DeleteSchema.safeParse({ currency: searchParams.get("currency") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Currency mancante" }, { status: 400 });
  }
  await prisma.tradingCash
    .delete({ where: { platform_currency: { platform: "Revolut", currency: parsed.data.currency } } })
    .catch(() => null);
  await syncStocksTotal("Revolut");
  return NextResponse.json({ ok: true });
}
