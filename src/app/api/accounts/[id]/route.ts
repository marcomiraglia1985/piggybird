import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getFreezeState, setFreezeState } from "@/lib/account-freeze";
import { getProvidersForAccountType } from "@/lib/account-providers";

export const runtime = "nodejs";

const PatchSchema = z.object({
  currentBalance: z.number().optional(),
  name: z.string().trim().min(1).optional(),
  emoji: z.string().trim().min(1).max(8).nullable().optional(),
  active: z.boolean().optional(),
  ownershipShare: z.number().min(0).max(1).optional(),
  interestRateAnnual: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  /** Provider esterno (per gating delle integrazioni in Impostazioni). Validato
   *  contro la lista in account-providers + compatibilità con account.type. */
  provider: z.string().trim().min(1).optional(),
  /** Per friendsplit: lista membri del gruppo. Salvata come JSON in membersJson. */
  members: z.array(z.object({ name: z.string().trim().min(1) })).optional(),
  /** Se true, salta la creazione del movimento di rettifica
   *  (usato dall'importer iniziale che setta i saldi senza tracking). */
  skipAdjustment: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Conto non trovato" }, { status: 404 });
  }

  const { skipAdjustment, members, ...updates } = parsed.data;

  // Cambio quota di proprietà: snapshot della vecchia quota su tutte le tx
  // esistenti PRIMA di scrivere la nuova quota sull'account. In questo modo
  // i movimenti storici continuano a essere calcolati con la vecchia quota,
  // mentre quelli futuri (con ownershipShare=null) useranno la nuova via
  // fallback in queries.ts. La nuova regola vale "dal momento in cui è
  // cambiata", non retroattivamente.
  let snapshottedTxCount = 0;
  if (
    updates.ownershipShare !== undefined &&
    Math.abs(updates.ownershipShare - account.ownershipShare) > 0.0001
  ) {
    const r = await prisma.transaction.updateMany({
      where: { accountId: id, ownershipShare: null },
      data: { ownershipShare: account.ownershipShare },
    });
    snapshottedTxCount = r.count;
  }

  // Validazione provider: deve essere compatibile col type del conto
  if (updates.provider !== undefined) {
    const compatible = getProvidersForAccountType(account.type);
    if (!compatible.find((p) => p.id === updates.provider)) {
      return NextResponse.json(
        {
          error: `Provider "${updates.provider}" non compatibile con conti di tipo "${account.type}".`,
        },
        { status: 400 },
      );
    }
  }

  // Chiusura conto: setta closedAt al momento corrente
  const closedAtUpdate: { closedAt?: Date | null } = {};
  if (updates.active === false && account.active) {
    closedAtUpdate.closedAt = new Date();
  } else if (updates.active === true && !account.active) {
    closedAtUpdate.closedAt = null;
  }

  // Bloccare la modifica manuale del saldo se i conti sono scongelati.
  // L'utente deve esplicitamente passare in modalità "Congelati" prima di
  // poter forzare un saldo a mano.
  if (updates.currentBalance !== undefined) {
    const { frozen } = await getFreezeState();
    if (!frozen) {
      return NextResponse.json(
        {
          error:
            "I conti sono scongelati: i saldi si aggiornano automaticamente dai movimenti. Per modificare a mano un saldo passa prima in modalità Congelati dallo switch in /conti.",
        },
        { status: 409 },
      );
    }
  }

  // Se il saldo cambia, crea un movimento di rettifica con categoria "Rettifica saldo" (🔧, type=transfer)
  let adjustmentTx: { id: string; amount: number } | null = null;
  if (
    updates.currentBalance !== undefined &&
    !skipAdjustment &&
    Math.abs(updates.currentBalance - account.currentBalance) > 0.001
  ) {
    const delta = updates.currentBalance - account.currentBalance;
    // Cerca (o crea on-the-fly) la categoria "Rettifica saldo".
    // Type=transfer così non contamina il netto in /riepilogo.
    let alignCat = await prisma.category.findFirst({
      where: { name: "Rettifica saldo" },
    });
    if (!alignCat) {
      alignCat = await prisma.category.create({
        data: {
          emoji: "🔧",
          name: "Rettifica saldo",
          group: "transfer",
          type: "transfer",
          displayOrder: 999,
        },
      });
    }
    const today = new Date();
    const tx = await prisma.transaction.create({
      data: {
        date: today,
        amount: delta,
        accountId: id,
        categoryId: alignCat.id,
        beneficiary: "Rettifica saldo",
        notes: `Aggiornamento manuale saldo: da ${account.currentBalance.toFixed(2)} € a ${updates.currentBalance.toFixed(2)} €`,
        isJoint: account.type === "joint",
        year: today.getFullYear(),
        month: today.getMonth() + 1,
      },
    });
    adjustmentTx = { id: tx.id, amount: tx.amount };
  }

  // members → membersJson (campo DB) per i conti friendsplit
  const membersJsonUpdate =
    members !== undefined
      ? { membersJson: JSON.stringify(members.map((m) => ({ name: m.name.trim() }))) }
      : {};
  const updated = await prisma.account.update({
    where: { id },
    data: { ...updates, ...closedAtUpdate, ...membersJsonUpdate },
  });

  // Snapshot del saldo
  if (updates.currentBalance !== undefined) {
    // Mezzanotte UTC del giorno corrente (locale): garantisce idempotenza
    // della @@unique(accountId,date) anche se l'utente cambia TZ tra una
    // modifica e l'altra.
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    await prisma.accountBalance
      .upsert({
        where: { accountId_date: { accountId: id, date: today } },
        create: { accountId: id, date: today, balance: updates.currentBalance },
        update: { balance: updates.currentBalance },
      })
      .catch(() => null);

    // Aggiorna frozenAt = now: i conti restano congelati ma il punto di
    // ancoraggio è il momento di questa modifica. Quando l'utente
    // scongelerà, le tx considerate "live" saranno solo quelle dopo questo
    // istante.
    await setFreezeState(true, new Date());
  }

  // Sync paired Investment row when account is type=investment. Cambi a
  // currentBalance, name (rename), provider (→ platform), o close (active=false)
  // si propagano alla Investment per tenere /investimenti allineato senza
  // sapere nulla di Account.
  if (account.type === "investment") {
    const inv = await prisma.investment.findUnique({
      where: { name: account.name },
    });
    if (inv) {
      const invUpdates: {
        name?: string;
        platform?: string;
        currentValue?: number;
      } = {};
      if (updates.name && updates.name !== account.name) {
        invUpdates.name = updates.name;
      }
      if (
        updates.provider !== undefined &&
        updates.provider !== account.provider
      ) {
        // Aggiorna platform usando la stessa mappa del POST
        invUpdates.platform =
          updates.provider === "binance"
            ? "Binance"
            : updates.provider === "revolut-x"
              ? "Revolut X"
              : updates.name ?? account.name;
      }
      if (updates.currentBalance !== undefined) {
        invUpdates.currentValue = updates.currentBalance;
      }
      if (Object.keys(invUpdates).length > 0) {
        await prisma.investment.update({
          where: { id: inv.id },
          data: invUpdates,
        });
      }
      // Account chiuso → cancella Investment row così non appare più su
      // /investimenti (il conto resta in "Chiusi/Migrati" su /conti per la
      // history, ma non si vuole vederlo come posizione attiva).
      if (updates.active === false && account.active) {
        await prisma.investment.delete({ where: { id: inv.id } });
      }
    }
  }

  return NextResponse.json({
    id: updated.id,
    currentBalance: updated.currentBalance,
    adjustmentTx,
    snapshottedTxCount,
  });
}

/**
 * DELETE /api/accounts/[id]
 *
 * Cancellazione hard. Per conti normali (liquid/joint/savings/etc.):
 * CONSENTITA SOLO con 0 tx (cascade Prisma butterebbe via storia reale).
 *
 * Per conti FRIENDSPLIT: consentita anche con tx — le tx friendsplit
 * vengono cascade-cancellate (sono solo "scritture" virtuali che riflettono
 * debiti/crediti del gruppo). Le tx sui conti principali (Revolut, ecc.)
 * generate dalle spese friendsplit dove l'utente ha pagato NON vengono
 * toccate (sono record di uscite reali dal conto bancario, indipendenti).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: "Conto non trovato" }, { status: 404 });
  }
  const txCount = await prisma.transaction.count({ where: { accountId: id } });

  // Friendsplit: cancellazione consentita anche con tx (cascade volontaria)
  if (account.type === "friendsplit") {
    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ deleted: id, txCascaded: txCount });
  }

  if (txCount > 0) {
    return NextResponse.json(
      {
        error: `Impossibile cancellare: il conto ha ${txCount} movimenti storici. Per non perderli, lascialo archiviato.`,
      },
      { status: 409 },
    );
  }
  // Cancella la Investment row paired (se esiste) prima dell'Account: legate
  // per nome, no FK quindi la pulizia è esplicita.
  if (account.type === "investment") {
    await prisma.investment
      .deleteMany({ where: { name: account.name } })
      .catch(() => null);
  }
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ deleted: id, txCascaded: 0 });
}
