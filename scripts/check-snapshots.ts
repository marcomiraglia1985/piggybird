import { prisma } from "../src/lib/prisma";

async function main() {
  const snapshots = await prisma.netWorthSnapshot.findMany({
    orderBy: { month: "asc" },
  });
  console.log(`Snapshots: ${snapshots.length}`);
  console.log(`  con liquidity != null: ${snapshots.filter(s => s.liquidity != null).length}`);
  console.log(`  con savings != null: ${snapshots.filter(s => s.savings != null).length}`);
  console.log(`  con credits != null: ${snapshots.filter(s => s.credits != null).length}`);
  console.log(`  con investments != null: ${snapshots.filter(s => s.investments != null).length}`);
  
  console.log("\n=== Sample snapshots (first 5 + last 5) ===");
  const sample = [...snapshots.slice(0,5), ...snapshots.slice(-5)];
  for (const s of sample) {
    const derived = s.total - (s.liquidity ?? 0) - (s.savings ?? 0) - (s.credits ?? 0);
    console.log(`  ${s.month.toISOString().slice(0,7)}  total=${s.total.toFixed(0).padStart(8)}  liq=${(s.liquidity ?? 0).toFixed(0).padStart(7)}  sav=${(s.savings ?? 0).toFixed(0).padStart(7)}  inv=${(s.investments ?? 0).toFixed(0).padStart(7)}  cred=${(s.credits ?? 0).toFixed(0).padStart(7)}  | derived_inv=${derived.toFixed(0).padStart(7)}`);
  }
}
main().catch(console.error).finally(() => process.exit());
