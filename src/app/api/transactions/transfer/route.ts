import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { recalcInvestmentBalances } from "@/lib/account-balance";

export const runtime = "nodejs";

/**
 * Crea un trasferimento atomico tra due conti dell'utente.
 * Genera una coppia di tx con stesso `transferGroupId`, importi opposti,
 * categoria type="transfer" (default "Giroconto" se non specificata).
 *
 * Se uno dei due conti è di tipo `investment`, il suo `currentBalance`
 * viene ricalcolato (gli altri tipi hanno saldi gestiti manualmente).
 */
const Schema = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  notes: z.string().nullable().optional(),
  /** Categoria opzionale (deve essere type="transfer"). Default: "Giroconto". */
  categoryId: z.string().nullable().optional(),
});

function randomGroupId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON non valido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  if (data.fromAccountId === data.toAccountId) {
    return NextResponse.json(
      { error: "Conto di partenza e destinazione devono essere diversi" },
      { status: 400 },
    );
  }
  const date = new Date(data.date);
  if (!isFinite(date.getTime())) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const [fromAcc, toAcc] = await Promise.all([
    prisma.account.findUnique({ where: { id: data.fromAccountId } }),
    prisma.account.findUnique({ where: { id: data.toAccountId } }),
  ]);
  if (!fromAcc || !toAcc) {
    return NextResponse.json({ error: "Conto non trovato" }, { status: 404 });
  }

  // Categoria: usa quella passata se è type=transfer, altrimenti default Giroconto.
  let category = null;
  if (data.categoryId) {
    category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (category && category.type !== "transfer") category = null;
  }
  if (!category) {
    category = await prisma.category.findFirst({ where: { name: "Giroconto", type: "transfer" } });
  }

  const groupId = randomGroupId();
  const beneficiary = `${fromAcc.name} → ${toAcc.name}`;
  const confirmedAtNow = new Date();
  const [outTx, inTx] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        date,
        amount: -data.amount,
        accountId: fromAcc.id,
        categoryId: category?.id ?? null,
        beneficiary,
        notes: data.notes?.trim() || null,
        isJoint: fromAcc.type === "joint",
        confirmed: true,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        transferGroupId: groupId,
      },
    }),
    prisma.transaction.create({
      data: {
        date,
        amount: data.amount,
        accountId: toAcc.id,
        categoryId: category?.id ?? null,
        beneficiary,
        notes: data.notes?.trim() || null,
        isJoint: toAcc.type === "joint",
        confirmed: true,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        transferGroupId: groupId,
      },
    }),
  ]);

  await recalcInvestmentBalances([fromAcc.id, toAcc.id]);

  return NextResponse.json({ ok: true, outTx, inTx, transferGroupId: groupId });
}
