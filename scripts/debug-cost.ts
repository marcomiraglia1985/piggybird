import { prisma } from "../src/lib/prisma";

async function main() {
  const stockTrades = await prisma.stockTrade.findMany({
    where: { type: { in: ["BUY","SELL"] }, ticker: { not: null } },
    orderBy: { date: "asc" },
  });
  
  const state = new Map<string, { shares: number; avgCostEur: number }>();
  for (const t of stockTrades) {
    if (!t.ticker || t.quantity == null || t.quantity <= 0) continue;
    const cur = state.get(t.ticker) ?? { shares: 0, avgCostEur: 0 };
    const priceEur = (t.pricePerUnit ?? 0) * (t.fxRate ?? 1);
    if (t.type === "BUY") {
      const ns = cur.shares + t.quantity;
      const na = ns > 0 ? (cur.shares * cur.avgCostEur + t.quantity * priceEur) / ns : 0;
      state.set(t.ticker, { shares: ns, avgCostEur: na });
    } else {
      state.set(t.ticker, { shares: Math.max(0, cur.shares - t.quantity), avgCostEur: cur.avgCostEur });
    }
  }
  
  let total = 0;
  console.log("=== Stocks position-level cost basis (replay from BUY/SELL) ===");
  const sorted = [...state.entries()].sort((a,b) => b[1].shares * b[1].avgCostEur - a[1].shares * a[1].avgCostEur);
  for (const [tk, s] of sorted.slice(0,15)) {
    if (s.shares <= 0) continue;
    const cost = s.shares * s.avgCostEur;
    total += cost;
    console.log(`  ${tk.padEnd(8)} shares=${s.shares.toFixed(4).padStart(10)}  avgCost=${s.avgCostEur.toFixed(2).padStart(8)}  cost=€${cost.toFixed(2).padStart(10)}`);
  }
  console.log(`  Total stocks cost (replay): €${total.toFixed(2)}`);
  
  // Compare with StockPosition.avgCost × shares × fxToEur
  const positions = await prisma.stockPosition.findMany();
  let altTotal = 0;
  for (const p of positions) {
    if (p.avgCost) altTotal += p.shares * p.avgCost * p.fxToEur;
  }
  console.log(`  Total stocks cost (StockPosition): €${altTotal.toFixed(2)}`);
}
main().catch(console.error).finally(()=>process.exit());
