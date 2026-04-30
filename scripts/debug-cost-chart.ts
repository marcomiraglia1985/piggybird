import { prisma } from "../src/lib/prisma";

async function main() {
  // Reproduce the cost basis computation logic
  const stockTrades = await prisma.stockTrade.findMany({
    where: { type: { in: ["BUY","SELL","TOP-UP","WITHDRAWAL"] } },
    orderBy: { date: "asc" },
  });
  const cryptoTrades = await prisma.cryptoTrade.findMany({ orderBy: { date: "asc" } });
  const allInvestments = await prisma.investment.findMany();
  const cryptoCostBases = await prisma.cryptoCostBasis.findMany();
  
  // ccbByPlatform
  const ccbByPlatform = new Map<string, number>();
  for (const c of cryptoCostBases) {
    const k = `crypto|${c.platform}`;
    ccbByPlatform.set(k, (ccbByPlatform.get(k) ?? 0) + c.costEur);
  }
  console.log("ccbByPlatform:");
  for (const [k,v] of ccbByPlatform) console.log(`  ${k}: ${v}`);
  
  // investCostByPlatform
  const investCostByPlatform = new Map<string, number>();
  for (const inv of allInvestments) {
    if (inv.type !== "crypto" || inv.costEur == null || inv.costEur <= 0) continue;
    investCostByPlatform.set(`crypto|${inv.platform ?? ""}`, inv.costEur);
  }
  console.log("\ninvestCostByPlatform:");
  for (const [k,v] of investCostByPlatform) console.log(`  ${k}: ${v}`);
  
  // firstEventByPlatform
  const firstEventByPlatform = new Map<string, number>();
  for (const e of cryptoTrades) {
    const k = `crypto|${e.platform}`;
    const dms = new Date(Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), e.date.getUTCDate())).getTime();
    if (!firstEventByPlatform.has(k) || dms < firstEventByPlatform.get(k)!) {
      firstEventByPlatform.set(k, dms);
    }
  }
  console.log("\nfirstEventByPlatform:");
  for (const [k,v] of firstEventByPlatform) console.log(`  ${k}: ${new Date(v).toISOString().slice(0,10)}`);
  
  const allCryptoPlatforms = new Set<string>([
    ...ccbByPlatform.keys(),
    ...investCostByPlatform.keys(),
    ...firstEventByPlatform.keys(),
  ]);
  console.log("\nallCryptoPlatforms:", [...allCryptoPlatforms]);
  
  // Compute crypto cost at last day
  let cryptoCost = 0;
  const todayMs = Date.now();
  for (const k of allCryptoPlatforms) {
    const ccb = ccbByPlatform.get(k);
    const inv = investCostByPlatform.get(k);
    if (ccb && ccb > 0) {
      cryptoCost += ccb;
      console.log(`\n  ${k}: ccb=${ccb}`);
    } else if (inv && inv > 0) {
      cryptoCost += inv;
      console.log(`\n  ${k}: inv=${inv}`);
    } else {
      console.log(`\n  ${k}: tier3 cumulative trades:`);
      let tot = 0;
      for (const e of cryptoTrades) {
        if (`crypto|${e.platform}` !== k) continue;
        if (e.totalEur === 0) continue;
        const d = e.direction === "buy" ? e.totalEur : -e.totalEur;
        tot += d;
      }
      cryptoCost += tot;
      console.log(`     tot = ${tot}`);
    }
  }
  console.log(`\n=== CRYPTO COST: €${cryptoCost.toFixed(2)} ===`);
}
main().catch(console.error).finally(()=>process.exit());
