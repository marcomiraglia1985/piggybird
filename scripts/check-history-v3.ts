import { getInvestmentsHistoryV2 } from "../src/lib/investments-history";
async function main() {
  const points = await getInvestmentsHistoryV2();
  console.log(`${points.length} points\n`);
  console.log("Month    | Portfolio  | Cost Basis | P/L         | %");
  console.log("---------+------------+------------+-------------+-------");
  for (const p of points) {
    const pl = p.total - p.costBasis;
    const pct = p.costBasis > 0 ? (pl/p.costBasis)*100 : 0;
    const sign = pl >= 0 ? "+" : "";
    console.log(`${p.month.slice(0,7)}  | €${p.total.toFixed(0).padStart(8)} | €${p.costBasis.toFixed(0).padStart(8)} | ${sign}€${pl.toFixed(0).padStart(8)} | ${sign}${pct.toFixed(1)}%`);
  }
}
main().catch(console.error).finally(()=>process.exit());
