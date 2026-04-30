import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const PostSchema = z.object({
  platform: z.string().min(1),
  asset: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  costEur: z.number().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const { platform, asset, costEur, notes } = parsed.data;
  if (costEur == null) {
    await prisma.cryptoCostBasis
      .delete({ where: { platform_asset: { platform, asset } } })
      .catch(() => null);
    return NextResponse.json({ ok: true, deleted: true });
  }
  const result = await prisma.cryptoCostBasis.upsert({
    where: { platform_asset: { platform, asset } },
    create: { platform, asset, costEur, notes: notes ?? null },
    update: { costEur, notes: notes ?? null },
  });
  return NextResponse.json({ ok: true, costBasis: result });
}
