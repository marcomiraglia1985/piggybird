import { getInvestmentsHistoryV2 } from "../src/lib/investments-history";
async function main() {
  const points = await getInvestmentsHistoryV2();
  console.log(`Last 3 points:`);
  for (const p of points.slice(-3)) {
    console.log(`  ${p.month.slice(0,10)}  port=€${p.total.toFixed(2)}  cost=€${p.costBasis.toFixed(2)}`);
  }
}
main().catch(console.error).finally(()=>process.exit());
