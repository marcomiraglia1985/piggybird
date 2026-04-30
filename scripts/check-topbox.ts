import { prisma } from "../src/lib/prisma";

async function main() {
  // Replicate top box exactly
  const investments = await prisma.investment.findMany({ where: { currentValue: { gt: 0 } } });
  const stockPositions = await prisma.stockPosition.findMany({});
  const cryptoCostBases = await prisma.cryptoCostBasis.findMany({});
  
  const stocksCostEur = stockPositions.reduce((s,p) => p.avgCost ? s + p.shares * p.avgCost * p.fxToEur : s, 0);
  const stocksValueWithCost = stockPositions.reduce((s,p) => p.avgCost ? s + p.shares * p.currentPrice * p.fxToEur : s, 0);
  
  const cryptoCostTotal = cryptoCostBases.reduce((s,c) => s + c.costEur, 0);
  const cryptoPositions = await prisma.cryptoPosition.findMany({});
  const cryptoValueWithCost = cryptoPositions
    .filter(p => cryptoCostBases.some(c => c.platform === p.platform && c.asset === p.asset))
    .reduce((s,p) => s + p.eurValue, 0);
  
  let investmentLevelCost = 0, investmentLevelValue = 0;
  for (const inv of investments) {
    if (inv.costEur != null) {
      const hasCryptoBreakdown = inv.type === "crypto" && cryptoCostBases.some(c => c.platform === inv.platform);
      if (hasCryptoBreakdown) continue;
      const hasStockBreakdown = inv.type === "stocks" && stockPositions.some(p => p.platform === inv.platform);
      if (hasStockBreakdown) continue;
      investmentLevelCost += inv.costEur;
      investmentLevelValue += inv.currentValue;
    }
  }
  
  const totalCost = stocksCostEur + cryptoCostTotal + investmentLevelCost;
  const valueOfPriced = stocksValueWithCost + cryptoValueWithCost + investmentLevelValue;
  const unrealizedGain = totalCost > 0 ? valueOfPriced - totalCost : 0;
  const unrealizedPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;
  
  console.log("=== TOP BOX (replicated) ===");
  console.log(`  stocksCostEur:        €${stocksCostEur.toFixed(2)}`);
  console.log(`  stocksValueWithCost:  €${stocksValueWithCost.toFixed(2)}`);
  console.log(`  cryptoCostTotal:      €${cryptoCostTotal.toFixed(2)}  (CryptoCostBasis only)`);
  console.log(`  cryptoValueWithCost:  €${cryptoValueWithCost.toFixed(2)}  (positions w/ CCB)`);
  console.log(`  investmentLevelCost:  €${investmentLevelCost.toFixed(2)}`);
  console.log(`  investmentLevelValue: €${investmentLevelValue.toFixed(2)}`);
  console.log(`  ─`);
  console.log(`  totalCost:            €${totalCost.toFixed(2)}`);
  console.log(`  valueOfPriced:        €${valueOfPriced.toFixed(2)}`);
  console.log(`  unrealizedGain:       €${unrealizedGain.toFixed(2)}  (${unrealizedPct.toFixed(1)}%)`);
  
  const totalCurrent = investments.reduce((s,i) => s + i.currentValue, 0);
  console.log(`\n  total Investment.currentValue: €${totalCurrent.toFixed(2)}`);
  console.log(`  Δ valueOfPriced vs currentValue: €${(totalCurrent - valueOfPriced).toFixed(2)}  (positions senza cost basis tracked)`);
}
main().catch(console.error).finally(()=>process.exit());
