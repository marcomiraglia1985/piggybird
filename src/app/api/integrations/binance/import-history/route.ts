import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  fetchAllTrades,
  fetchAllDeposits,
  fetchAllWithdrawals,
  fetchFiatOrders,
  type BinanceTrade,
} from "@/lib/binance";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minuti — l'import può durare a lungo

/**
 * Importa la trade history completa da Binance (e i trasferimenti fiat)
 * popolando `CryptoTrade`. Idempotent: usa id deterministici "bnc-trade-{id}"
 * così re-import non duplica.
 *
 * Non sostituisce la sync delle posizioni correnti — è un import storico
 * separato. Va lanciato una volta (o periodicamente) per costruire la storia
 * dei trade necessaria per il chart day-by-day mark-to-market.
 *
 * Limitazioni note:
 *  - Coppie iterate: top-30 asset comuni × 8 quote asset (EUR/USDT/USDC/BUSD/
 *    FDUSD/BTC/ETH/BNB) filtrate via /api/v3/exchangeInfo. Asset esotici già
 *    venduti potrebbero sfuggire.
 *  - Conversione EUR: per trade in stable usa USDT-EUR daily kline, per
 *    crypto-pair (BTC/ETH/BNB) usa il prezzo {base}-EUR giornaliero.
 *  - Permessi API: la chiave Binance deve avere "Enable Reading" attivo.
 *    Senza questo, /api/v3/myTrades torna 403.
 */

/** Klines daily cache: chiave "SYMBOL_INTERVAL" → timestamp[] + close[]. */
const klineCache = new Map<string, { ts: number[]; close: number[] }>();

async function loadDailyKlines(symbol: string): Promise<{ ts: number[]; close: number[] } | null> {
  const cached = klineCache.get(symbol);
  if (cached) return cached;
  try {
    // /api/v3/klines pubblico (no signed). Fetch tutta la storia.
    const data: Array<[number, string, string, string, string, ...unknown[]]> = [];
    let startTime = new Date("2017-07-01").getTime();
    const endTime = Date.now();
    while (startTime < endTime) {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=1000`;
      const res = await fetch(url);
      if (!res.ok) break;
      const batch = (await res.json()) as Array<[number, string, string, string, string, ...unknown[]]>;
      if (!Array.isArray(batch) || batch.length === 0) break;
      data.push(...batch);
      const last = batch[batch.length - 1];
      const lastTs = typeof last[0] === "number" ? last[0] : 0;
      if (batch.length < 1000) break;
      startTime = lastTs + 86400_000;
    }
    if (data.length === 0) return null;
    const ts = data.map((k) => k[0]);
    const close = data.map((k) => parseFloat(k[4]));
    const result = { ts, close };
    klineCache.set(symbol, result);
    return result;
  } catch {
    return null;
  }
}

/** Prezzo close di un asset al giorno del timestamp dato, in EUR.
 *  Strategia di fallback: SYMBOL+EUR diretto, poi via USDT, poi null. */
async function priceEurAt(asset: string, tsMs: number): Promise<number | null> {
  if (asset === "EUR") return 1;
  // Stablecoins → quasi 1 USD; converti via USDT/EUR daily
  const stables = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD"]);
  if (stables.has(asset)) {
    const usdtEur = await loadDailyKlines("EURUSDT");
    if (!usdtEur) return null;
    const idx = nearestIdx(usdtEur.ts, tsMs);
    const eurUsdt = usdtEur.close[idx];
    return eurUsdt > 0 ? 1 / eurUsdt : null;
  }
  // Direct ASSET-EUR
  const direct = await loadDailyKlines(`${asset}EUR`);
  if (direct) {
    const idx = nearestIdx(direct.ts, tsMs);
    return direct.close[idx];
  }
  // Via USDT: ASSET-USDT × USDT-EUR
  const usdt = await loadDailyKlines(`${asset}USDT`);
  const usdtEurKline = await loadDailyKlines("EURUSDT");
  if (usdt && usdtEurKline) {
    const idx1 = nearestIdx(usdt.ts, tsMs);
    const idx2 = nearestIdx(usdtEurKline.ts, tsMs);
    const aUsdt = usdt.close[idx1];
    const eurUsdt = usdtEurKline.close[idx2];
    if (aUsdt > 0 && eurUsdt > 0) return aUsdt / eurUsdt;
  }
  return null;
}

function nearestIdx(ts: number[], target: number): number {
  if (ts.length === 0) return 0;
  if (target <= ts[0]) return 0;
  if (target >= ts[ts.length - 1]) return ts.length - 1;
  // binary search
  let lo = 0,
    hi = ts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Estrae base/quote da symbol Binance. Lista quotes nota in ordine di
 *  preferenza (più lunghe prima per evitare match ambigui). */
function parsePair(symbol: string): { base: string; quote: string } | null {
  const quotes = ["FDUSD", "USDT", "USDC", "BUSD", "EUR", "BTC", "ETH", "BNB", "TRY", "DAI"];
  for (const q of quotes) {
    if (symbol.endsWith(q)) {
      const base = symbol.slice(0, -q.length);
      if (base.length > 0) return { base, quote: q };
    }
  }
  return null;
}

export async function POST() {
  try {
    // 1. Asset attualmente in wallet (per costruire la lista coppie)
    const positions = await prisma.cryptoPosition.findMany({
      where: { platform: "Binance" },
      select: { asset: true },
    });
    const currentAssets = [...new Set(positions.map((p) => p.asset))];

    // 2. Fetch parallel
    const [trades, deposits, withdrawals, fiatDeposits, fiatWithdrawals] =
      await Promise.all([
        fetchAllTrades(currentAssets),
        fetchAllDeposits(),
        fetchAllWithdrawals(),
        fetchFiatOrders("0").catch(() => []),
        fetchFiatOrders("1").catch(() => []),
      ]);

    // 3. Salva trade in CryptoTrade (idempotent via id deterministico)
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const t of trades as BinanceTrade[]) {
      const pair = parsePair(t.symbol);
      if (!pair) {
        failed++;
        continue;
      }
      const id = `bnc-trade-${t.id}`;
      const existing = await prisma.cryptoTrade.findUnique({ where: { id } });
      if (existing) {
        skipped++;
        continue;
      }
      const qty = parseFloat(t.qty);
      const priceQuote = parseFloat(t.price);
      const totalQuote = parseFloat(t.quoteQty);
      const direction = t.isBuyer ? "buy" : "sell";

      // Prezzo per unit in EUR al giorno del trade
      const quoteEurRate = await priceEurAt(pair.quote, t.time);
      if (quoteEurRate == null) {
        failed++;
        continue;
      }
      const pricePerUnitEur = priceQuote * quoteEurRate;
      const totalEur = totalQuote * quoteEurRate;

      try {
        await prisma.cryptoTrade.create({
          data: {
            id,
            platform: "Binance",
            asset: pair.base,
            direction,
            quantity: qty,
            pricePerUnit: priceQuote,
            pricePerUnitEur,
            currency: pair.quote,
            totalEur,
            date: new Date(t.time),
            source: "binance-api",
            notes: `${pair.base}/${pair.quote}${t.commission && parseFloat(t.commission) > 0 ? ` · fee ${t.commission} ${t.commissionAsset}` : ""}`,
          },
        });
        inserted++;
      } catch {
        failed++;
      }
    }

    // 4. Salva deposits/withdrawals come CryptoTrade "virtuali" con
    //    totalEur=0 → non contaminano cost basis ma servono come ANCORE
    //    temporali per la ricostruzione delle holdings nel grafico storico.
    //    Senza questi, asset arrivati via deposit (es. BTC trasferito da
    //    altro exchange) non hanno una data di "entrata" e il replay anchora
    //    le quantità a una data sbagliata.
    let depositsInserted = 0;
    let depositsSkipped = 0;
    for (const d of deposits) {
      const id = `bnc-dep-${d.id}`;
      const existing = await prisma.cryptoTrade.findUnique({ where: { id } });
      if (existing) {
        depositsSkipped++;
        continue;
      }
      const qty = parseFloat(d.amount);
      if (!isFinite(qty) || qty <= 0) continue;
      try {
        await prisma.cryptoTrade.create({
          data: {
            id,
            platform: "Binance",
            asset: d.coin,
            direction: "buy", // entrata di quantità
            quantity: qty,
            pricePerUnit: 0,
            pricePerUnitEur: 0,
            currency: d.coin,
            totalEur: 0, // NON cost basis (è un trasferimento, non un acquisto)
            date: new Date(d.insertTime),
            source: "binance-deposit",
            notes: `Deposit ${d.network ?? "?"} · txId ${d.txId?.slice(0, 16) ?? "-"}`,
          },
        });
        depositsInserted++;
      } catch {
        depositsSkipped++;
      }
    }

    let withdrawalsInserted = 0;
    let withdrawalsSkipped = 0;
    for (const w of withdrawals) {
      const id = `bnc-wd-${w.id}`;
      const existing = await prisma.cryptoTrade.findUnique({ where: { id } });
      if (existing) {
        withdrawalsSkipped++;
        continue;
      }
      const qty = parseFloat(w.amount);
      if (!isFinite(qty) || qty <= 0) continue;
      try {
        await prisma.cryptoTrade.create({
          data: {
            id,
            platform: "Binance",
            asset: w.coin,
            direction: "sell", // uscita di quantità
            quantity: qty,
            pricePerUnit: 0,
            pricePerUnitEur: 0,
            currency: w.coin,
            totalEur: 0,
            date: new Date(w.applyTime ? Date.parse(w.applyTime) : Date.now()),
            source: "binance-withdraw",
            notes: `Withdraw ${w.network ?? "?"} · txId ${w.txId?.slice(0, 16) ?? "-"}`,
          },
        });
        withdrawalsInserted++;
      } catch {
        withdrawalsSkipped++;
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        tradesFetched: trades.length,
        tradesInserted: inserted,
        tradesSkippedDup: skipped,
        tradesFailed: failed,
        cryptoDeposits: deposits.length,
        cryptoDepositsInserted: depositsInserted,
        cryptoDepositsSkipped: depositsSkipped,
        cryptoWithdrawals: withdrawals.length,
        cryptoWithdrawalsInserted: withdrawalsInserted,
        cryptoWithdrawalsSkipped: withdrawalsSkipped,
        fiatDeposits: fiatDeposits.length,
        fiatWithdrawals: fiatWithdrawals.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
