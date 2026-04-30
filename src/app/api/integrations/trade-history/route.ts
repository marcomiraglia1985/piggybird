import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { fxToEur } from "@/lib/yahoo-finance";

export const runtime = "nodejs";

const STOCKS_CSV = "/Users/marcomiraglia/Progetti/personal-finance/old/7E678337-41F6-4B4A-8AF7-2F27C79EE51D.csv";

type Trade = {
  date: string; // ISO
  type: "BUY" | "SELL";
  qty: number;
  pricePerUnit: number; // in EUR
  totalEur: number;
};

/**
 * GET /api/integrations/trade-history?symbol=ETH&kind=crypto
 *
 * Restituisce le trade BUY/SELL per un asset, da:
 *  - kind=stock: CSV trade history Revolut
 *  - kind=crypto: RealizedPnL (solo SELL noti)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const kind = (searchParams.get("kind") as "stock" | "crypto") ?? "stock";
  if (!symbol) return NextResponse.json({ error: "symbol mancante" }, { status: 400 });

  if (kind === "stock") return await stockTrades(symbol);
  return await cryptoTrades(symbol);
}

async function stockTrades(symbol: string) {
  if (!fs.existsSync(STOCKS_CSV)) {
    return NextResponse.json({ trades: [], note: "CSV stocks non trovato" });
  }
  const content = fs.readFileSync(STOCKS_CSV, "utf-8");
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  const trades: Trade[] = [];
  for (const r of parsed.data) {
    const t = (r["Ticker"] ?? "").trim();
    if (t.toUpperCase() !== symbol) continue;
    const type = (r["Type"] ?? "").trim();
    const dateStr = r["Date"] ?? "";
    const qty = parseFloat((r["Quantity"] ?? "0").match(/-?\d+\.?\d*/)?.[0] ?? "0");
    const totalAmt = parseFloat((r["Total Amount"] ?? "0").match(/-?\d+\.?\d*/)?.[0] ?? "0");
    const priceNative = parseFloat((r["Price per share"] ?? "0").match(/-?\d+\.?\d*/)?.[0] ?? "0");
    const fx = parseFloat(r["FX Rate"] ?? "1") || 1;
    const currency = (r["Currency"] ?? "EUR").trim();
    const date = new Date(dateStr);
    if (!isFinite(date.getTime()) || qty <= 0) continue;
    const totalEur = currency === "EUR" ? totalAmt : totalAmt / fx;
    const priceEur = currency === "EUR" ? priceNative : priceNative / fx;
    if (type.startsWith("BUY")) {
      trades.push({ date: date.toISOString(), type: "BUY", qty, pricePerUnit: priceEur, totalEur });
    } else if (type.startsWith("SELL")) {
      trades.push({ date: date.toISOString(), type: "SELL", qty, pricePerUnit: priceEur, totalEur });
    }
  }
  return NextResponse.json({ trades });
}

async function cryptoTrades(symbol: string) {
  const trades: Trade[] = [];

  // 1) CryptoTrade: trade manuali (form, CSV import) — fonte primaria
  const ct = await prisma.cryptoTrade.findMany({
    where: { asset: symbol },
    orderBy: { date: "asc" },
  });
  for (const t of ct) {
    trades.push({
      date: t.date.toISOString(),
      type: t.direction === "buy" ? "BUY" : "SELL",
      qty: t.quantity,
      pricePerUnit: t.pricePerUnitEur,
      totalEur: t.totalEur,
    });
  }

  // 2) RealizedPnL legacy (Binance pre-Trade-form)
  const pnl = await prisma.realizedPnL.findMany({
    where: { ticker: symbol, assetType: { in: ["crypto", "metal"] } },
    orderBy: { dateSold: "asc" },
  });
  const usdtEur = await fxToEur("USD");
  for (const r of pnl) {
    const isUsd = r.currency.toUpperCase() === "USD" || r.currency.toUpperCase() === "USDT";
    const fx = isUsd ? usdtEur : 1;
    const buyPriceEur = (r.costBasis / r.quantity) * fx;
    const sellPriceEur = (r.proceeds / r.quantity) * fx;
    trades.push({
      date: r.dateAcquired.toISOString(),
      type: "BUY",
      qty: r.quantity,
      pricePerUnit: buyPriceEur,
      totalEur: r.costBasis * fx,
    });
    trades.push({
      date: r.dateSold.toISOString(),
      type: "SELL",
      qty: r.quantity,
      pricePerUnit: sellPriceEur,
      totalEur: r.proceeds * fx,
    });
  }

  trades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return NextResponse.json({ trades });
}
