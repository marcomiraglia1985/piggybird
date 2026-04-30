import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calcMortgagePayment } from "@/lib/mortgage";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["apartment", "house", "commercial", "land", "other"]).default("apartment"),
  holding: z.enum(["owned", "rented"]).default("owned"),
  emoji: z.string().trim().min(1).max(8).optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  country: z.string().trim().optional(),
  purchaseDate: z.string().datetime().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  currentValue: z.number().nonnegative().optional(),
  ownershipShare: z.number().min(0).max(1).default(1.0),
  monthlyRent: z.number().nonnegative().optional(),
  currency: z.string().trim().min(1).max(8).default("EUR"),
  notes: z.string().trim().optional(),

  // === Mortgage (tutti opzionali) ===
  // Se almeno uno dei mortgage* è presente, sono richiesti tutti e 4 i base
  // (amount, rate, durationMonths, accountId) per generare le tx ricorrenti.
  // mortgageStartDate è opzionale: default = purchaseDate || oggi.
  mortgageAmount: z.number().positive().optional(),
  mortgageRate: z.number().min(0).max(100).optional(),
  mortgageDurationMonths: z.number().int().positive().max(600).optional(),
  mortgageStartDate: z.string().datetime().optional(),
  /** Conto su cui addebitare le rate. Required se mortgage attivo. */
  mortgageAccountId: z.string().optional(),
});

/**
 * Avanza una data di N mesi preservando il giorno (clamp se mese più corto).
 * Coerente con `advance` di lib/recurrence.ts.
 */
function advanceMonths(base: Date, step: number): Date {
  const targetMonth = base.getMonth() + step;
  const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
  const targetMonthNorm = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTarget = new Date(targetYear, targetMonthNorm + 1, 0).getDate();
  const day = Math.min(base.getDate(), lastDayOfTarget);
  return new Date(
    targetYear,
    targetMonthNorm,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
  );
}

export async function GET() {
  const estates = await prisma.realEstate.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ estates });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const isRented = data.holding === "rented";

  // Mortgage validation: se uno qualsiasi dei campi mutuo è presente,
  // richiedi i 4 obbligatori (amount, rate, durationMonths, accountId).
  const mortgageRequested =
    data.mortgageAmount != null ||
    data.mortgageRate != null ||
    data.mortgageDurationMonths != null ||
    data.mortgageAccountId != null;
  if (mortgageRequested) {
    if (isRented) {
      return NextResponse.json(
        { error: "Il mutuo è valido solo per immobili di proprietà" },
        { status: 400 },
      );
    }
    if (
      data.mortgageAmount == null ||
      data.mortgageRate == null ||
      data.mortgageDurationMonths == null ||
      !data.mortgageAccountId
    ) {
      return NextResponse.json(
        {
          error:
            "Per il mutuo servono importo, tasso, durata in mesi e conto di addebito",
        },
        { status: 400 },
      );
    }
  }

  // Calcola la rata mensile server-side per evitare drift col client.
  let monthlyPayment: number | null = null;
  if (mortgageRequested && data.mortgageAmount != null && data.mortgageRate != null && data.mortgageDurationMonths != null) {
    monthlyPayment = calcMortgagePayment(
      data.mortgageAmount,
      data.mortgageRate,
      data.mortgageDurationMonths,
    );
  }

  // Genera un recurrenceGroupId condiviso fra le tx mutuo (consente
  // estensione/cancellazione di gruppo dal sistema esistente).
  const mortgageGroupId = mortgageRequested
    ? `rec_mortgage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    : null;

  const created = await prisma.realEstate.create({
    data: {
      name: data.name,
      type: data.type,
      holding: data.holding,
      emoji: data.emoji ?? "🏠",
      address: data.address,
      city: data.city,
      country: data.country,
      // I campi di acquisto/valore sono ignorati per holding="rented".
      purchaseDate: isRented ? null : data.purchaseDate ? new Date(data.purchaseDate) : null,
      purchasePrice: isRented ? null : data.purchasePrice,
      currentValue: isRented ? null : data.currentValue,
      ownershipShare: isRented ? 0 : data.ownershipShare,
      monthlyRent: data.monthlyRent,
      currency: data.currency,
      notes: data.notes,

      mortgageAmount: mortgageRequested ? data.mortgageAmount : null,
      mortgageRate: mortgageRequested ? data.mortgageRate : null,
      mortgageDurationMonths: mortgageRequested ? data.mortgageDurationMonths : null,
      mortgageStartDate: mortgageRequested
        ? data.mortgageStartDate
          ? new Date(data.mortgageStartDate)
          : data.purchaseDate
            ? new Date(data.purchaseDate)
            : new Date()
        : null,
      mortgageMonthlyPayment: monthlyPayment,
      mortgageRecurrenceGroupId: mortgageGroupId,
    },
  });

  // === Auto-generazione categoria mutuo + 12 tx ricorrenti ===
  if (mortgageRequested && monthlyPayment != null && monthlyPayment > 0 && mortgageGroupId) {
    // Verifica account esiste (evita FK error opaco)
    const account = await prisma.account.findUnique({
      where: { id: data.mortgageAccountId! },
    });
    if (!account) {
      // Rollback: cancella l'estate appena creato per coerenza
      await prisma.realEstate.delete({ where: { id: created.id } });
      return NextResponse.json(
        { error: "Conto di addebito non trovato" },
        { status: 400 },
      );
    }

    // Cat "🏦 Mutuo {name}" linkata all'estate. Unique constraint su
    // (emoji, name, estateId) → safe da chiamare anche se già esiste.
    const catName = `Mutuo ${data.name}`;
    let category = await prisma.category.findFirst({
      where: { emoji: "🏦", name: catName, estateId: created.id },
    });
    if (!category) {
      // displayOrder: in fondo (max + 1) — non drogue l'ordine altre cat
      const maxOrder = await prisma.category.aggregate({
        _max: { displayOrder: true },
      });
      category = await prisma.category.create({
        data: {
          emoji: "🏦",
          name: catName,
          group: "expense",
          type: "expense",
          estateId: created.id,
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });
    }

    // Genera 12 tx future, una al mese a partire da mortgageStartDate.
    // Importo = -monthlyPayment (uscita). confirmed=false (programmate).
    const startDate =
      created.mortgageStartDate ?? new Date();
    const txCreates: Promise<unknown>[] = [];
    for (let i = 0; i < 12; i++) {
      const d = i === 0 ? new Date(startDate) : advanceMonths(startDate, i);
      txCreates.push(
        prisma.transaction.create({
          data: {
            date: d,
            amount: -monthlyPayment,
            accountId: account.id,
            categoryId: category.id,
            beneficiary: catName,
            notes: `Rata ${i + 1}/${data.mortgageDurationMonths} (auto-generata dalla creazione del mutuo)`,
            isJoint: account.type === "joint",
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            confirmed: false,
            recurrenceGroupId: mortgageGroupId,
            estateId: created.id,
          },
        }),
      );
    }
    await Promise.all(txCreates);
  }

  return NextResponse.json({ estate: created });
}
