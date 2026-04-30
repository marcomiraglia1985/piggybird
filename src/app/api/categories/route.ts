import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  // Solo categorie attive nei picker — quelle inattive (es. categorie investment
  // legacy "Stocks (Revolut)") restano nei record passati ma non si selezionano più.
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: [{ group: "asc" }, { displayOrder: "asc" }],
    select: {
      id: true,
      emoji: true,
      name: true,
      type: true,
      group: true,
      estateId: true,
      displayOrder: true,
    },
  });
  return NextResponse.json({ categories });
}

const CreateSchema = z.object({
  emoji: z.string().trim().min(1).max(8).default("🆕"),
  name: z.string().trim().min(1),
  group: z.string().trim().default("altri"),
  type: z.enum(["expense", "income", "investment", "transfer"]).default("expense"),
  estateId: z.string().nullable().optional(),
});

/**
 * POST /api/categories
 * Crea una nuova categoria. Il client la pone in "altri" con displayOrder=0
 * e poi l'utente la draggherà nella sezione/estate giusta.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  // SQLite tratta NULL come distinct nell'unique multi-column: lo schema
  // protegge il caso estateId valorizzato, ma per le cat generiche
  // (estateId=null) serve una validazione esplicita.
  if (!data.estateId) {
    const dup = await prisma.category.findFirst({
      where: { emoji: data.emoji, name: data.name, estateId: null },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "Esiste già una categoria generica con questo emoji e nome." },
        { status: 409 },
      );
    }
  }
  try {
    // Forza la nuova cat in cima alla sua sezione: trovo il min displayOrder
    // tra le cat dello stesso group/estate e metto -1 sotto.
    const peers = await prisma.category.findMany({
      where: data.estateId
        ? { estateId: data.estateId }
        : { group: data.group, estateId: null },
      select: { displayOrder: true },
    });
    const minOrder = peers.length > 0
      ? Math.min(...peers.map((p) => p.displayOrder))
      : 0;
    const cat = await prisma.category.create({
      data: {
        emoji: data.emoji,
        name: data.name,
        group: data.group,
        type: data.type,
        estateId: data.estateId ?? null,
        displayOrder: minOrder - 1,
        active: true,
      },
    });
    return NextResponse.json({ category: cat });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore creazione";
    if (msg.includes("Unique constraint") || msg.includes("UNIQUE constraint")) {
      return NextResponse.json(
        { error: "Esiste già una categoria con questa emoji+nome" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
