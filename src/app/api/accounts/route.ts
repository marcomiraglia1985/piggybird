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
  /** Per type=investment: classe asset, alimenta /investimenti via Investment row. */
  assetClass: z.enum(["stocks", "crypto", "metals"]).optional(),
});

/** Mappa provider → platform usato dalla Investment row (allineato con i check
 *  hardcoded in /investimenti/page.tsx: "Binance" / "Revolut X" / generico). */
function platformFromProvider(provider: string, accountName: string): string {
  if (provider === "binance") return "Binance";
  if (provider === "revolut-x") return "Revolut X";
  // Generic: usa il nome del conto come platform (es. Coinbase, eToro, ecc.)
  return accountName;
}

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

  // Auto-create paired Investment row when type=investment so that the new
  // broker appears immediately on /investimenti without requiring a separate
  // setup step. Account.name is used as Investment.name (1:1 link, used poi
  // dal sync su PATCH balance).
  if (data.type === "investment" && data.assetClass) {
    await prisma.investment.create({
      data: {
        name: data.name,
        type: data.assetClass,
        platform: platformFromProvider(data.provider, data.name),
        currentValue: data.currentBalance,
        currency: data.currency.toUpperCase(),
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });
  }

  return NextResponse.json({ account });
}
