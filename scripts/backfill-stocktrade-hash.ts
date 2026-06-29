/**
 * Ricalcola l'hash STABILE su tutti gli StockTrade esistenti (vedi
 * hashStockEvent in src/lib/broker-parsers/index.ts) e rimuove gli eventuali
 * duplicati residui che ora collassano sullo stesso hash. Poi ricostruisce
 * posizioni + cassa per le piattaforme toccate.
 *
 * Idempotente: ri-eseguibile senza effetti (gli hash sono già stabili dopo
 * la prima volta, e i duplicati già rimossi).
 *
 *   npx tsx scripts/backfill-stocktrade-hash.ts
 */
import { prisma } from "../src/lib/prisma";
import { hashStockEvent } from "../src/lib/broker-parsers";
import { rebuildStockPositions } from "../src/lib/stock-positions-rebuilder";

async function main() {
  const trades = await prisma.stockTrade.findMany();
  console.log(`${trades.length} trade totali.`);

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

  // Raggruppa per hash stabile: gruppi con >1 = duplicati residui.
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
    arr.sort((a, b) => (a.id < b.id ? -1 : 1)); // tieni il più vecchio
    for (let i = 1; i < arr.length; i++) {
      toDelete.push(arr[i].id);
      affected.add(arr[i].platform);
    }
  }

  if (toDelete.length > 0) {
    console.log(`Duplicati residui da rimuovere: ${toDelete.length}`);
    await prisma.stockTrade.deleteMany({ where: { id: { in: toDelete } } });
  } else {
    console.log("Nessun duplicato residuo. ✓");
  }

  // Aggiorna gli hash dei trade rimasti al valore stabile (in transazione a batch).
  const remaining = await prisma.stockTrade.findMany();
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < remaining.length; i += BATCH) {
    const slice = remaining.slice(i, i + BATCH);
    await prisma.$transaction(
      slice.map((t) =>
        prisma.stockTrade.update({ where: { id: t.id }, data: { hash: newHash(t) } }),
      ),
    );
    updated += slice.length;
  }
  console.log(`Hash stabilizzati su ${updated} trade.`);

  // Ricostruisci posizioni+cassa per le piattaforme che hanno perso duplicati.
  for (const platform of affected) {
    const r = await rebuildStockPositions(platform);
    console.log(`Rebuild ${platform}: ${JSON.stringify(r)}`);
  }
  if (affected.size === 0) console.log("Nessun rebuild necessario (nessun duplicato rimosso).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
