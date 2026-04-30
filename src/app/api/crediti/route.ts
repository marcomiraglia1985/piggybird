import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const credits = await prisma.credit.findMany({
    orderBy: [{ status: "asc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ credits });
}

const CreateSchema = z.object({
  name: z.string().trim().min(1),
  counterparty: z.string().trim().nullable().optional(),
  amount: z.number().positive(),
  currency: z.string().trim().default("EUR"),
  date: z.string().nullable().optional(),
  expectedReturn: z.string().nullable().optional(),
  status: z.enum(["active", "returned", "lost"]).default("active"),
  emoji: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const maxOrder = await prisma.credit.aggregate({ _max: { displayOrder: true } });
  const credit = await prisma.credit.create({
    data: {
      name: data.name,
      counterparty: data.counterparty ?? null,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      date: data.date ? new Date(data.date) : null,
      expectedReturn: data.expectedReturn ? new Date(data.expectedReturn) : null,
      status: data.status,
      emoji: data.emoji?.trim() || null,
      notes: data.notes?.trim() || null,
      displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ credit });
}
