/**
 * Backfill di `sourceHash` su tutte le transazioni esistenti, così il dedup
 * deterministico al prossimo import riconosce anche lo storico già caricato.
 *
 * Idempotente: aggiorna solo le tx con sourceHash NULL — ri-eseguibile senza
 * effetti collaterali. `bankBalance`/`rawLine` restano null sullo storico
 * (la riga grezza del CSV originale non è più disponibile).
 *
 *   npx tsx scripts/backfill-source-hash.ts
 */
import { prisma } from "../src/lib/prisma";
import { computeSourceHash } from "../src/lib/source-hash";

async function main() {
  const txs = await prisma.transaction.findMany({
    select: { id: true, date: true, amount: true, beneficiary: true, notes: true, sourceHash: true },
  });
  console.log(`Trovate ${txs.length} transazioni totali.`);

  const todo = txs.filter((t) => !t.sourceHash);
  console.log(`${todo.length} da popolare, ${txs.length - todo.length} già con hash.`);

  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((t) =>
        prisma.transaction.update({
          where: { id: t.id },
          data: {
            sourceHash: computeSourceHash({
              date: t.date,
              amount: t.amount,
              beneficiary: t.beneficiary,
              notes: t.notes,
            }),
          },
        }),
      ),
    );
    done += slice.length;
    console.log(`  ...${done}/${todo.length}`);
  }
  console.log(`Fatto: ${done} transazioni aggiornate.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
