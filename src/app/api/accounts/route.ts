import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const accounts = await prisma.account.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, emoji: true, type: true, currency: true },
  });
  return NextResponse.json({ accounts });
}

const VALID_TYPES = ["liquid", "joint", "cash", "savings", "credit", "investment", "friendsplit"] as const;

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(VALID_TYPES),
  /** Provider esterno per gating integrazioni in Impostazioni.
   *  Default "generic" (no API). */
  provider: z.string().trim().min(1).max(32).default("generic"),
  currency: z.string().trim().min(2).max(8).default("EUR"),
  emoji: z.string().trim().max(8).optional().nullable(),
  ownershipShare: z.number().min(0).max(1).default(1),
  currentBalance: z.number().default(0),
  /** Per type=friendsplit: lista membri JSON `[{name}]`. Ignored per altri tipi. */
  members: z.array(z.object({ name: z.string().trim().min(1) })).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const data = parsed.data;
  const existing = await prisma.account.findUnique({ where: { name: data.name } });
  if (existing) {
    return NextResponse.json({ error: "Esiste già un conto con questo nome" }, { status: 409 });
  }
  const maxOrder = await prisma.account.aggregate({ _max: { displayOrder: true } });
  // Per friendsplit, salva i membri come JSON. Almeno 2 membri richiesti.
  let membersJson: string | null = null;
  if (data.type === "friendsplit") {
    if (!data.members || data.members.length < 2) {
      return NextResponse.json(
        { error: "Friendsplit richiede almeno 2 membri" },
        { status: 400 },
      );
    }
    membersJson = JSON.stringify(
      data.members.map((m) => ({ name: m.name.trim() })),
    );
  }

  const account = await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      provider: data.provider,
      currency: data.currency.toUpperCase(),
      emoji: data.emoji?.trim() || null,
      ownershipShare: data.ownershipShare,
      currentBalance: data.currentBalance,
      displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      active: true,
      membersJson,
    },
  });
  return NextResponse.json({ account });
}
