import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const Schema = z.object({
  targetId: z.string().min(1),
});

/**
 * Unisce la categoria sorgente nella target:
 *  - sposta tutte le Transaction.categoryId da source → target
 *  - cancella la categoria sorgente
 *
 * Operazione irreversibile, ma non distruttiva sui dati: importi, conti,
 * date, saldi conto NON cambiano. Cambia solo l'etichetta categoria.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "targetId mancante" }, { status: 400 });
  }
  const { targetId } = parsed.data;
  if (sourceId === targetId) {
    return NextResponse.json({ error: "Source e target sono la stessa categoria" }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.category.findUnique({ where: { id: sourceId } }),
    prisma.category.findUnique({ where: { id: targetId } }),
  ]);
  if (!source) return NextResponse.json({ error: "Source non trovata" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target non trovata" }, { status: 404 });

  const result = await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { categoryId: sourceId },
      data: { categoryId: targetId },
    }),
    prisma.category.delete({ where: { id: sourceId } }),
  ]);

  return NextResponse.json({
    movedTransactions: result[0].count,
    deletedCategoryId: sourceId,
    targetId,
  });
}
