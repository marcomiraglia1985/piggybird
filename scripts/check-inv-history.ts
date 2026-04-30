import { prisma } from "../src/lib/prisma";

async function main() {
  // Snapshots
  const snapshots = await prisma.netWorthSnapshot.findMany({
    orderBy: { month: "asc" },
  });
  console.log(`Snapshots totali: ${snapshots.length}`);
  console.log(`  con investments != null: ${snapshots.filter(s => s.investments != null).length}`);
  console.log(`  con investments NULL: ${snapshots.filter(s => s.investments == null).length}`);
  
  console.log("\n=== Snapshots con investments ===");
  for (const s of snapshots.filter(s => s.investments != null)) {
    console.log(`  ${s.month.toISOString().slice(0,7)}  investments=${s.investments?.toFixed(2)?.padStart(12)}  total=${s.total.toFixed(2)}`);
  }
  
  console.log("\n=== Tx investment cumulative ===");
  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      category: { type: "investment" },
    },
    select: { date: true, amount: true, beneficiary: true, category: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  console.log(`Tx investment totali: ${txs.length}`);
  let cum = 0;
  let peak = 0;
  let peakMonth = "";
  const monthly = new Map<string, number>();
  for (const tx of txs) {
    cum += -tx.amount;
    const k = tx.date.toISOString().slice(0,7);
    monthly.set(k, cum);
    if (cum > peak) { peak = cum; peakMonth = k; }
  }
  console.log(`Cumulative invested totale (cost basis): ${cum.toFixed(2)}`);
  console.log(`Peak cumulative: ${peak.toFixed(2)} a ${peakMonth}`);
  
  // Mostra i 5 mesi col cumulative più alto
  const sortedMonths = Array.from(monthly.entries()).sort((a,b) => b[1]-a[1]);
  console.log("\nTop 5 mesi per cumulative invested:");
  for (const [m, v] of sortedMonths.slice(0,5)) {
    console.log(`  ${m}  ${v.toFixed(2)}`);
  }
  
  // Investment current values
  const investments = await prisma.investment.findMany();
  const total = investments.reduce((s,i) => s + i.currentValue, 0);
  console.log(`\nValore attuale portafoglio (Investment.currentValue): ${total.toFixed(2)}`);
}
main().catch(console.error).finally(() => process.exit());
