/**
 * Find/dedupe duplicate transactions.
 *
 * Caso tipico: stessa tx importata 2 volte — una dall'Excel master con beneficiary
 * "ricco" (es. "Vetreria Cremonese") e una dal CSV bancario con beneficiary
 * "generico" (es. "Bonifico SEPA Italia").
 *
 * Strategia per ogni gruppo (date + amount + accountId con count > 1):
 *   - Sceglie una "winner" da TENERE
 *   - Tutte le altre vengono cancellate
 *
 * Regola di priorità (winner score):
 *   1. Tx con notes valorizzate vincono (la causale è preziosa)
 *   2. Tx con categoryId valorizzato vincono
 *   3. Tx con beneficiary più informativo (NON in lista pattern bancari generici)
 *   4. Tx più vecchia per createdAt (Excel-source di solito è più vecchia)
 *
 * Uso:
 *   tsx scripts/find-duplicates.ts          # dry-run, mostra i gruppi
 *   tsx scripts/find-duplicates.ts --apply  # cancella i duplicati
 *
 * Sicurezza:
 *   - Default = dry-run, nessuna scrittura
 *   - Cancella SOLO tx in gruppi con count > 1
 *   - Tiene SEMPRE almeno una tx per gruppo (la winner)
 *   - Skippa gruppi con transferGroupId (per non rompere paired transfers)
 *   - Backup raccomandato: cp dev.db dev.db.backup-YYYY-MM-DD
 */

import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");

// Pattern beneficiary "generici" auto-generati dai parser bancari, vs nomi
// semantici scritti dall'utente nell'Excel master.
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

/** Punteggio winner: più alto = preferito da tenere. */
function scoreWinner(tx: {
  notes: string | null;
  categoryId: string | null;
  beneficiary: string | null;
  createdAt: Date;
}): number {
  let s = 0;
  if (tx.notes && tx.notes.trim().length > 0) s += 1000;
  if (tx.categoryId) s += 500;
  if (tx.beneficiary && !isGenericBeneficiary(tx.beneficiary)) s += 250;
  // Excel più vecchio → preferito (millis dal 2000 invertiti)
  s -= Math.floor((tx.createdAt.getTime() - new Date(2020, 0).getTime()) / 1000);
  return s;
}

async function main() {
  // Trova gruppi duplicati via raw SQL (Prisma groupBy su date richiede tronc giorno).
  const dupGroups = await prisma.$queryRaw<
    Array<{ d: string; amount: number; accountId: string; n: number }>
  >`
    SELECT date(date) AS d, amount, accountId, COUNT(*) AS n
    FROM "Transaction"
    GROUP BY d, amount, accountId
    HAVING n > 1
    ORDER BY d DESC
  `;

  console.log(`📊 Trovati ${dupGroups.length} gruppi con duplicati`);
  if (dupGroups.length === 0) {
    console.log("Nessun duplicato. Tutto pulito!");
    return;
  }

  let totalToDelete = 0;
  let totalToKeep = 0;
  let skippedTransfer = 0;
  let skippedAmbiguous = 0;
  const toDelete: Array<{
    txId: string;
    date: string;
    amount: number;
    beneficiary: string | null;
    accountName: string;
  }> = [];

  for (const grp of dupGroups) {
    const dayStart = new Date(grp.d + "T00:00:00.000Z");
    const dayEnd = new Date(grp.d + "T23:59:59.999Z");
    const txs = await prisma.transaction.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        amount: grp.amount,
        accountId: grp.accountId,
      },
      include: { account: { select: { name: true } } },
    });

    // Skippa gruppi con transferGroupId (paired tx, dedup richiede logica
    // diversa per non rompere le coppie)
    const hasTransfer = txs.some((t) => t.transferGroupId !== null);
    if (hasTransfer) {
      skippedTransfer++;
      continue;
    }

    // SAFETY: dedup SOLO se almeno una tx ha beneficiary "generico" (auto-import
    // bancario tipo "Bonifico SEPA Italia", "PRELEVEMENT EDF"). Se TUTTE hanno
    // beneficiary semantici, sono potenzialmente tx legittime diverse (es. due
    // pedaggi stesso giorno stesso prezzo) → skip per non cancellare per errore.
    const hasGeneric = txs.some((t) => isGenericBeneficiary(t.beneficiary));
    if (!hasGeneric) {
      skippedAmbiguous++;
      if (skippedAmbiguous <= 5) {
        console.log(
          `   ⏭️  AMBIGUO ${grp.d} · ${grp.amount.toFixed(2)} € · ${txs[0].account.name}: ${txs.map((t) => t.beneficiary).join(" | ")}`,
        );
      }
      continue;
    }

    // Sort per score desc → primo è il winner
    const sorted = [...txs].sort((a, b) => scoreWinner(b) - scoreWinner(a));
    const winner = sorted[0];
    // Cancelliamo SOLO i losers con beneficiary generico (per non perdere
    // info se Marco aveva inserito manualmente entrambe per qualche motivo).
    const losers = sorted.slice(1).filter((l) => isGenericBeneficiary(l.beneficiary));
    if (losers.length === 0) continue;

    totalToKeep++;
    totalToDelete += losers.length;

    for (const l of losers) {
      toDelete.push({
        txId: l.id,
        date: grp.d,
        amount: grp.amount,
        beneficiary: l.beneficiary,
        accountName: l.account.name,
      });
    }

    if (totalToKeep <= 8) {
      // Dettaglio dei primi gruppi per ispezione
      console.log(`\n🔁 ${grp.d} · ${grp.amount.toFixed(2)} € · ${winner.account.name}`);
      for (const t of sorted) {
        const tag = t.id === winner.id ? "🏆 KEEP" : "🗑️  DEL ";
        console.log(
          `   ${tag} | ${(t.beneficiary ?? "(null)").padEnd(40).slice(0, 40)} | ` +
            `cat=${t.categoryId ? "✓" : "✗"} notes=${t.notes ? "✓" : "✗"}`,
        );
      }
    }
  }

  console.log(`\n📊 RIEPILOGO:`);
  console.log(`   🏆 Tx da TENERE (winner per gruppo): ${totalToKeep}`);
  console.log(`   🗑️  Tx da CANCELLARE: ${totalToDelete}`);
  console.log(`   ⏭️  Gruppi skippati (transferGroupId): ${skippedTransfer}`);
  console.log(`   ⏭️  Gruppi skippati (ambigui, due benef. semantici): ${skippedAmbiguous}`);

  if (!apply) {
    console.log("\n🔍 DRY-RUN: nessuna modifica. Aggiungi --apply per cancellare.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNessuna tx da cancellare.");
    return;
  }

  console.log(`\n🗑️  Cancellazione di ${toDelete.length} duplicati…`);
  let done = 0;
  for (const t of toDelete) {
    await prisma.transaction.delete({ where: { id: t.txId } });
    done++;
  }
  console.log(`✅ ${done} tx cancellate.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Errore:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
