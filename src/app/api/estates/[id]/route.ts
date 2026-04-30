import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calcMortgagePayment } from "@/lib/mortgage";

export const runtime = "nodejs";

const PatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["apartment", "house", "commercial", "land", "other"]).optional(),
  holding: z.enum(["owned", "rented"]).optional(),
  emoji: z.string().trim().min(1).max(8).optional(),
  address: z.string().trim().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  purchaseDate: z.string().datetime().nullable().optional(),
  purchasePrice: z.number().nonnegative().nullable().optional(),
  currentValue: z.number().nonnegative().nullable().optional(),
  ownershipShare: z.number().min(0).max(1).optional(),
  monthlyRent: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  notes: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
  displayOrder: z.number().int().optional(),

  // === Mortgage edit ===
  // Editabili in qualsiasi momento. Se l'utente cambia amount/rate/duration
  // ricalcoliamo monthlyPayment, ma NON tocchiamo le tx già generate
  // (l'utente può aggiornarle a mano via /movimenti/ricorrenze).
  mortgageAmount: z.number().positive().nullable().optional(),
  mortgageRate: z.number().min(0).max(100).nullable().optional(),
  mortgageDurationMonths: z.number().int().positive().max(600).nullable().optional(),
  mortgageStartDate: z.string().datetime().nullable().optional(),
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
  const data = parsed.data;
  const currentValueTouched = data.currentValue !== undefined;

  // Se l'utente tocca uno dei campi mutuo (amount/rate/duration), ricalcoliamo
  // mortgageMonthlyPayment con i valori EFFETTIVI dopo l'update (mix
  // tra payload e stato corrente). Skip se viene impostato a null (rimosso).
  const mortgageFieldTouched =
    data.mortgageAmount !== undefined ||
    data.mortgageRate !== undefined ||
    data.mortgageDurationMonths !== undefined;

  let monthlyPaymentUpdate: { mortgageMonthlyPayment: number | null } | object = {};
  if (mortgageFieldTouched) {
    const existing = await prisma.realEstate.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Immobile non trovato" }, { status: 404 });
    }
    const eff = (k: "mortgageAmount" | "mortgageRate" | "mortgageDurationMonths") =>
      data[k] !== undefined ? data[k] : existing[k];
    const amount = eff("mortgageAmount");
    const rate = eff("mortgageRate");
    const months = eff("mortgageDurationMonths");
    if (amount != null && rate != null && months != null && amount > 0 && months > 0) {
      monthlyPaymentUpdate = {
        mortgageMonthlyPayment: calcMortgagePayment(amount, rate, months),
      };
    } else {
      monthlyPaymentUpdate = { mortgageMonthlyPayment: null };
    }
  }

  const updated = await prisma.realEstate.update({
    where: { id },
    data: {
      ...data,
      purchaseDate:
        data.purchaseDate === null
          ? null
          : data.purchaseDate
            ? new Date(data.purchaseDate)
            : undefined,
      mortgageStartDate:
        data.mortgageStartDate === null
          ? null
          : data.mortgageStartDate
            ? new Date(data.mortgageStartDate)
            : undefined,
      ...(currentValueTouched && { currentValueUpdatedAt: new Date() }),
      ...monthlyPaymentUpdate,
    },
  });
  return NextResponse.json({ estate: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Soft delete: scollega le transazioni e marca come inactive
  await prisma.transaction.updateMany({
    where: { estateId: id },
    data: { estateId: null },
  });
  await prisma.realEstate.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
