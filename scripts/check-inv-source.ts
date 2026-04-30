import { prisma } from "../src/lib/prisma";

async function main() {
  // Tx investment by category
  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      category: { type: "investment" },
    },
    select: { date: true, amount: true, beneficiary: true, category: { select: { name: true, emoji: true } } },
  });
  
  // Group by category
  const byCat = new Map<string, { count: number; sum: number }>();
  for (const t of txs) {
    const k = `${t.category?.emoji ?? '?'} ${t.category?.name ?? '?'}`;
    const cur = byCat.get(k) ?? { count: 0, sum: 0 };
    cur.count++;
    cur.sum += t.amount;
    byCat.set(k, cur);
  }
  console.log("=== Tx investment per categoria ===");
  for (const [k, v] of [...byCat.entries()].sort((a,b) => Math.abs(b[1].sum) - Math.abs(a[1].sum))) {
    console.log(`  ${k.padEnd(40)} count=${v.count.toString().padStart(4)}  sum=${v.sum.toFixed(2).padStart(12)}`);
  }
  
  // StockTrade events
  const events = await prisma.stockTrade.findMany({
    where: { type: { in: ["TOP-UP", "WITHDRAWAL"] } },
  });
  console.log(`\n=== StockTrade events (TOP-UP/WITHDRAWAL) ===`);
  console.log(`  Total: ${events.length}`);
  const topups = events.filter(e => e.type === "TOP-UP");
  const withdrawals = events.filter(e => e.type === "WITHDRAWAL");
  const sumTop = topups.reduce((s,e) => s + e.amountEur, 0);
  const sumWd = withdrawals.reduce((s,e) => s + e.amountEur, 0);
  console.log(`  TOP-UP:     ${topups.length}  totale ${sumTop.toFixed(2)}`);
  console.log(`  WITHDRAWAL: ${withdrawals.length}  totale ${sumWd.toFixed(2)}`);
  console.log(`  Net invested in stocks: ${(sumTop - sumWd).toFixed(2)}`);
  
  // CryptoTrade
  const cryptoTrades = await prisma.cryptoTrade.findMany();
  console.log(`\n=== CryptoTrade events ===`);
  console.log(`  Total: ${cryptoTrades.length}`);
  
  // Investment current
  const inv = await prisma.investment.findMany();
  console.log(`\n=== Investment.currentValue ===`);
  for (const i of inv) {
    console.log(`  ${i.name.padEnd(35)} type=${i.type.padEnd(8)} platform=${(i.platform ?? '-').padEnd(15)} value=${i.currentValue.toFixed(2)}  cost=${i.costEur?.toFixed(2) ?? '-'}`);
  }
}
main().catch(console.error).finally(() => process.exit());
