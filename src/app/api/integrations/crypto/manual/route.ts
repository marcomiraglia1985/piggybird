import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const PostSchema = z.object({
  platform: z.string().min(1),
  asset: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  amount: z.number().positive(),
  eurValue: z.number().nonnegative(),
  costEur: z.number().nullable().optional(),
});

/**
 * Crea/aggiorna una posizione crypto inserita manualmente (source="manual").
 * Per piattaforme senza sync automatico (es. Revolut X, vecchi wallet).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const { platform, asset, amount, eurValue, costEur } = parsed.data;

  const position = await prisma.cryptoPosition.upsert({
    where: {
      platform_source_asset: { platform, source: "manual", asset },
    },
    create: {
      platform,
      source: "manual",
      asset,
      amount,
      eurValue,
      pricedVia: "manual",
    },
    update: { amount, eurValue, lastUpdated: new Date() },
  });

  if (costEur != null) {
    await prisma.cryptoCostBasis.upsert({
      where: { platform_asset: { platform, asset } },
      create: { platform, asset, costEur },
      update: { costEur },
    });
  }

  await syncCryptoInvestmentTotal(platform);
  return NextResponse.json({ ok: true, position });
}

/** Aggrega tutte le posizioni di un platform in Investment (per il dashboard). */
async function syncCryptoInvestmentTotal(platform: string) {
  const positions = await prisma.cryptoPosition.findMany({ where: { platform } });
  const total = positions.reduce((s, p) => s + p.eurValue, 0);
  const investmentName = `Crypto ${platform}`;
  if (total === 0) {
    await prisma.investment.deleteMany({ where: { name: investmentName } });
    return;
  }
  await prisma.investment.upsert({
    where: { name: investmentName },
    update: { currentValue: total, lastUpdated: new Date() },
    create: {
      name: investmentName,
      type: "crypto",
      platform,
      currentValue: total,
      currency: "EUR",
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const asset = searchParams.get("asset")?.toUpperCase();
  if (!platform || !asset) {
    return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
  }
  await prisma.cryptoPosition
    .delete({
      where: { platform_source_asset: { platform, source: "manual", asset } },
    })
    .catch(() => null);
  await prisma.cryptoCostBasis
    .delete({ where: { platform_asset: { platform, asset } } })
    .catch(() => null);
  await syncCryptoInvestmentTotal(platform);
  return NextResponse.json({ ok: true });
}
