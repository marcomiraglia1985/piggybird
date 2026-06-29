import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSourceHash } from "@/lib/source-hash";
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
  /** Saldo progressivo della banca dopo questo movimento (colonna Saldo/Balance
   *  del CSV). Persistito su Transaction.bankBalance per diagnostica futura. */
  bankBalance: z.number().nullable().optional(),
  /** Riga grezza del CSV (JSON dei campi originali). Persistito per audit/
   *  ri-derivazione dell'hash. */
  rawLine: z.string().nullable().optional(),
});

/** Auto-riconciliazione del saldo: la banca espone il saldo progressivo, quindi
 *  l'ultima riga di un estratto È il saldo vero del conto a quella data. Il
 *  client invia, per ogni file/conto, il saldo finale + la data → ri-ancoriamo
 *  il conto (currentBalance + balanceLastEditedAt) senza intervento manuale. */
const ReconcileSchema = z.object({
  accountId: z.string(),
  balance: z.number(),
  asOf: z.string(), // yyyy-mm-dd della riga più recente del file
});

const ConfirmSchema = z.object({
  txId: z.string(),
  newDate: z.string(),
  newAmount: z.number(),
  // Cleanups opzionali dall'AI Review: se la riga CSV aveva un beneficiary
  // pulito o una categoria suggerita, applichiamoli alla pending tx.
  beneficiary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

const BodySchema = z.object({
  rows: z.array(RowSchema),
  /** Tx ricorrenti programmate (confirmed=false) che il CSV ha "spuntato":
   *  vengono confermate e adeguate a date/amount del CSV invece di creare
   *  un duplicato. */
  confirmRecurrences: z.array(ConfirmSchema).optional(),
  reconcile: z.array(ReconcileSchema).optional(),
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

  // Pre-pass dedup DETERMINISTICO (idempotente sui re-import sovrapposti):
  // per ogni riga "create" calcoliamo sourceHash e contiamo quante copie con lo
  // stesso (accountId, sourceHash) esistono GIÀ a DB. Inseriamo solo le
  // occorrenze eccedenti (N nel CSV − M già presenti). Così reimportare un
  // periodo già caricato non crea duplicati, ma due movimenti DAVVERO identici
  // lo stesso giorno (stessa data+importo+causale) restano entrambi.
  const createRows = parsed.data.rows.filter(
    (r) => (r.action ?? "create") === "create",
  );
  const hashByRow = new Map<(typeof parsed.data.rows)[number], string>();
  for (const r of createRows) {
    hashByRow.set(
      r,
      computeSourceHash({
        date: r.date,
        amount: r.amount,
        beneficiary: r.beneficiary ?? null,
        notes: r.notes ?? null,
      }),
    );
  }
  const existingCount = new Map<string, number>();
  if (createRows.length > 0) {
    const hashes = [...new Set([...hashByRow.values()])];
    const accIds = [...new Set(createRows.map((r) => r.accountId))];
    const grouped = await prisma.transaction.groupBy({
      by: ["accountId", "sourceHash"],
      where: { accountId: { in: accIds }, sourceHash: { in: hashes } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.sourceHash) {
        existingCount.set(`${g.accountId}|${g.sourceHash}`, g._count._all);
      }
    }
  }
  const seenInBatch = new Map<string, number>();

  let inserted = 0;
  let merged = 0;
  let replaced = 0;
  let skipped = 0;
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

    // Default: create. Prima il guard di dedup deterministico: questa occorrenza
    // del (accountId, sourceHash) esiste già a DB? Se sì, skip idempotente.
    const hash = hashByRow.get(r)!;
    const key = `${r.accountId}|${hash}`;
    const already = existingCount.get(key) ?? 0;
    const seen = seenInBatch.get(key) ?? 0;
    seenInBatch.set(key, seen + 1);
    if (seen < already) {
      skipped++;
      continue;
    }

    // tx CSV import sono sempre confermate (è il senso dell'estratto conto
    // bancario). confirmedAt = data della tx (NON now()): se l'utente importa
    // storico 2023, le tx avranno confirmedAt 2023, e la logica
    // freeze/balanceLastEditedAt che filtra tx con `confirmedAt > anchor` saprà
    // correttamente che sono PRECEDENTI all'anchor (no double-count).
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
        confirmedAt: date,
        sourceHash: hash,
        bankBalance: r.bankBalance ?? null,
        rawLine: r.rawLine ?? null,
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
        // Aggiorna i campi sempre presenti + i cleanups AI Review se forniti.
        // Patch object: includi beneficiary/notes/categoryId solo se l'utente
        // (via AI Review) ha proposto un valore non-null. Mai sovrascrivere
        // con null se la patch è "non specificato" (undefined).
        const data: Record<string, unknown> = {
          confirmed: true,
          confirmedAt: new Date(),
          date: d,
          amount: c.newAmount,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
        };
        if (c.beneficiary != null) data.beneficiary = c.beneficiary;
        if (c.notes != null) data.notes = c.notes;
        if (c.categoryId != null) data.categoryId = c.categoryId;
        await prisma.transaction.update({
          where: { id: c.txId },
          data,
        });
        confirmed++;
      } catch {
        // tx già cancellata o ID stale: skip silenzioso, non bloccare l'import
      }
    }
  }

  // Track lastCsvImportAt per i conti coinvolti — usato dal banner
  // "Friendly reminder" che invita a ricaricare CSV stale > 14 giorni.
  // Include sia conti dai rows inseriti/replaced sia i conti delle pending tx
  // confermate. Best-effort: errori non rompono il commit.
  const touchedAccountIds = new Set<string>();
  for (const r of parsed.data.rows) {
    if (r.accountId) touchedAccountIds.add(r.accountId);
  }
  if (parsed.data.confirmRecurrences?.length) {
    const txs = await prisma.transaction.findMany({
      where: { id: { in: parsed.data.confirmRecurrences.map((c) => c.txId) } },
      select: { accountId: true },
    });
    for (const t of txs) touchedAccountIds.add(t.accountId);
  }
  if (touchedAccountIds.size > 0) {
    await prisma.account
      .updateMany({
        where: { id: { in: [...touchedAccountIds] } },
        data: { lastCsvImportAt: new Date() },
      })
      .catch(() => null);
  }

  // AUTO-RICONCILIAZIONE SALDO: per ogni conto con saldo progressivo dalla banca
  // ri-ancoriamo currentBalance al valore vero e balanceLastEditedAt a fine
  // giornata della riga più recente. Così displayBalance = saldo banca esatto,
  // e gli import futuri (date successive) si sommano correttamente sopra.
  const reconciled: { accountId: string; balance: number }[] = [];
  if (parsed.data.reconcile?.length) {
    for (const rec of parsed.data.reconcile) {
      const anchor = new Date(`${rec.asOf}T23:59:59.999Z`);
      if (isNaN(anchor.getTime())) continue;
      try {
        await prisma.account.update({
          where: { id: rec.accountId },
          data: { currentBalance: rec.balance, balanceLastEditedAt: anchor },
        });
        reconciled.push({ accountId: rec.accountId, balance: rec.balance });
      } catch {
        // account inesistente / id stale: non bloccare il commit
      }
    }
  }

  return NextResponse.json({
    inserted,
    confirmed,
    merged,
    replaced,
    skipped,
    reconciled,
  });
}
