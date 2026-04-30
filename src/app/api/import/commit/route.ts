import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const RowSchema = z.object({
  date: z.string(),
  amount: z.number(),
  accountId: z.string(),
  categoryId: z.string().nullable().optional(),
  beneficiary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isJoint: z.boolean().optional(),
  transferGroupId: z.string().nullable().optional(),
  /** Action per soft-duplicates:
   *   - "create" (default): inserisce nuova tx (comportamento storico)
   *   - "merge": aggiorna existingTxId aggiungendo solo i campi mancanti
   *     dal CSV (es. notes vuoto → riempito; beneficiary/category preservati)
   *   - "replace": aggiorna existingTxId con tutti i campi dal CSV (overwrite)
   */
  action: z.enum(["create", "merge", "replace"]).optional(),
  existingTxId: z.string().optional(),
});

const ConfirmSchema = z.object({
  txId: z.string(),
  newDate: z.string(),
  newAmount: z.number(),
});

const BodySchema = z.object({
  rows: z.array(RowSchema),
  /** Tx ricorrenti programmate (confirmed=false) che il CSV ha "spuntato":
   *  vengono confermate e adeguate a date/amount del CSV invece di creare
   *  un duplicato. */
  confirmRecurrences: z.array(ConfirmSchema).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Rimappa i transferGroupId provenienti dal CSV (es. "csv-...") in ID stabili,
  // così che entrambi i lati della coppia ricevano lo stesso valore.
  const groupMap = new Map<string, string>();
  for (const r of parsed.data.rows) {
    if (r.transferGroupId && !groupMap.has(r.transferGroupId)) {
      groupMap.set(r.transferGroupId, crypto.randomUUID());
    }
  }

  let inserted = 0;
  let merged = 0;
  let replaced = 0;
  for (const r of parsed.data.rows) {
    const date = new Date(r.date);
    const tgid = r.transferGroupId ? groupMap.get(r.transferGroupId) ?? null : null;
    const action = r.action ?? "create";

    if (action === "merge" && r.existingTxId) {
      // Aggiorna SOLO i campi vuoti sulla tx esistente: preserva beneficiary,
      // categoryId etc. che l'utente ha curato a mano. Aggiunge le notes
      // (causale) e la category se mancante.
      const existing = await prisma.transaction.findUnique({
        where: { id: r.existingTxId },
        select: { beneficiary: true, notes: true, categoryId: true },
      });
      if (existing) {
        await prisma.transaction.update({
          where: { id: r.existingTxId },
          data: {
            // Solo se vuoto sull'esistente
            beneficiary: existing.beneficiary || r.beneficiary || null,
            notes: existing.notes || r.notes || null,
            categoryId: existing.categoryId ?? r.categoryId ?? null,
          },
        });
        merged++;
      }
      continue;
    }

    if (action === "replace" && r.existingTxId) {
      // Overwrite con i dati CSV (l'utente ha esplicitamente scelto)
      await prisma.transaction.update({
        where: { id: r.existingTxId },
        data: {
          date,
          amount: r.amount,
          accountId: r.accountId,
          categoryId: r.categoryId ?? null,
          beneficiary: r.beneficiary ?? null,
          notes: r.notes ?? null,
          isJoint: r.isJoint ?? false,
          year: date.getFullYear(),
          month: date.getMonth() + 1,
        },
      });
      replaced++;
      continue;
    }

    // Default: create — tx CSV import sono sempre confermate (è il senso
    // dell'estratto conto bancario). confirmedAt = now così impattano il saldo.
    await prisma.transaction.create({
      data: {
        date,
        amount: r.amount,
        accountId: r.accountId,
        categoryId: r.categoryId ?? null,
        beneficiary: r.beneficiary ?? null,
        notes: r.notes ?? null,
        isJoint: r.isJoint ?? false,
        transferGroupId: tgid,
        confirmedAt: new Date(),
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      },
    });
    inserted++;
  }

  let confirmed = 0;
  if (parsed.data.confirmRecurrences?.length) {
    for (const c of parsed.data.confirmRecurrences) {
      const d = new Date(c.newDate);
      try {
        await prisma.transaction.update({
          where: { id: c.txId },
          data: {
            confirmed: true,
            confirmedAt: new Date(),
            date: d,
            amount: c.newAmount,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          },
        });
        confirmed++;
      } catch {
        // tx già cancellata o ID stale: skip silenzioso, non bloccare l'import
      }
    }
  }

  return NextResponse.json({ inserted, confirmed, merged, replaced });
}
