import "dotenv/config";
import fs from "node:fs";
import Papa from "papaparse";
import { prisma } from "../src/lib/prisma";
import { fetchQuoteWithEur } from "../src/lib/yahoo-finance";
import { yahooFor as sharedYahooFor } from "../src/lib/yahoo-ticker-map";

/**
 * Import unificato per Trading Revolut: stocks + metalli.
 *
 * Sorgenti:
 *   - "trade history" stocks (file 4): Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
 *   - "account statement" metalli (file 2): Tipo,Prodotto,Data di inizio,...,Importo,Costo,Valuta,State,Saldo
 *   - "Realized PnL" stocks (file 3): Date acquired,Date sold,Symbol,Security name,ISIN,Country,Quantity,Cost basis,Gross proceeds,Gross PnL,Currency
 *   - "Realized PnL" metalli (file 1): Date acquired,Date sold,Symbol,Quantity,Cost basis,Amount,Realised PnL,Currency
 */

const FILES = {
  stocksTrades: "/Users/marcomiraglia/Progetti/personal-finance/old/7E678337-41F6-4B4A-8AF7-2F27C79EE51D.csv",
  stocksPnL: "/Users/marcomiraglia/Progetti/personal-finance/old/77EF04A3-D975-47AE-999A-5F60C8D7A883.csv",
  metalsStatement: "/Users/marcomiraglia/Progetti/personal-finance/old/account-statement_2024-08-25_2026-04-25_it-it_2f617f.csv",
  metalsPnL: "/Users/marcomiraglia/Progetti/personal-finance/old/B95414B3-711F-4145-8D57-4D9027951D63.csv",
};

const METAL_NAMES: Record<string, string> = {
  XAU: "Gold (XAU)",
  XAG: "Silver (XAG)",
  XPT: "Platinum (XPT)",
  XPD: "Palladium (XPD)",
};

function parseAmount(v: string | undefined | null): number {
  if (!v) return 0;
  const m = String(v).match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : 0;
}

function parseUSDAmount(v: string | undefined | null): number {
  // "USD 500" or "USD 1102.80"
  if (!v) return 0;
  const m = String(v).match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : 0;
}

// ============================================================================
// STOCKS — ricostruisco posizioni dalla trade history
// ============================================================================

type StockTrade = {
  date: Date;
  ticker: string;
  type: string;
  quantity: number;
  pricePerShare: number; // in USD typically
  totalAmount: number;
  currency: string;
  fxRate: number;
};

function parseStocksTrades(): StockTrade[] {
  const text = fs.readFileSync(FILES.stocksTrades, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const trades: StockTrade[] = [];
  for (const r of parsed.data) {
    const ticker = (r["Ticker"] ?? "").trim();
    if (!ticker) continue; // CASH TOP-UP rows hanno ticker vuoto
    const type = (r["Type"] ?? "").trim();
    const date = new Date(r["Date"] ?? "");
    const quantity = parseAmount(r["Quantity"]);
    const pricePerShare = parseUSDAmount(r["Price per share"]);
    const totalAmount = parseUSDAmount(r["Total Amount"]);
    const currency = (r["Currency"] ?? "USD").trim();
    const fxRate = parseFloat(r["FX Rate"] ?? "1") || 1;
    if (!isFinite(date.getTime())) continue;
    trades.push({ date, ticker, type, quantity, pricePerShare, totalAmount, currency, fxRate });
  }
  return trades;
}

/**
 * Posizione con costo medio in valuta NATIVA del trade (USD/GBP/EUR).
 * Cost basis calcolato in FIFO (come Revolut): le SELL consumano i lotti
 * BUY più vecchi per primi. In pagina si converte a EUR via fxToEur corrente.
 */
type Lot = { qty: number; price: number };
type Position = {
  ticker: string;
  shares: number;
  avgCostNative: number;
  totalCostNative: number;
  currency: string;
  lots: Lot[];
};

function buildStockPositions(trades: StockTrade[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  trades.sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const t of trades) {
    const p = positions.get(t.ticker) ?? {
      ticker: t.ticker,
      shares: 0,
      avgCostNative: 0,
      totalCostNative: 0,
      currency: t.currency,
      lots: [],
    };

    if (t.type.startsWith("BUY")) {
      p.lots.push({ qty: t.quantity, price: t.pricePerShare });
    } else if (t.type.startsWith("SELL")) {
      let toRemove = t.quantity;
      while (toRemove > 0.0000001 && p.lots.length > 0) {
        const lot = p.lots[0];
        if (lot.qty <= toRemove + 0.0000001) {
          toRemove -= lot.qty;
          p.lots.shift();
        } else {
          lot.qty -= toRemove;
          toRemove = 0;
        }
      }
    } else if (t.type === "STOCK SPLIT") {
      const oldShares = p.lots.reduce((s, l) => s + l.qty, 0);
      if (oldShares > 0) {
        const ratio = (oldShares + t.quantity) / oldShares;
        for (const lot of p.lots) {
          lot.qty *= ratio;
          lot.price /= ratio;
        }
      }
    }

    p.shares = p.lots.reduce((s, l) => s + l.qty, 0);
    p.totalCostNative = p.lots.reduce((s, l) => s + l.qty * l.price, 0);
    p.avgCostNative = p.shares > 0 ? p.totalCostNative / p.shares : 0;
    positions.set(t.ticker, p);
  }
  for (const [k, v] of positions) {
    if (v.shares <= 0.0000001) positions.delete(k);
  }
  return positions;
}

// ============================================================================
// METALLI — saldo corrente da statement
// ============================================================================

function parseMetalsStatement(): Map<string, number> {
  const text = fs.readFileSync(FILES.metalsStatement, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  // Per ogni currency, prendi l'ultimo "Saldo" nella sequenza temporale
  const lastSaldoByCurrency = new Map<string, { date: Date; saldo: number }>();
  for (const r of parsed.data) {
    if (r["State"] !== "COMPLETATO") continue;
    const date = new Date(r["Data di inizio"] ?? "");
    if (!isFinite(date.getTime())) continue;
    const currency = (r["Valuta"] ?? "").trim();
    const saldo = parseFloat(r["Saldo"] ?? "0");
    if (!currency || !isFinite(saldo)) continue;
    const prev = lastSaldoByCurrency.get(currency);
    if (!prev || date > prev.date) {
      lastSaldoByCurrency.set(currency, { date, saldo });
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of lastSaldoByCurrency) {
    if (v.saldo > 0.0000001) out.set(k, v.saldo);
  }
  return out;
}

// ============================================================================
// PnL realizzati
// ============================================================================

type PnLRow = {
  ticker: string;
  name?: string;
  isin?: string;
  dateAcquired: Date;
  dateSold: Date;
  quantity: number;
  costBasis: number;
  proceeds: number;
  pnl: number;
  currency: string;
  assetType: string;
};

function parseStocksPnL(): PnLRow[] {
  const text = fs.readFileSync(FILES.stocksPnL, "utf-8");
  // Skip first line "Income from Sells"
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => l.startsWith("Date acquired"));
  if (startIdx < 0) return [];
  const csvText = lines.slice(startIdx).join("\n");
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const out: PnLRow[] = [];
  for (const r of parsed.data) {
    const symbol = (r["Symbol"] ?? "").trim();
    if (!symbol) continue;
    const dateAcquired = new Date(r["Date acquired"] ?? "");
    const dateSold = new Date(r["Date sold"] ?? "");
    if (!isFinite(dateAcquired.getTime()) || !isFinite(dateSold.getTime())) continue;
    out.push({
      ticker: symbol,
      name: r["Security name"]?.trim(),
      isin: r["ISIN"]?.trim(),
      dateAcquired,
      dateSold,
      quantity: parseAmount(r["Quantity"]),
      costBasis: parseAmount(r["Cost basis"]),
      proceeds: parseAmount(r["Gross proceeds"]),
      pnl: parseAmount(r["Gross PnL"]),
      currency: r["Currency"] ?? "USD",
      assetType: "stock",
    });
  }
  return out;
}

function parseMetalsPnL(): PnLRow[] {
  const text = fs.readFileSync(FILES.metalsPnL, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const out: PnLRow[] = [];
  for (const r of parsed.data) {
    const symbol = (r["Symbol"] ?? "").trim();
    if (!symbol) continue;
    const dateAcquired = new Date(r["Date acquired"] ?? "");
    const dateSold = new Date(r["Date sold"] ?? "");
    if (!isFinite(dateAcquired.getTime()) || !isFinite(dateSold.getTime())) continue;
    out.push({
      ticker: symbol,
      name: METAL_NAMES[symbol] ?? symbol,
      dateAcquired,
      dateSold,
      quantity: parseAmount(r["Quantity"]),
      costBasis: parseAmount(r["Cost basis"]),
      proceeds: parseAmount(r["Amount"]),
      pnl: parseAmount(r["Realised PnL"]),
      currency: r["Currency"] ?? "USD",
      assetType: "metal",
    });
  }
  return out;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("📥 Parsing CSV files…");

  const stockTrades = parseStocksTrades();
  const stockPositions = buildStockPositions(stockTrades);
  console.log(`  stocks trades: ${stockTrades.length} rows → ${stockPositions.size} posizioni aperte`);

  const metalsBalances = parseMetalsStatement();
  console.log(`  metalli saldi: ${metalsBalances.size} valute (${[...metalsBalances.keys()].join(", ")})`);

  const stocksPnL = parseStocksPnL();
  const metalsPnL = parseMetalsPnL();
  console.log(`  PnL realizzati: ${stocksPnL.length} stocks + ${metalsPnL.length} metalli`);

  // Wipe esistenti
  console.log("\n🧹 Pulizia DB…");
  await prisma.stockPosition.deleteMany({ where: { platform: "Revolut" } });
  await prisma.realizedPnL.deleteMany({ where: { platform: "Revolut" } });

  const yahooFor = sharedYahooFor;

  // Insert stocks
  console.log("\n💾 Importing stock positions…");
  let inserted = 0;
  for (const [ticker, pos] of stockPositions) {
    const ySymbol = yahooFor(ticker);
    const quote = await fetchQuoteWithEur(ySymbol);
    if (!quote || !quote.price) {
      console.log(`  ⚠️  ${ticker} (${ySymbol}): quote non disponibile, skip`);
      continue;
    }
    // Trova nome dal PnL se presente, altrimenti dal quote
    const pnlMatch = stocksPnL.find((r) => r.ticker === ticker);
    const name = pnlMatch?.name ?? quote.longName ?? quote.shortName ?? ticker;
    const isin = pnlMatch?.isin ?? null;

    // assetType: ETF se ticker corrisponde a UCITS noti (ISIN IE/LU) o ha .DE/.L
    const isEtf =
      isin?.startsWith("IE") ||
      isin?.startsWith("LU") ||
      /\.(DE|L|MI|AS)$/.test(ticker) ||
      ["VUSA", "ESP0", "IS3Q", "2B76"].includes(ticker);

    await prisma.stockPosition.create({
      data: {
        ticker,
        name,
        shares: pos.shares,
        avgCost: pos.avgCostNative, // valuta nativa: la pagina la converte a fx corrente
        currentPrice: quote.price,
        currency: quote.currency,
        fxToEur: quote.fxToEur,
        platform: "Revolut",
        assetType: isEtf ? "etf" : "stock",
        isin,
        exchange: quote.exchangeName ?? null,
      },
    });
    inserted++;
    const eurPrice = quote.price * quote.fxToEur;
    const eurAvg = pos.avgCostNative * quote.fxToEur;
    const gainPct = ((eurPrice - eurAvg) / eurAvg) * 100;
    console.log(
      `  ✓ ${ticker.padEnd(8)} ${pos.shares.toFixed(4).padStart(12)} @ avg ${pos.avgCostNative.toFixed(2)} ${pos.currency} (€${eurAvg.toFixed(2)}) | live €${eurPrice.toFixed(2)} (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)`,
    );
  }
  console.log(`  ${inserted} stocks importati`);

  // Insert metals
  console.log("\n💾 Importing metals positions…");
  for (const [currency, qty] of metalsBalances) {
    const ySymbol = yahooFor(currency);
    const quote = await fetchQuoteWithEur(ySymbol);
    if (!quote || !quote.price) {
      console.log(`  ⚠️  ${currency} (${ySymbol}): quote non disponibile`);
      continue;
    }
    // Avg cost: cerca dal PnL gli acquisti per questo metal e calcola weighted avg
    // sui buys: proxy approssimativo. Per ora null.
    await prisma.stockPosition.create({
      data: {
        ticker: currency,
        name: METAL_NAMES[currency] ?? currency,
        shares: qty,
        avgCost: null,
        currentPrice: quote.price,
        currency: quote.currency,
        fxToEur: quote.fxToEur,
        platform: "Revolut",
        assetType: "metal",
        isin: null,
        exchange: quote.exchangeName ?? null,
      },
    });
    console.log(`  ✓ ${currency.padEnd(8)} ${qty.toFixed(6).padStart(12)} oz | live ${quote.price.toFixed(2)} ${quote.currency}`);
  }

  // Insert RealizedPnL
  console.log("\n💾 Importing realized PnL…");
  const allPnL = [...stocksPnL, ...metalsPnL];
  for (const r of allPnL) {
    await prisma.realizedPnL.create({
      data: {
        ticker: r.ticker,
        name: r.name ?? null,
        isin: r.isin ?? null,
        dateAcquired: r.dateAcquired,
        dateSold: r.dateSold,
        quantity: r.quantity,
        costBasis: r.costBasis,
        proceeds: r.proceeds,
        pnl: r.pnl,
        currency: r.currency,
        platform: "Revolut",
        assetType: r.assetType,
      },
    });
  }
  console.log(`  ${allPnL.length} record realized PnL`);

  // Update Investment table totals
  console.log("\n🔄 Aggiorno Investment totals…");
  const allPositions = await prisma.stockPosition.findMany({ where: { platform: "Revolut" } });
  const stocksAndEtf = allPositions
    .filter((p) => p.assetType !== "metal")
    .reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);
  const metals = allPositions
    .filter((p) => p.assetType === "metal")
    .reduce((s, p) => s + p.shares * p.currentPrice * p.fxToEur, 0);

  await prisma.investment.upsert({
    where: { name: "Stocks Revolut" },
    update: { currentValue: stocksAndEtf, lastUpdated: new Date() },
    create: { name: "Stocks Revolut", type: "stocks", platform: "Revolut", currentValue: stocksAndEtf, currency: "EUR" },
  });
  await prisma.investment.upsert({
    where: { name: "Metals Revolut" },
    update: { currentValue: metals, lastUpdated: new Date() },
    create: { name: "Metals Revolut", type: "metals", platform: "Revolut", currentValue: metals, currency: "EUR" },
  });
  console.log(`  Stocks/ETF: ${stocksAndEtf.toFixed(2)} €`);
  console.log(`  Metals:     ${metals.toFixed(2)} €`);

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
