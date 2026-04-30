import { prisma } from "../src/lib/prisma";
async function main() {
  const trades = await prisma.cryptoTrade.findMany({orderBy:{date:"asc"}});
  console.log(`Total CryptoTrade: ${trades.length}`);
  const byAsset = new Map<string, number>();
  const byDir = new Map<string, number>();
  for (const t of trades) {
    byAsset.set(t.asset, (byAsset.get(t.asset)??0)+1);
    byDir.set(t.direction, (byDir.get(t.direction)??0)+1);
  }
  console.log("\nPer asset:");
  for (const [a,n] of [...byAsset.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${a}: ${n}`);
  console.log("\nPer direction:");
  for (const [d,n] of byDir) console.log(`  ${d}: ${n}`);
  console.log("\nFirst 5 / Last 5:");
  for (const t of trades.slice(0,5)) console.log(`  ${t.date.toISOString().slice(0,10)} ${t.platform} ${t.direction} ${t.quantity.toFixed(4)} ${t.asset} @ ${t.pricePerUnit} ${t.currency} = €${t.totalEur.toFixed(2)}`);
  console.log(`  ... (${trades.length-10} middle)`);
  for (const t of trades.slice(-5)) console.log(`  ${t.date.toISOString().slice(0,10)} ${t.platform} ${t.direction} ${t.quantity.toFixed(4)} ${t.asset} @ ${t.pricePerUnit} ${t.currency} = €${t.totalEur.toFixed(2)}`);
}
main().catch(console.error).finally(()=>process.exit());
