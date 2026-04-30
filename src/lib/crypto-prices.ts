/**
 * Prezzi crypto pubblici via Binance (no auth).
 * Restituisce prezzo in EUR. Strategia: prova prima la coppia ASSET-EUR;
 * se non quotata, prova ASSET-USDT poi converti USDT→EUR via FX ECB.
 */

import { fxToEur } from "./yahoo-finance";

const BINANCE_BASE = "https://api.binance.com";

let usdtEurRate: number | null = null;
let usdtEurFetchedAt = 0;
const USDT_TTL = 5 * 60 * 1000;

async function getUsdtEur(): Promise<number> {
  if (usdtEurRate && Date.now() - usdtEurFetchedAt < USDT_TTL) return usdtEurRate;
  // Binance EURUSDT è la coppia più liquida; ne ricavo USDT/EUR
  try {
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=EURUSDT`, {
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { price: string };
      const eurusdt = parseFloat(j.price);
      if (eurusdt > 0) {
        usdtEurRate = 1 / eurusdt;
        usdtEurFetchedAt = Date.now();
        return usdtEurRate;
      }
    }
  } catch {
    /* fall through */
  }
  // Fallback: USD/EUR via ECB
  return await fxToEur("USD");
}

export async function priceInEur(asset: string): Promise<number | null> {
  const symbol = asset.toUpperCase();
  if (symbol === "EUR") return 1;
  if (symbol === "USDT" || symbol === "USDC" || symbol === "BUSD") {
    return await getUsdtEur();
  }

  // 1) Prova diretta ASSET-EUR
  try {
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}EUR`, {
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { price: string };
      const p = parseFloat(j.price);
      if (p > 0) return p;
    }
  } catch {
    /* fall through */
  }

  // 2) Fallback ASSET-USDT × USDT/EUR
  try {
    const res = await fetch(`${BINANCE_BASE}/api/v3/ticker/price?symbol=${symbol}USDT`, {
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { price: string };
      const usdtPrice = parseFloat(j.price);
      if (usdtPrice > 0) {
        const usdtEur = await getUsdtEur();
        return usdtPrice * usdtEur;
      }
    }
  } catch {
    /* fall through */
  }

  return null;
}
