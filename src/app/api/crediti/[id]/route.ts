import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  counterparty: z.string().trim().nullable().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().trim().optional(),
  date: z.string().nullable().optional(),
  expectedReturn: z.string().nullable().optional(),
  status: z.enum(["active", "returned", "lost"]).optional(),
  emoji: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
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
  const { date, expectedReturn, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (date !== undefined) data.date = date ? new Date(date) : null;
  if (expectedReturn !== undefined)
    data.expectedReturn = expectedReturn ? new Date(expectedReturn) : null;
  const credit = await prisma.credit.update({ where: { id }, data });
  return NextResponse.json({ credit });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await prisma.credit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
