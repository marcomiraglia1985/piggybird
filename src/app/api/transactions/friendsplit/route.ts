import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSelfName, parseMembers } from "@/lib/friendsplit-meta";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * Crea le tx per una spesa condivisa friendsplit.
 *
 * Logica:
 *   - "myShare" = totale / N partecipanti (se self è tra i partecipanti, altrimenti 0)
 *   - Se PAGA self:
 *       tx1: -totale sul conto self (uscita reale dal mio conto bancario)
 *       tx2: +totale*(1-myShare/totale)*totale = +(totale - myShare) sul friendsplit
 *            (= ciò che gli altri mi devono complessivamente)
 *   - Se PAGA altro membro:
 *       tx1: -myShare sul friendsplit (= quanto io devo a chi ha pagato)
 *
 * Note tx friendsplit: standard "Anticipato da X · Tot. Y · Quota mia Z" così
 * il display in /friendsplit page resta coerente con il pattern dei CSV import.
 */
const Schema = z.object({
  friendsplitAccountId: z.string(),
  /** Nome del membro che ha materialmente pagato (es. "Marco" o "Davide"). */
  payerName: z.string(),
  /** Se payer == self, conto bancario da cui sono usciti i soldi. */
  selfPaymentAccountId: z.string().optional(),
  totalAmount: z.number().positive(),
  /** Membri che hanno consumato/usufruito della spesa. */
  participants: z.array(z.string()).min(1),
  date: z.string(),
  categoryId: z.string().nullable().optional(),
  beneficiary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Valida account friendsplit + recupera membri (da DB membersJson)
  const fsAccount = await prisma.account.findUnique({
    where: { id: data.friendsplitAccountId },
    select: { id: true, name: true, type: true, membersJson: true },
  });
  if (!fsAccount) {
    return NextResponse.json(
      { error: "Account friendsplit non trovato" },
      { status: 400 },
    );
  }
  if (fsAccount.type !== "friendsplit") {
    return NextResponse.json(
      { error: "L'account selezionato non è un friendsplit" },
      { status: 400 },
    );
  }
  const members = parseMembers(fsAccount.membersJson);
  if (members.length === 0) {
    return NextResponse.json(
      {
        error:
          "Membri non configurati per questo gruppo. Modifica il conto e aggiungi i membri.",
      },
      { status: 400 },
    );
  }
  const memberNames = members.map((m) => m.name);
  const SELF_NAME = await getSelfName();
  if (!SELF_NAME) {
    return NextResponse.json(
      {
        error:
          "Il tuo nome utente non è configurato. Vai in Impostazioni → Profilo per impostarlo.",
      },
      { status: 400 },
    );
  }

  // Validazioni semantiche
  if (!memberNames.includes(data.payerName)) {
    return NextResponse.json(
      { error: `Payer "${data.payerName}" non è membro del gruppo` },
      { status: 400 },
    );
  }
  for (const p of data.participants) {
    if (!memberNames.includes(p)) {
      return NextResponse.json(
        { error: `Partecipante "${p}" non è membro del gruppo` },
        { status: 400 },
      );
    }
  }
  const date = new Date(data.date);
  if (!isFinite(date.getTime())) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const isSelfPayer = data.payerName === SELF_NAME;
  const selfIsParticipant = data.participants.includes(SELF_NAME);
  const myShare = selfIsParticipant
    ? data.totalAmount / data.participants.length
    : 0;
  const beneficiary = data.beneficiary?.trim() || null;
  const userNotes = data.notes?.trim() || null;

  // Stringa note auto-generata per le tx friendsplit (formato consistente
  // con il pattern usato dai CSV import in scripts/import-costsplit.ts).
  // Include "Per:" coi nomi dei partecipanti per UI rendering icone persone.
  function fsNotes(): string {
    const parts: string[] = [];
    parts.push(`Anticipato da: ${data.payerName}`);
    parts.push(`Tot. ${data.totalAmount.toFixed(2)}€`);
    parts.push(`Quota mia: ${myShare.toFixed(2)}€`);
    parts.push(`Per: ${data.participants.join(", ")}`);
    if (userNotes) parts.push(userNotes);
    return parts.join(" · ");
  }

  // Costruisci e crea le tx atomicamente
  const confirmedAtNow = new Date();
  type TxPayload = {
    date: Date;
    amount: number;
    accountId: string;
    categoryId: string | null;
    beneficiary: string | null;
    notes: string | null;
    isJoint: boolean;
    confirmedAt: Date;
    year: number;
    month: number;
  };
  const txs: TxPayload[] = [];

  if (isSelfPayer) {
    if (!data.selfPaymentAccountId) {
      return NextResponse.json(
        { error: "selfPaymentAccountId richiesto se hai pagato tu" },
        { status: 400 },
      );
    }
    const payAccount = await prisma.account.findUnique({
      where: { id: data.selfPaymentAccountId },
      select: { id: true, type: true },
    });
    if (!payAccount) {
      return NextResponse.json(
        { error: "Conto di pagamento non trovato" },
        { status: 400 },
      );
    }
    // Tx1: uscita reale dal mio conto (con beneficiary/categoryId originali)
    txs.push({
      date,
      amount: -Math.abs(data.totalAmount),
      accountId: data.selfPaymentAccountId,
      categoryId: data.categoryId ?? null,
      beneficiary,
      notes: userNotes,
      isJoint: payAccount.type === "joint",
      confirmedAt: confirmedAtNow,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
    // Tx2: credito sul friendsplit (gli altri mi devono il loro share)
    const othersOwe = data.totalAmount - myShare;
    if (othersOwe > 0.001) {
      txs.push({
        date,
        amount: +othersOwe,
        accountId: data.friendsplitAccountId,
        categoryId: data.categoryId ?? null,
        beneficiary,
        notes: fsNotes(),
        isJoint: false,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      });
    }
  } else {
    // Altri ha pagato: io devo loro la mia quota (se sono partecipante)
    if (myShare > 0.001) {
      txs.push({
        date,
        amount: -myShare,
        accountId: data.friendsplitAccountId,
        categoryId: data.categoryId ?? null,
        beneficiary,
        notes: fsNotes(),
        isJoint: false,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
      });
    } else {
      return NextResponse.json(
        {
          error:
            "Hai indicato che ha pagato un altro ma TU non sei tra i partecipanti — niente da registrare",
        },
        { status: 400 },
      );
    }
  }

  if (txs.length === 0) {
    return NextResponse.json(
      { error: "Configurazione non genera nessuna tx (caso limite)" },
      { status: 400 },
    );
  }

  // Insert atomico
  const created = await prisma.$transaction(
    txs.map((t) => prisma.transaction.create({ data: t })),
  );

  return NextResponse.json({
    created: created.length,
    txIds: created.map((t) => t.id),
    summary: {
      isSelfPayer,
      myShare: Math.round(myShare * 100) / 100,
      totalAmount: data.totalAmount,
      participantsCount: data.participants.length,
    },
  });
}
