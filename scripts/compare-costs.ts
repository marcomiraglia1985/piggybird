import { prisma } from "../src/lib/prisma";

async function main() {
  // === TOP BOX: position-level cost ===
  const stockPositions = await prisma.stockPosition.findMany();
  const stocksCostEur = stockPositions.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.avgCost * p.fxToEur : s), 0,
  );
  
  const cryptoCostBases = await prisma.cryptoCostBasis.findMany();
  const cryptoCostTotal = cryptoCostBases.reduce((s, c) => s + c.costEur, 0);
  
  const investments = await prisma.investment.findMany({ where: { currentValue: { gt: 0 } } });
  let investLevelCost = 0;
  const stockPlats = new Set(stockPositions.map(p => p.platform));
  const cryptoPlats = new Set(cryptoCostBases.map(c => c.platform));
  for (const inv of investments) {
    if (inv.costEur != null) {
      if (inv.type === "stocks" && stockPlats.has(inv.platform)) continue;
      if (inv.type === "crypto" && cryptoPlats.has(inv.platform)) continue;
      investLevelCost += inv.costEur;
    }
  }
  const topBoxCost = stocksCostEur + cryptoCostTotal + investLevelCost;
  console.log(`=== TOP BOX (position-level cost basis) ===`);
  console.log(`  stocks:           €${stocksCostEur.toFixed(2)}`);
  console.log(`  crypto cost basis:€${cryptoCostTotal.toFixed(2)}`);
  console.log(`  invest-level:     €${investLevelCost.toFixed(2)}`);
  console.log(`  TOTAL:            €${topBoxCost.toFixed(2)}`);
  
  // === CHART: cumulative cashflow ===
  const stockTrades = await prisma.stockTrade.findMany({
    where: { type: { in: ["TOP-UP", "WITHDRAWAL"] } },
  });
  const stocksCash = stockTrades.reduce(
    (s, e) => s + (e.type === "TOP-UP" ? e.amountEur : -e.amountEur), 0,
  );
  const cryptoTrades = await prisma.cryptoTrade.findMany({ where: { totalEur: { gt: 0 } } });
  const cryptoNetCash = cryptoTrades.reduce(
    (s, e) => s + (e.direction === "buy" ? e.totalEur : -e.totalEur), 0,
  );
  // Lump sum delta
  let lumpDelta = 0;
  const trackedByPlat = new Map<string, number>();
  for (const e of cryptoTrades) {
    const k = `crypto|${e.platform}`;
    trackedByPlat.set(k, (trackedByPlat.get(k) ?? 0) + (e.direction === "buy" ? e.totalEur : -e.totalEur));
  }
  for (const inv of investments) {
    if (inv.costEur == null) continue;
    if (inv.type !== "crypto") continue;
    const k = `crypto|${inv.platform ?? ""}`;
    const tracked = trackedByPlat.get(k) ?? 0;
    const delta = inv.costEur - tracked;
    if (delta > 0.01) lumpDelta += delta;
  }
  const chartCost = stocksCash + cryptoNetCash + lumpDelta;
  console.log(`\n=== CHART (cumulative cashflow) ===`);
  console.log(`  stocks TOP-UP - WITHDRAWAL: €${stocksCash.toFixed(2)}`);
  console.log(`  crypto buy - sell:          €${cryptoNetCash.toFixed(2)}`);
  console.log(`  lump sum delta:             €${lumpDelta.toFixed(2)}`);
  console.log(`  TOTAL:                      €${chartCost.toFixed(2)}`);
  
  // Current value
  const currentValue = investments.reduce((s, i) => s + i.currentValue, 0);
  console.log(`\n=== CURRENT VALUE ===`);
  console.log(`  €${currentValue.toFixed(2)}`);
  
  console.log(`\n=== DELTA ===`);
  console.log(`  Top box P/L:  €${(currentValue - topBoxCost).toFixed(2)}  (${(((currentValue - topBoxCost) / topBoxCost) * 100).toFixed(1)}%)`);
  console.log(`  Chart  P/L:   €${(currentValue - chartCost).toFixed(2)}  (${(((currentValue - chartCost) / chartCost) * 100).toFixed(1)}%)`);
  console.log(`  Differenza:   €${(topBoxCost - chartCost).toFixed(2)}`);
}
main().catch(console.error).finally(() => process.exit());
