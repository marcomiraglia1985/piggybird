import Papa from "papaparse";
import type { BrokerParser, ParseResult, StockEvent } from "./types";

/**
 * Parser per CSV export di Revolut Trading.
 * Header atteso:
 *   Date,Ticker,Type,Quantity,Price per share,Total Amount,Currency,FX Rate
 *
 * Type values (CSV originali → normalized):
 *   "BUY - MARKET"       → "BUY"
 *   "SELL - MARKET"      → "SELL"
 *   "CASH TOP-UP"        → "TOP-UP"
 *   "CASH WITHDRAWAL"    → "WITHDRAWAL"
 *   "DIVIDEND"           → "DIVIDEND"
 *   "DIVIDEND TAX (CORRECTION)" → "DIVIDEND_TAX"
 *   "STOCK SPLIT"        → "STOCK_SPLIT"
 *
 * "Total Amount" è formato `<CCY> <number>` con segno esplicito (negative per
 * WITHDRAWAL/SELL). FX Rate è `nativeCcy_per_EUR` quando currency != EUR.
 */
const REVOLUT_HEADER_KEYS = [
  "Date",
  "Ticker",
  "Type",
  "Quantity",
  "Price per share",
  "Total Amount",
  "Currency",
  "FX Rate",
];

function parseSignedAmount(raw: string): number {
  const m = raw.match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : 0;
}

function normalizeType(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (t.startsWith("BUY")) return "BUY";
  if (t.startsWith("SELL")) return "SELL";
  if (t === "CASH TOP-UP") return "TOP-UP";
  if (t === "CASH WITHDRAWAL") return "WITHDRAWAL";
  if (t === "DIVIDEND") return "DIVIDEND";
  if (t.startsWith("DIVIDEND TAX")) return "DIVIDEND_TAX";
  if (t === "STOCK SPLIT") return "STOCK_SPLIT";
  return null;
}

function detectRevolut(csv: string): boolean {
  const firstLine = csv.split(/\r?\n/)[0];
  if (!firstLine) return false;
  const headers = firstLine.split(",").map((h) => h.trim());
  // Tutte le chiavi del header Revolut devono essere presenti
  return REVOLUT_HEADER_KEYS.every((k) => headers.includes(k));
}

function parseRevolut(csv: string): ParseResult {
  if (!detectRevolut(csv)) {
    return { ok: false, error: "Header non corrisponde al formato Revolut" };
  }
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const events: StockEvent[] = [];
  for (const r of parsed.data) {
    const rawType = (r["Type"] ?? "").trim();
    const type = normalizeType(rawType);
    if (!type) continue;
    const dateStr = r["Date"] ?? "";
    const date = new Date(dateStr);
    if (!isFinite(date.getTime())) continue;

    const totalAmtRaw = parseSignedAmount(r["Total Amount"] ?? "0");
    const fx = parseFloat(r["FX Rate"] ?? "1") || 1;
    const currency = (r["Currency"] ?? "EUR").trim().toUpperCase();
    const amountEur = Math.abs(
      currency === "EUR" ? totalAmtRaw : totalAmtRaw / fx,
    );

    const ticker = (r["Ticker"] ?? "").trim() || null;
    const qtyRaw = (r["Quantity"] ?? "").trim();
    const quantity = qtyRaw ? parseSignedAmount(qtyRaw) : null;
    const priceRaw = (r["Price per share"] ?? "").trim();
    const pricePerUnit = priceRaw ? parseSignedAmount(priceRaw) : null;

    events.push({
      platform: "Revolut",
      type,
      date: date.toISOString(),
      ticker,
      quantity,
      pricePerUnit,
      amountEur,
      currency,
      fxRate: fx,
    });
  }
  return { ok: true, platform: "Revolut", events };
}

export const revolutParser: BrokerParser = {
  name: "Revolut Trading",
  platform: "Revolut",
  detect: detectRevolut,
  parse: parseRevolut,
};
