import { prisma } from "@/lib/prisma";
import { computeSourceHash } from "@/lib/source-hash";
import { hashStockEvent } from "@/lib/broker-parsers";
import { rebuildStockPositions } from "@/lib/stock-positions-rebuilder";

/**
 * Migrazioni dati ONE-TIME eseguite al primo avvio dopo un upgrade dell'app.
 *
 * Guardate da un flag in Setting: girano una volta sola per chiave, poi sono
 * no-op. Idempotenti comunque (riempiono solo i null / ricalcolano stabile),
 * così anche un'esecuzione doppia è innocua. Wrappate dal chiamante in
 * try/catch: NON devono mai bloccare il boot dell'app.
 *
 * Perché servono: i backfill su DB esistenti (sourceHash sui movimenti, hash
 * stabile sui trade) sono indispensabili o i re-import creano duplicati. Sul
 * Mac dell'utente nessuno lancerebbe gli script a mano → li facciamo al boot.
 */
const KEY_DEDUP_HASHES = "dataMigration_dedupHashes_v1";

export async function runStartupDataMigrations(): Promise<void> {
  const done = await prisma.setting.findUnique({ where: { key: KEY_DEDUP_HASHES } });
  if (done?.value === "done") return;

  await backfillTransactionSourceHash();
  await stabilizeStockTradeHashes();

  await prisma.setting.upsert({
    where: { key: KEY_DEDUP_HASHES },
    create: { key: KEY_DEDUP_HASHES, value: "done" },
    update: { value: "done" },
  });
  console.log("[startup-migrations] dedup hashes backfill: OK");
}

/** Popola Transaction.sourceHash dove mancante (dedup import bancari). */
async function backfillTransactionSourceHash(): Promise<void> {
  const txs = await prisma.transaction.findMany({
    where: { sourceHash: null },
    select: { id: true, date: true, amount: true, beneficiary: true, notes: true },
  });
  if (txs.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < txs.length; i += BATCH) {
    const slice = txs.slice(i, i + BATCH);
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
  }
  console.log(`[startup-migrations] sourceHash backfill: ${txs.length} movimenti`);
}

/**
 * Ricalcola l'hash STABILE su tutti gli StockTrade, rimuove i duplicati che ora
 * collassano sullo stesso hash (causati dal vecchio hash instabile) e ricostruisce
 * posizioni+cassa per le piattaforme toccate.
 */
async function stabilizeStockTradeHashes(): Promise<void> {
  const trades = await prisma.stockTrade.findMany();
  if (trades.length === 0) return;

  const newHash = (t: (typeof trades)[number]) =>
    hashStockEvent({
      platform: t.platform,
      type: t.type,
      date: t.date.toISOString(),
      ticker: t.ticker,
      quantity: t.quantity,
      pricePerUnit: t.pricePerUnit,
      amountEur: t.amountEur,
      currency: t.currency,
      fxRate: t.fxRate,
    });

  const groups = new Map<string, typeof trades>();
  for (const t of trades) {
    const h = newHash(t);
    const arr = groups.get(h) ?? [];
    arr.push(t);
    groups.set(h, arr);
  }

  const toDelete: string[] = [];
  const affected = new Set<string>();
  for (const [, arr] of groups) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let i = 1; i < arr.length; i++) {
      toDelete.push(arr[i].id);
      affected.add(arr[i].platform);
    }
  }
  if (toDelete.length > 0) {
    await prisma.stockTrade.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`[startup-migrations] trade duplicati rimossi: ${toDelete.length}`);
  }

  const remaining = await prisma.stockTrade.findMany();
  const BATCH = 500;
  for (let i = 0; i < remaining.length; i += BATCH) {
    const slice = remaining.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((t) => prisma.stockTrade.update({ where: { id: t.id }, data: { hash: newHash(t) } })),
    );
  }

  for (const platform of affected) {
    await rebuildStockPositions(platform);
  }
  console.log(`[startup-migrations] hash trade stabilizzati: ${remaining.length}`);
}
