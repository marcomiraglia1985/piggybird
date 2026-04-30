import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncStocksTotal } from "@/lib/stocks-sync";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  shares: z.number().positive().optional(),
  avgCost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const updated = await prisma.stockPosition.update({
    where: { id },
    data: parsed.data,
  });
  await syncStocksTotal(updated.platform);
  return NextResponse.json({ position: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const deleted = await prisma.stockPosition.delete({ where: { id } });
  await syncStocksTotal(deleted.platform);
  return NextResponse.json({ ok: true });
}
