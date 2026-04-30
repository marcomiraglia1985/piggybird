import { getInvestmentsHistoryV2 } from "../src/lib/investments-history";
async function main() {
  const points = await getInvestmentsHistoryV2();
  console.log(`${points.length} daily points from ${points[0]?.month?.slice(0,10)} to ${points[points.length-1]?.month?.slice(0,10)}`);
  
  // Min, max, key transitions
  let min = points[0], max = points[0];
  for (const p of points) {
    if (p.total < min.total) min = p;
    if (p.total > max.total) max = p;
  }
  console.log(`\nMin: ${min.month.slice(0,10)} = €${min.total.toFixed(0)} (cost €${min.costBasis.toFixed(0)})`);
  console.log(`Max: ${max.month.slice(0,10)} = €${max.total.toFixed(0)} (cost €${max.costBasis.toFixed(0)})`);
  
  // Sample monthly
  console.log("\nMonthly samples:");
  const seen = new Set<string>();
  for (const p of points) {
    const m = p.month.slice(0,7);
    if (seen.has(m)) continue;
    seen.add(m);
    if (Math.random() > 0.85 || seen.size <= 3 || seen.size > 80) {
      console.log(`  ${m}  port=€${p.total.toFixed(0).padStart(7)}  cost=€${p.costBasis.toFixed(0).padStart(6)}  P/L=${p.total >= p.costBasis ? '+' : ''}€${(p.total-p.costBasis).toFixed(0)}`);
    }
  }
}
main().catch(console.error).finally(()=>process.exit());
