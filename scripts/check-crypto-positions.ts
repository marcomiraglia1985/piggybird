import { prisma } from "../src/lib/prisma";

async function main() {
  const cp = await prisma.cryptoPosition.findMany();
  console.log(`=== CryptoPosition (correnti) ===`);
  if (cp.length > 0) {
    console.log(JSON.stringify(cp[0], null, 2));
    console.log(`  ...total: ${cp.length}`);
    // Group by platform
    const byPlat = new Map<string, number>();
    for (const p of cp) byPlat.set(p.platform, (byPlat.get(p.platform) ?? 0) + 1);
    console.log("\n  per piattaforma:");
    for (const [pl, n] of byPlat.entries()) console.log(`    ${pl}: ${n}`);
    // Top 10 by eur value
    cp.sort((a:any,b:any) => (b.eurValue ?? 0) - (a.eurValue ?? 0));
    console.log("\n  top 10 by valore EUR:");
    for (const p of cp.slice(0,10)) {
      console.log(`    ${p.platform.padEnd(12)} ${p.asset.padEnd(8)} eur=${(p as any).eurValue?.toFixed?.(2) ?? '-'}`);
    }
  }
  
  const trades = await prisma.stockTrade.findMany({
    where: { type: { in: ["BUY", "SELL"] } },
    select: { ticker: true },
  });
  const tickers = [...new Set(trades.map(t => t.ticker))];
  console.log(`\n=== Tickers stock: ${tickers.length} ===`);
  console.log(`  ${tickers.sort().join(", ")}`);
}
main().catch(console.error).finally(() => process.exit());
