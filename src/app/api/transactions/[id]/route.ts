import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalcInvestmentBalances } from "@/lib/account-balance";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z.object({
  categoryId: z.string().nullable().optional(),
  beneficiary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  amount: z.number().optional(),
  accountId: z.string().optional(),
  isJoint: z.boolean().optional(),
  date: z.string().optional(),
  confirmed: z.boolean().optional(),
  estateId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { date: dateStr, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (dateStr !== undefined) {
    const d = new Date(dateStr);
    if (!isFinite(d.getTime())) {
      return NextResponse.json({ error: "Data non valida" }, { status: 400 });
    }
    data.date = d;
    data.year = d.getFullYear();
    data.month = d.getMonth() + 1;
  }

  // Auto-flip isJoint quando il nuovo accountId è di type="joint" e l'utente
  // NON ha già settato isJoint esplicitamente in questo payload. Non flippiamo
  // l'opposto (joint → personal) per non perdere flag già esistente.
  if (rest.accountId !== undefined && rest.isJoint === undefined) {
    const acc = await prisma.account.findUnique({
      where: { id: rest.accountId },
      select: { type: true },
    });
    if (acc?.type === "joint") {
      data.isJoint = true;
    }
  }

  const before = await prisma.transaction.findUnique({
    where: { id },
    select: { accountId: true, amount: true, confirmed: true },
  });

  // Gestisce transition di confirmed:
  //   false → true: setta confirmedAt = now (la tx "diventa effettiva ora")
  //   true → false: setta confirmedAt = null (rimossa dal saldo)
  if (rest.confirmed !== undefined && before && before.confirmed !== rest.confirmed) {
    data.confirmedAt = rest.confirmed ? new Date() : null;
  }
  const updated = await prisma.transaction.update({
    where: { id },
    data,
  });
  if (before) {
    const touched = new Set<string>();
    if (rest.amount !== undefined && rest.amount !== before.amount) touched.add(before.accountId);
    if (rest.accountId !== undefined && rest.accountId !== before.accountId) {
      touched.add(before.accountId);
      touched.add(rest.accountId);
    }
    if (touched.size > 0) await recalcInvestmentBalances([...touched]);
  }

  return NextResponse.json({ id: updated.id, categoryId: updated.categoryId });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx) {
    return NextResponse.json({ error: "Movimento non trovato" }, { status: 404 });
  }
  // Se fa parte di un transfer pair, elimina entrambi i lati per non lasciare
  // movimenti orfani con transferGroupId spaiato. findMany + deleteMany devono
  // essere atomiche: senza $transaction, una DELETE concorrente sull'altro
  // lato della coppia genererebbe ricalcoli su uno snapshot incompleto.
  if (tx.transferGroupId) {
    const accountIds = await prisma.$transaction(async (tx2) => {
      const pair = await tx2.transaction.findMany({
        where: { transferGroupId: tx.transferGroupId! },
        select: { accountId: true },
      });
      await tx2.transaction.deleteMany({
        where: { transferGroupId: tx.transferGroupId! },
      });
      return Array.from(new Set(pair.map((p) => p.accountId)));
    });
    await recalcInvestmentBalances(accountIds);
    return NextResponse.json({ deletedTransferGroup: tx.transferGroupId });
  }
  await prisma.transaction.delete({ where: { id } });
  await recalcInvestmentBalances([tx.accountId]);
  return NextResponse.json({ id });
}

