import { prisma } from "../src/lib/prisma";

async function main() {
  // Check stock positions and trades
  const sp = await prisma.stockPosition.findMany();
  console.log(`StockPosition: ${sp.length}`);
  for (const p of sp.slice(0,5)) console.log(`  ${p.ticker}: ${p.shares} @ fx=${p.fxToEur}`);
  
  const trades = await prisma.stockTrade.findMany({ where: { type: { in: ["BUY","SELL"] } }, orderBy: {date:"asc"} });
  console.log(`\nStockTrade BUY/SELL: ${trades.length}`);
  console.log(`  First: ${trades[0]?.date.toISOString().slice(0,10)} ${trades[0]?.type} ${trades[0]?.shares} ${trades[0]?.ticker}`);
  console.log(`  Last:  ${trades[trades.length-1]?.date.toISOString().slice(0,10)} ${trades[trades.length-1]?.type} ${trades[trades.length-1]?.shares} ${trades[trades.length-1]?.ticker}`);
  
  // Test Yahoo fetch
  console.log("\n=== Yahoo test ===");
  const yahoo = `VUSA.AS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?period1=${Math.floor(new Date("2017-01-01").getTime()/1000)}&period2=${Math.floor(Date.now()/1000)}&interval=1mo`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    console.log(`  ${yahoo}: ${res.status}`);
    if (res.ok) {
      const j = await res.json() as any;
      const r = j.chart?.result?.[0];
      console.log(`  monthly data points: ${r?.timestamp?.length ?? 0}`);
    }
  } catch (e) {
    console.log(`  failed: ${e}`);
  }
  
  // Test for AAPL
  for (const t of ["AAPL","NVDA","MSFT"]) {
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?period1=${Math.floor(new Date("2017-01-01").getTime()/1000)}&period2=${Math.floor(Date.now()/1000)}&interval=1mo`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const j = await res.json() as any;
      const r = j.chart?.result?.[0];
      console.log(`  ${t}: ${r?.timestamp?.length ?? 0} pts`);
    }
  }
}
main().catch(console.error).finally(()=>process.exit());
