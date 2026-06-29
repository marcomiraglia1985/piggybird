/**
 * One-shot: rebuilda StockPosition + TradingCash da StockTrade per una platform
 * (default "Revolut Trading"), poi refresh prezzi + sync totale.
 *
 * Uso: npx tsx scripts/rebuild-positions.ts ["Revolut Trading"]
 */
import { rebuildStockPositions } from "../src/lib/stock-positions-rebuilder";
import { refreshAllStockPrices, syncStocksTotal } from "../src/lib/stocks-sync";

async function main() {
  const platform = process.argv[2] ?? "Revolut Trading";
  console.log(`Rebuilding positions for: ${platform}`);
  const summary = await rebuildStockPositions(platform);
  console.log("Rebuild:", summary);
  console.log("Refreshing prices…");
  await refreshAllStockPrices(platform);
  const total = await syncStocksTotal(platform);
  console.log(`Total ${platform}: €${total.toFixed(2)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
