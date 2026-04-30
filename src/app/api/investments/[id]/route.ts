import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  currentValue: z.number().optional(),
  costEur: z.number().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const updated = await prisma.investment.update({
    where: { id },
    data: { ...parsed.data, lastUpdated: new Date() },
  });
  return NextResponse.json({ investment: updated });
}
