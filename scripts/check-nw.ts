import { prisma } from "../src/lib/prisma";

async function main() {
  const accounts = await prisma.account.findMany({ where: { active: true } });
  let liquidNonFs = 0, savings = 0, fsNetSum = 0;

  console.log("=== Friendsplit detail ===");
  for (const a of accounts) {
    const eff = a.currentBalance * a.ownershipShare;
    if (a.type === "liquid" || a.type === "cash" || a.type === "joint") liquidNonFs += eff;
    else if (a.type === "savings") savings += eff;
    else if (a.type === "friendsplit") {
      const sums = await prisma.transaction.aggregate({
        where: { accountId: a.id },
        _sum: { amount: true },
      });
      const net = sums._sum.amount ?? 0;
      fsNetSum += net;
      console.log(`  ${a.name.padEnd(35)} sum(tx)=${net.toFixed(2).padStart(10)}  currentBalance=${a.currentBalance.toFixed(2).padStart(10)}  diff=${(net-a.currentBalance).toFixed(2)}`);
    }
  }
  const investments = await prisma.investment.findMany();
  const investTotal = investments.reduce((s, i) => s + i.currentValue, 0);
  const liquidity = liquidNonFs + fsNetSum;
  const total = liquidity + savings + investTotal;

  console.log("\n=== Totali net worth (post-fix) ===");
  console.log(`  Liquid non-FS:     ${liquidNonFs.toFixed(2)}`);
  console.log(`  Friendsplit net:   ${fsNetSum.toFixed(2)}  ${fsNetSum >= 0 ? "(receivable)" : "(payable)"}`);
  console.log(`  Liquidity total:   ${liquidity.toFixed(2)}`);
  console.log(`  Savings:           ${savings.toFixed(2)}`);
  console.log(`  Investments:       ${investTotal.toFixed(2)}`);
  console.log(`  ─────`);
  console.log(`  TOTAL NET WORTH:   ${total.toFixed(2)}`);
  console.log(`\nDelta vs prima del fix (FS escluso): ${fsNetSum.toFixed(2)}`);
}
main().catch(console.error).finally(() => process.exit());
