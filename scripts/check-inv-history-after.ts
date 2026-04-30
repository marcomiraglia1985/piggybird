import { prisma } from "../src/lib/prisma";
import { getInvestmentsHistory } from "../src/lib/queries";

async function main() {
  const data = await getInvestmentsHistory();
  console.log(`Punti totali: ${data.length}`);
  
  // Trova il peak
  let peak = { month: "", total: 0 };
  for (const p of data) {
    if (p.total > peak.total) peak = { month: p.month.slice(0,7), total: p.total };
  }
  console.log(`\nPeak: ${peak.total.toFixed(2)} a ${peak.month}`);
  
  console.log("\nUltimi 10 punti:");
  for (const p of data.slice(-10)) {
    console.log(`  ${p.month.slice(0,7)}  ${p.total.toFixed(2)}`);
  }
  
  console.log("\nPrimi 10 punti:");
  for (const p of data.slice(0,10)) {
    console.log(`  ${p.month.slice(0,7)}  ${p.total.toFixed(2)}`);
  }
}
main().catch(console.error).finally(() => process.exit());
