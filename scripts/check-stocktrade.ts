import { prisma } from "../src/lib/prisma";

async function main() {
  const types = await prisma.stockTrade.groupBy({
    by: ["type"],
    _count: { _all: true },
    _sum: { amountEur: true },
  });
  console.log("=== StockTrade types ===");
  for (const t of types) {
    console.log(`  ${t.type.padEnd(12)} count=${t._count._all.toString().padStart(4)}  sum=${(t._sum.amountEur ?? 0).toFixed(2).padStart(12)}`);
  }
  
  // CryptoTrade types if any
  const ct = await prisma.cryptoTrade.findMany();
  console.log(`\n=== CryptoTrade entries: ${ct.length} ===`);
  if (ct.length > 0) {
    console.log(JSON.stringify(ct[0], null, 2));
  }
  
  // CryptoCostBasis 
  const ccb = await prisma.cryptoCostBasis.findMany();
  console.log(`\n=== CryptoCostBasis entries: ${ccb.length} ===`);
  for (const c of ccb.slice(0,10)) {
    console.log(`  platform=${c.platform.padEnd(12)} asset=${c.asset.padEnd(8)} costEur=${c.costEur.toFixed(2)}  date=${c.date?.toISOString().slice(0,10) ?? '-'}`);
  }
}
main().catch(console.error).finally(() => process.exit());
