import { prisma } from "../src/lib/prisma";

async function main() {
  const trades = await prisma.cryptoTrade.findMany({});
  console.log(`=== CryptoTrade total: ${trades.length} ===`);
  const bySrc = new Map<string, number>();
  for (const t of trades) bySrc.set(t.source, (bySrc.get(t.source) ?? 0) + 1);
  for (const [s,n] of bySrc) console.log(`  source=${s.padEnd(20)} count=${n}`);
  
  const ccb = await prisma.cryptoCostBasis.findMany();
  console.log(`\n=== CryptoCostBasis total: ${ccb.length} ===`);
  for (const c of ccb) {
    console.log(`  platform=${c.platform.padEnd(12)} asset=${c.asset.padEnd(8)} cost=${c.costEur.toFixed(2).padStart(10)} date=${c.date?.toISOString().slice(0,10) ?? '-'}`);
  }
  
  const tradesByPlat = new Map<string, number>();
  for (const t of trades) tradesByPlat.set(t.platform, (tradesByPlat.get(t.platform) ?? 0) + 1);
  console.log(`\n=== CryptoTrade per platform ===`);
  for (const [pl,n] of tradesByPlat) console.log(`  ${pl}: ${n}`);
}
main().catch(e => { console.error(e); }).finally(() => process.exit());
