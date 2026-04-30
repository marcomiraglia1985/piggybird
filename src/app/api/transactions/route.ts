import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const RecurrenceSchema = z.object({
  frequency: z.enum(["monthly", "weekly", "yearly"]),
  mode: z.enum(["untilEndOfYear", "months", "occurrences"]),
  value: z.number().int().positive().optional(),
});

const CreateSchema = z.object({
  date: z.string(),
  amount: z.number(),
  accountId: z.string(),
  categoryId: z.string().nullable().optional(),
  beneficiary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isJoint: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  recurrence: RecurrenceSchema.optional(),
});

/** Calcola le date di tutte le occorrenze partendo dalla prima. */
function buildOccurrences(
  start: Date,
  rec: z.infer<typeof RecurrenceSchema>,
): Date[] {
  const dates: Date[] = [start];
  const count = (() => {
    if (rec.mode === "occurrences") return rec.value ?? 1;
    if (rec.mode === "months") {
      // approssima: 1 occorrenza al mese (weekly = ×4.34, yearly = /12)
      const months = rec.value ?? 1;
      if (rec.frequency === "monthly") return months;
      if (rec.frequency === "weekly") return Math.round(months * 4.345);
      if (rec.frequency === "yearly") return Math.max(1, Math.floor(months / 12));
    }
    if (rec.mode === "untilEndOfYear") {
      const endY = new Date(start.getFullYear(), 11, 31, 23, 59, 59);
      // genera al massimo 60 occorrenze come safety cap
      let n = 1;
      const probe = new Date(start);
      for (let i = 0; i < 200; i++) {
        const next = advance(probe, rec.frequency, i + 1, start);
        if (next.getTime() > endY.getTime()) break;
        n++;
      }
      return n;
    }
    return 1;
  })();

  for (let i = 1; i < count; i++) {
    dates.push(advance(start, rec.frequency, i, start));
  }
  return dates;
}

/** Avanza la data di N step rispetto alla base (start). */
function advance(_base: Date, freq: "monthly" | "weekly" | "yearly", step: number, start: Date): Date {
  if (freq === "weekly") {
    const d = new Date(start);
    d.setDate(d.getDate() + 7 * step);
    return d;
  }
  if (freq === "yearly") {
    const d = new Date(start);
    d.setFullYear(d.getFullYear() + step);
    return d;
  }
  // monthly: stesso giorno del mese; se non esiste (es. 31 in feb), usa ultimo giorno
  const targetMonth = start.getMonth() + step;
  const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
  const targetMonthNorm = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTarget = new Date(targetYear, targetMonthNorm + 1, 0).getDate();
  const day = Math.min(start.getDate(), lastDayOfTarget);
  return new Date(targetYear, targetMonthNorm, day, start.getHours(), start.getMinutes(), start.getSeconds());
}

function randomGroupId(): string {
  return `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  }
  const data = parsed.data;
  const startDate = new Date(data.date);
  if (!isFinite(startDate.getTime())) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }
  const account = await prisma.account.findUnique({ where: { id: data.accountId } });
  if (!account) {
    return NextResponse.json({ error: "Conto non trovato" }, { status: 404 });
  }

  // Caso singolo (no ricorrenza)
  if (!data.recurrence) {
    // Se la categoria è di tipo investment → crea automaticamente il transfer
    // pair con l'account "Investimenti": l'app contabilizza i movimenti come
    // giroconto verso un asset, non come spesa.
    let category = null;
    if (data.categoryId) {
      category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    }
    const isInvestment = category?.type === "investment";
    const investmentAcct = isInvestment
      ? await prisma.account.findUnique({ where: { name: "Investimenti" } })
      : null;

    if (isInvestment && investmentAcct && investmentAcct.id !== data.accountId) {
      const groupId = randomGroupId();
      const isConfirmed = data.confirmed ?? true;
      const confirmedAtNow = isConfirmed ? new Date() : null;
      const [bankTx, investTx] = await prisma.$transaction([
        prisma.transaction.create({
          data: {
            date: startDate,
            amount: data.amount,
            accountId: data.accountId,
            categoryId: data.categoryId ?? null,
            beneficiary: data.beneficiary?.trim() || null,
            notes: data.notes?.trim() || null,
            isJoint: data.isJoint ?? account.type === "joint",
            confirmed: isConfirmed,
            confirmedAt: confirmedAtNow,
            year: startDate.getFullYear(),
            month: startDate.getMonth() + 1,
            transferGroupId: groupId,
          },
        }),
        prisma.transaction.create({
          data: {
            date: startDate,
            amount: -data.amount,
            accountId: investmentAcct.id,
            categoryId: data.categoryId ?? null,
            beneficiary: data.beneficiary?.trim() || null,
            notes: data.notes?.trim() || null,
            isJoint: false,
            confirmed: isConfirmed,
            confirmedAt: confirmedAtNow,
            year: startDate.getFullYear(),
            month: startDate.getMonth() + 1,
            transferGroupId: groupId,
          },
        }),
      ]);
      // Aggiorna balance Investimenti
      const sum = await prisma.transaction.aggregate({
        where: { accountId: investmentAcct.id },
        _sum: { amount: true },
      });
      await prisma.account.update({
        where: { id: investmentAcct.id },
        data: { currentBalance: sum._sum.amount ?? 0 },
      });
      return NextResponse.json({ tx: bankTx, pairTx: investTx, count: 2, autoTransfer: true });
    }

    const isConfirmed = data.confirmed ?? true;
    const tx = await prisma.transaction.create({
      data: {
        date: startDate,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        beneficiary: data.beneficiary?.trim() || null,
        notes: data.notes?.trim() || null,
        isJoint: data.isJoint ?? account.type === "joint",
        confirmed: isConfirmed,
        confirmedAt: isConfirmed ? new Date() : null,
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
      },
    });
    return NextResponse.json({ tx, count: 1 });
  }

  // Caso ricorrente
  const dates = buildOccurrences(startDate, data.recurrence);
  if (dates.length > 240) {
    return NextResponse.json({ error: "Troppe occorrenze (max 240)" }, { status: 400 });
  }
  const groupId = randomGroupId();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const created = await prisma.$transaction(
    dates.map((d) => {
      const isConfirmed =
        d.getTime() <= today.getTime() ? data.confirmed ?? true : false;
      return prisma.transaction.create({
        data: {
          date: d,
          amount: data.amount,
          accountId: data.accountId,
          categoryId: data.categoryId ?? null,
          beneficiary: data.beneficiary?.trim() || null,
          notes: data.notes?.trim() || null,
          isJoint: data.isJoint ?? account.type === "joint",
          confirmed: isConfirmed,
          confirmedAt: isConfirmed ? new Date() : null,
          recurrenceGroupId: groupId,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
        },
      });
    }),
  );
  return NextResponse.json({ count: created.length, recurrenceGroupId: groupId });
}
