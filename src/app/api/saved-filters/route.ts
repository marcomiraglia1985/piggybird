import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const filters = await prisma.savedFilter.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ filters });
}

const PostSchema = z.object({
  name: z.string().trim().min(1),
  emoji: z.string().trim().max(4).optional().nullable(),
  query: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const max = await prisma.savedFilter.aggregate({ _max: { displayOrder: true } });
  const f = await prisma.savedFilter.create({
    data: {
      name: parsed.data.name,
      emoji: parsed.data.emoji?.trim() || null,
      query: parsed.data.query,
      displayOrder: (max._max.displayOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ filter: f });
}
