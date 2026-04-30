import { getInvestmentsHistoryV2, hasInvestmentData } from "../src/lib/investments-history";
async function main() {
  console.log("Has data:", await hasInvestmentData());
  console.log("\nFetching history (può richiedere qualche secondo per gli API esterni)...\n");
  const t0 = Date.now();
  const points = await getInvestmentsHistoryV2();
  const dt = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`Generated ${points.length} points in ${dt}s\n`);
  
  // Sample
  if (points.length > 0) {
    console.log("First 5:");
    for (const p of points.slice(0,5)) console.log(`  ${p.month.slice(0,7)}  €${p.total.toFixed(2)}`);
    console.log("Last 5:");
    for (const p of points.slice(-5)) console.log(`  ${p.month.slice(0,7)}  €${p.total.toFixed(2)}`);
    
    // Min, max
    let min = points[0], max = points[0];
    for (const p of points) {
      if (p.total < min.total) min = p;
      if (p.total > max.total) max = p;
    }
    console.log(`\nMin: ${min.month.slice(0,7)} = €${min.total.toFixed(2)}`);
    console.log(`Max: ${max.month.slice(0,7)} = €${max.total.toFixed(2)}`);
  }
}
main().catch(e => { console.error(e); }).finally(()=>process.exit());
