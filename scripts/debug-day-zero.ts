import { prisma } from "../src/lib/prisma";

async function main() {
  // Replay senza fetch prezzi: solo holdings al day 0
  const stockPositions = await prisma.stockPosition.findMany();
  const stockTrades = await prisma.stockTrade.findMany({ where: { type: { in: ["BUY","SELL"] } } });
  const cryptoPositions = await prisma.cryptoPosition.findMany();
  const cryptoTrades = await prisma.cryptoTrade.findMany({ orderBy: { date: "asc" } });
  
  // Current crypto qty
  const currentCryptoQty = new Map<string, number>();
  for (const p of cryptoPositions) currentCryptoQty.set(p.asset, (currentCryptoQty.get(p.asset)??0) + p.amount);
  
  console.log("=== CURRENT CRYPTO ===");
  for (const [a,q] of [...currentCryptoQty.entries()].sort((a,b) => b[1] - a[1])) {
    console.log(`  ${a.padEnd(6)} qty=${q.toFixed(8)}`);
  }
  
  // Replay
  const cryptoReplayFinal = new Map<string, number>();
  for (const a of currentCryptoQty.keys()) cryptoReplayFinal.set(a, 0);
  for (const t of cryptoTrades) {
    const cur = cryptoReplayFinal.get(t.asset) ?? 0;
    cryptoReplayFinal.set(t.asset, cur + (t.direction === "buy" ? t.quantity : -t.quantity));
  }
  console.log("\n=== REPLAY FINAL ===");
  for (const [a,q] of cryptoReplayFinal.entries()) console.log(`  ${a.padEnd(6)} replay=${q.toFixed(8)}  current=${(currentCryptoQty.get(a)??0).toFixed(8)}  adjust=${((currentCryptoQty.get(a)??0)-q).toFixed(8)}`);
  
  // Stocks
  const currentShares = new Map<string, number>();
  for (const p of stockPositions) currentShares.set(p.ticker, (currentShares.get(p.ticker)??0) + p.shares);
  for (const t of stockTrades) if (t.ticker && !currentShares.has(t.ticker)) currentShares.set(t.ticker, 0);
  
  const stocksReplayFinal = new Map<string, number>();
  for (const t of currentShares.keys()) stocksReplayFinal.set(t, 0);
  for (const t of stockTrades) {
    if (!t.ticker || t.quantity == null) continue;
    const cur = stocksReplayFinal.get(t.ticker) ?? 0;
    stocksReplayFinal.set(t.ticker, cur + (t.type === "BUY" ? t.quantity : -t.quantity));
  }
  console.log("\n=== STOCKS replay vs current (top 10 differences) ===");
  const diffs: [string, number, number, number][] = [];
  for (const [tk, target] of currentShares.entries()) {
    const replay = stocksReplayFinal.get(tk) ?? 0;
    const adjust = target - replay;
    if (Math.abs(adjust) > 0.001) diffs.push([tk, target, replay, adjust]);
  }
  diffs.sort((a,b) => Math.abs(b[3]) - Math.abs(a[3]));
  for (const [tk, target, replay, adjust] of diffs.slice(0,10)) {
    console.log(`  ${tk.padEnd(8)} target=${target.toFixed(4).padStart(10)}  replay=${replay.toFixed(4).padStart(10)}  adjust=${adjust.toFixed(4)}`);
  }
}
main().catch(console.error).finally(()=>process.exit());
