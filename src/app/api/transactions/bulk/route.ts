import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalcInvestmentBalances } from "@/lib/account-balance";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  ids: z.array(z.string()).min(1).max(2000),
  data: z
    .object({
      categoryId: z.string().nullable().optional(),
      accountId: z.string().optional(),
      isJoint: z.boolean().optional(),
      confirmed: z.boolean().optional(),
      estateId: z.string().nullable().optional(),
    })
    .refine((d) => Object.keys(d).length > 0, "Nessun campo da aggiornare"),
});

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const { ids, data } = parsed.data;

  // SAFETY: valida categoryId/accountId/estateId esistano davvero nel DB se
  // sono passati come stringa. Previene client malevoli o errori di routing
  // che inseriscono ID inesistenti (data integrity).
  if (typeof data.categoryId === "string") {
    const exists = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: `categoryId inesistente: ${data.categoryId}` },
        { status: 400 },
      );
    }
  }
  if (typeof data.accountId === "string") {
    const exists = await prisma.account.findUnique({
      where: { id: data.accountId },
      select: { id: true, type: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: `accountId inesistente: ${data.accountId}` },
        { status: 400 },
      );
    }
    // Auto-flip isJoint quando si sposta a un conto type="joint" e l'utente
    // non ha già scelto esplicitamente isJoint in questo payload. Le tx
    // appariranno così nella pagina /cointestato (filtro su isJoint=true).
    if (exists.type === "joint" && data.isJoint === undefined) {
      data.isJoint = true;
    }
  }
  if (typeof data.estateId === "string") {
    const exists = await prisma.realEstate.findUnique({
      where: { id: data.estateId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: `estateId inesistente: ${data.estateId}` },
        { status: 400 },
      );
    }
  }

  // Quando si imposta estateId, propaga ai gruppi di ricorrenza coinvolti:
  // se anche solo una occorrenza viene assegnata a un immobile, ha senso che
  // tutte le altre occorrenze (passate + future) seguano la stessa assegnazione.
  // Per gli altri campi (categoryId, accountId, ecc.) NON propaghiamo: cambi
  // localizzati alle tx selezionate.
  let allIds = ids;
  if ("estateId" in data) {
    const affected = await prisma.transaction.findMany({
      where: { id: { in: ids } },
      select: { recurrenceGroupId: true },
    });
    const groupIds = [
      ...new Set(
        affected.map((t) => t.recurrenceGroupId).filter((g): g is string => !!g),
      ),
    ];
    if (groupIds.length > 0) {
      const groupTxs = await prisma.transaction.findMany({
        where: { recurrenceGroupId: { in: groupIds } },
        select: { id: true },
      });
      allIds = [...new Set([...ids, ...groupTxs.map((t) => t.id)])];
    }
  }

  const before =
    "accountId" in data
      ? await prisma.transaction.findMany({
          where: { id: { in: allIds } },
          select: { accountId: true },
        })
      : [];
  const result = await prisma.transaction.updateMany({
    where: { id: { in: allIds } },
    data,
  });
  if ("accountId" in data && data.accountId) {
    const touched = new Set<string>(before.map((t) => t.accountId));
    touched.add(data.accountId);
    await recalcInvestmentBalances([...touched]);
  }
  return NextResponse.json({ updated: result.count });
}

const DeleteSchema = z.object({ ids: z.array(z.string()).min(1).max(2000) });

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ids mancanti" }, { status: 400 });
  }
  // Trova eventuali transferGroupId coinvolti per cancellare anche le pair
  const txs = await prisma.transaction.findMany({
    where: { id: { in: parsed.data.ids } },
    select: { id: true, transferGroupId: true, accountId: true },
  });
  const groupIds = [...new Set(txs.map((t) => t.transferGroupId).filter((g): g is string => !!g))];
  const touched = new Set<string>(txs.map((t) => t.accountId));
  let deleted = 0;
  if (groupIds.length > 0) {
    const pairTxs = await prisma.transaction.findMany({
      where: { transferGroupId: { in: groupIds } },
      select: { accountId: true },
    });
    pairTxs.forEach((t) => touched.add(t.accountId));
    const r = await prisma.transaction.deleteMany({
      where: { transferGroupId: { in: groupIds } },
    });
    deleted += r.count;
  }
  const idsWithoutGroup = txs.filter((t) => !t.transferGroupId).map((t) => t.id);
  if (idsWithoutGroup.length > 0) {
    const r = await prisma.transaction.deleteMany({
      where: { id: { in: idsWithoutGroup } },
    });
    deleted += r.count;
  }
  await recalcInvestmentBalances([...touched]);
  return NextResponse.json({ deleted });
}
