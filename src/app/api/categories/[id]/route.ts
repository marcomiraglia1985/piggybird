import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  emoji: z.string().trim().min(1).max(8).optional(),
  active: z.boolean().optional(),
  group: z.string().trim().optional(),
  type: z.string().trim().optional(),
  estateId: z.string().nullable().optional(),
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
  // SQLite tratta NULL come distinct nell'unique (emoji, name, estateId):
  // se l'update porta a (emoji, name, null) duplicato di un'altra cat
  // generica, Prisma non lo intercetta. Validazione esplicita.
  const target = await prisma.category.findUnique({
    where: { id },
    select: { emoji: true, name: true, estateId: true },
  });
  if (target) {
    const newEmoji = parsed.data.emoji ?? target.emoji;
    const newName = parsed.data.name ?? target.name;
    const newEstateId =
      parsed.data.estateId !== undefined ? parsed.data.estateId : target.estateId;
    if (!newEstateId) {
      const dup = await prisma.category.findFirst({
        where: {
          emoji: newEmoji,
          name: newName,
          estateId: null,
          NOT: { id },
        },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Esiste già una categoria generica con questo emoji e nome." },
          { status: 409 },
        );
      }
    }
  }
  try {
    const updated = await prisma.category.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ category: updated });
  } catch (e: unknown) {
    // Prisma P2002 = unique constraint violation sullo scope estate-specific.
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "Esiste già una categoria con questo emoji e nome in questo immobile." },
        { status: 409 },
      );
    }
    throw e;
  }
}

/**
 * DELETE /api/categories/[id]
 *
 * Cancellazione hard. Le tx collegate avranno categoryId = null (cascade
 * SetNull sullo schema). I dati monetari non cambiano, solo l'etichetta
 * categoria si perde. Operazione destinata a categorie ARCHIVIATE che
 * non si vogliono più conservare nemmeno come storia.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) {
    return NextResponse.json({ error: "Categoria non trovata" }, { status: 404 });
  }
  const orphaned = await prisma.transaction.count({ where: { categoryId: id } });
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ deleted: id, orphanedTransactions: orphaned });
}
