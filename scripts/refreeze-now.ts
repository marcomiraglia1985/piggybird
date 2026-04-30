/**
 * One-shot: ingerisce nei saldi le tx aggiunte dopo una certa data (default
 * "ultima rettifica saldo trovata") e resetta frozenAt = now.
 *
 * Differenza vs snapshotAndFreeze() della libreria: usa `createdAt` invece di
 * `date`, perché tx aggiunte retroattivamente (date passate ma createdAt
 * recente) altrimenti non vengono prese.
 *
 * Uso:
 *   tsx scripts/refreeze-now.ts                       # dry-run, mostra delta
 *   tsx scripts/refreeze-now.ts --apply               # applica
 *   tsx scripts/refreeze-now.ts --since "2026-04-26 07:00" --apply
 */

import { prisma } from "../src/lib/prisma";
import { setFreezeState } from "../src/lib/account-freeze";

const apply = process.argv.includes("--apply");
const sinceArgIdx = process.argv.indexOf("--since");
const sinceArg =
  sinceArgIdx >= 0 ? process.argv[sinceArgIdx + 1] : undefined;

async function main() {
  // Default cutoff: ultima rettifica saldo + 1 minuto (per non riconteggiarla).
  let cutoff: Date;
  if (sinceArg) {
    cutoff = new Date(sinceArg);
    if (isNaN(cutoff.getTime())) {
      console.error(`❌ Data non valida: "${sinceArg}"`);
      process.exit(1);
    }
  } else {
    const lastRettifica = await prisma.transaction.findFirst({
      where: { beneficiary: "Rettifica saldo" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!lastRettifica) {
      console.error(
        "❌ Nessuna rettifica saldo trovata. Specifica --since manualmente.",
      );
      process.exit(1);
    }
    cutoff = new Date(lastRettifica.createdAt.getTime() + 60_000);
  }

  console.log(`📅 Cutoff (createdAt >): ${cutoff.toISOString()}`);

  const includeInvestment = process.argv.includes("--include-investment");

  // Tx aggiunte dopo il cutoff (escludo rettifiche; default escludo anche
  // account type=investment perché i loro saldi vengono già ricalcolati da
  // recalcInvestmentBalances al sync — riapplicarli farebbe doppio conteggio)
  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      createdAt: { gt: cutoff },
      NOT: { beneficiary: "Rettifica saldo" },
      ...(includeInvestment ? {} : { account: { type: { not: "investment" } } }),
    },
    include: { account: { select: { name: true, type: true, currentBalance: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (txs.length === 0) {
    console.log("✅ Nessuna tx da ingerire dopo il cutoff.");
    return;
  }

  console.log(`📋 ${txs.length} tx da ingerire:\n`);

  // Aggrega delta per accountId
  const deltaByAcc = new Map<
    string,
    { name: string; currentBalance: number; delta: number; count: number }
  >();
  for (const t of txs) {
    const cur = deltaByAcc.get(t.accountId) ?? {
      name: t.account.name,
      currentBalance: t.account.currentBalance,
      delta: 0,
      count: 0,
    };
    cur.delta += t.amount;
    cur.count++;
    deltaByAcc.set(t.accountId, cur);
  }

  for (const [accId, info] of deltaByAcc) {
    const sign = info.delta >= 0 ? "+" : "";
    const newBal = info.currentBalance + info.delta;
    console.log(
      `   ${info.name.padEnd(25)} ${info.count.toString().padStart(3)} tx · ${info.currentBalance.toFixed(2).padStart(12)} → ${newBal.toFixed(2).padStart(12)}  (${sign}${info.delta.toFixed(2)})`,
    );
    void accId;
  }

  if (!apply) {
    console.log("\n🔍 DRY-RUN: nessuna modifica. Aggiungi --apply per eseguire.");
    return;
  }

  // Applica delta + reset frozenAt = now (mantiene frozen=false attuale)
  const now = new Date();
  await prisma.$transaction([
    ...Array.from(deltaByAcc.entries()).map(([accId, info]) =>
      prisma.account.update({
        where: { id: accId },
        data: { currentBalance: info.currentBalance + info.delta },
      }),
    ),
  ]);
  // Resetta frozenAt = now così future tx (createdAt > now) non vengono
  // riconteggiate. NB: lascio frozen=false (live mode); se volevi frozen=true
  // chiama setFreezeState(true, now) qui.
  await setFreezeState(false, now);
  console.log(`\n✅ ${deltaByAcc.size} conti aggiornati. frozenAt = ${now.toISOString()}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Errore:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
