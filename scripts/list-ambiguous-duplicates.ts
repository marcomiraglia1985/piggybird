/**
 * List all ambiguous duplicate groups for manual review.
 *
 * "Ambiguo" = stessa data+amount+conto, MA tutte le tx hanno beneficiary
 * semantici (no auto-import generic). Potrebbero essere duplicati legittimi
 * (utente li ha aggiunti 2 volte) o tx legittime distinte (2 pedaggi stesso
 * giorno stesso importo) — serve revisione umana.
 *
 * Uso: tsx scripts/list-ambiguous-duplicates.ts
 *
 * Niente scritture, sempre dry-print.
 */

import { prisma } from "../src/lib/prisma";

const GENERIC_PATTERNS = [
  /^Bonifico\s+SEPA(\s+|$)/i,
  /^Bonifico\s+Istantaneo$/i,
  /^SEPA\s+Direct\s+Debit$/i,
  /^Pagamento\s+Visa/i,
  /^Pagamento\s+POS/i,
  /^Prelievo\s+ATM/i,
  /^Versamento\s+contanti/i,
  /^Canone\s+Mensile/i,
  /^Imposta\s+bollo/i,
  /^Stipendio$/i,
  /^Bonifico\s+a\s+Vostro\s+favore/i,
  /^PRELEVEMENT\s+/i,
  /^VIREMENT\s+/i,
  /^COMMISSIONS\s+/i,
  /^VERSEMENT\s+/i,
];

function isGenericBeneficiary(b: string | null): boolean {
  if (!b) return true;
  return GENERIC_PATTERNS.some((p) => p.test(b.trim()));
}

async function main() {
  const dupGroups = await prisma.$queryRaw<
    Array<{ d: string; amount: number; accountId: string; n: number }>
  >`
    SELECT date(date) AS d, amount, accountId, COUNT(*) AS n
    FROM "Transaction"
    GROUP BY d, amount, accountId
    HAVING n > 1
    ORDER BY d DESC
  `;

  let totalAmbiguous = 0;
  const lines: string[] = [];

  for (const grp of dupGroups) {
    const dayStart = new Date(grp.d + "T00:00:00.000Z");
    const dayEnd = new Date(grp.d + "T23:59:59.999Z");
    const txs = await prisma.transaction.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        amount: grp.amount,
        accountId: grp.accountId,
      },
      include: {
        account: { select: { name: true } },
        category: { select: { emoji: true, name: true } },
      },
    });

    if (txs.some((t) => t.transferGroupId !== null)) continue; // skip transfer
    if (txs.some((t) => isGenericBeneficiary(t.beneficiary))) continue; // skip già pulibili

    totalAmbiguous++;
    lines.push("");
    lines.push(
      `🔁 #${totalAmbiguous}  ${grp.d}  ${grp.amount.toFixed(2).padStart(10)} €  · ${txs[0].account.name}`,
    );
    for (const t of txs) {
      const cat = t.category ? `${t.category.emoji} ${t.category.name}` : "(no cat)";
      const notes = t.notes ? ` · note: ${t.notes.slice(0, 60)}` : "";
      lines.push(
        `   • [${t.id.slice(-6)}] ${(t.beneficiary ?? "(null)").padEnd(40).slice(0, 40)} | ${cat}${notes}`,
      );
    }
  }

  console.log(`\n📊 ${totalAmbiguous} gruppi ambigui da rivedere a mano:\n`);
  console.log(lines.join("\n"));
  console.log(`\n💡 Per modificarne uno:`);
  console.log(`   1. Apri /movimenti nell'app`);
  console.log(`   2. Filtra per anno o cerca il beneficiary nel campo q (search)`);
  console.log(`   3. Per ogni coppia: tieni la più informativa, cancella l'altra`);
  console.log(`   (oppure dimmi che vuoi una UI dedicata e te la creo)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Errore:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
