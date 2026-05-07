import { prisma } from "./prisma";
import { getBrokerPlatformName } from "./broker-platform-resolver";
import { priceEurAt } from "./crypto-prices-historical";

const AUTO_BACKFILL_NOTE = "auto-backfill da CryptoTrade history";

/**
 * Backfilla i `CryptoTrade` Binance dove `totalEur` è 0 (coppie crypto-to-crypto
 * importate via API senza rate EUR storico) e ricalcola `CryptoCostBasis` per
 * asset come `Σ BUY.totalEur − Σ SELL.totalEur` (clamp a 0).
 *
 * Non tocca `Investment.costEur`: quello rappresenta il baseline pre-API
 * dell'utente. `CryptoCostBasis` è la quota derivata dai trade Binance e si
 * SOMMA al baseline nel calcolo del costo totale (vedi crypto-platform-view).
 *
 * **Heuristic per derivabilità del costo**:
 *   Il costo per-asset è scrivibile solo se la quantità attuale è interamente
 *   spiegata dai trade Binance (`current_qty <= net_buy_qty + tolerance`).
 *   Se l'utente ha trasferito asset da wallet esterni (deposit) o aveva una
 *   posizione pre-API, la quota acquistata su Binance è solo una FRAZIONE del
 *   costo reale → non derivabile, lasciamo "non impostato" (l'utente può
 *   editare manualmente o usare il baseline aggregato pre-API).
 *
 *   Esempio: BTC su Binance solo 127€ di BUY ma in wallet 1 BTC (35k€) →
 *   il restante è arrivato da deposit → cost basis NOT derivable, skip.
 *
 * Le righe esistenti con `notes = AUTO_BACKFILL_NOTE` che non qualificano più
 * vengono cancellate (per non lasciare dati stale dopo update). Le righe
 * editate manualmente dall'utente (notes diverso) sono preservate.
 */
export type BackfillResult = {
  tradesUpdated: number;
  tradesSkipped: number;
  skipReasons: Record<string, number>;
  costBasisInserted: number;
  costBasisUpdated: number;
  costBasisDeleted: number;
  /** Asset per cui il costo è skippato perché current_qty supera net_buy_qty
   *  (cost basis non derivabile dalle sole API binance). */
  skippedAssets: string[];
  assetsTotal: number;
  aggregateCostEur: number;
};

export async function backfillBinanceCostBasis(): Promise<BackfillResult> {
  const platform = await getBrokerPlatformName("binance");

  const broken = await prisma.cryptoTrade.findMany({
    where: {
      platform,
      source: "binance-api",
      OR: [{ totalEur: 0 }, { pricePerUnitEur: 0 }],
    },
    orderBy: { date: "asc" },
  });

  let tradesUpdated = 0;
  let tradesSkipped = 0;
  const skipReasons: Record<string, number> = {};

  for (const t of broken) {
    const quoteRate = await priceEurAt(t.currency, t.date.getTime());
    if (quoteRate == null || quoteRate <= 0) {
      tradesSkipped++;
      const reason = `no-rate-${t.currency}`;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      continue;
    }
    const pricePerUnitEur = t.pricePerUnit * quoteRate;
    const totalEur = t.quantity * pricePerUnitEur;
    await prisma.cryptoTrade.update({
      where: { id: t.id },
      data: { pricePerUnitEur, totalEur },
    });
    tradesUpdated++;
  }

  const allTrades = await prisma.cryptoTrade.findMany({
    where: { platform, source: "binance-api" },
    orderBy: { date: "asc" },
  });

  // Per asset: cumula sia il costo EUR (BUY - SELL) sia la quantità netta
  // (BUY - SELL) per la heuristic di derivabilità.
  type Cumul = { costEur: number; netQty: number };
  const cumByAsset = new Map<string, Cumul>();
  for (const t of allTrades) {
    if (t.totalEur <= 0) continue;
    const sign = t.direction === "buy" ? 1 : -1;
    const c = cumByAsset.get(t.asset) ?? { costEur: 0, netQty: 0 };
    c.costEur += sign * t.totalEur;
    c.netQty += sign * t.quantity;
    cumByAsset.set(t.asset, c);
  }

  // Quantità correnti per asset (sommate tra tutti i source: spot, earn, ecc.)
  const positions = await prisma.cryptoPosition.findMany({
    where: { platform },
    select: { asset: true, amount: true },
  });
  const currentQtyByAsset = new Map<string, number>();
  for (const p of positions) {
    currentQtyByAsset.set(p.asset, (currentQtyByAsset.get(p.asset) ?? 0) + p.amount);
  }

  // Tolleranza 1% per assorbire fee minuscole sottratte da Binance ma non
  // sempre presenti nel trade record (es. trading fee in BNB su altro asset).
  const QTY_TOLERANCE_PCT = 0.01;

  const derivableAssets = new Set<string>();
  const skippedAssets: string[] = [];
  for (const [asset, c] of cumByAsset) {
    const currentQty = currentQtyByAsset.get(asset) ?? 0;
    if (currentQty <= 0) continue; // posizione chiusa, non mostriamo costo
    const tolerance = c.netQty * QTY_TOLERANCE_PCT;
    if (currentQty <= c.netQty + tolerance) {
      derivableAssets.add(asset);
    } else {
      skippedAssets.push(asset);
    }
  }

  // Pulizia: cancella le righe auto-backfill di asset che NON sono più
  // derivabili (es. l'utente prima aveva tutto da Binance, poi ha trasferito
  // dentro asset esterni). Preserviamo le righe editate manualmente (notes
  // diverso da AUTO_BACKFILL_NOTE) — quelle sono fonte autoritativa utente.
  const existingAuto = await prisma.cryptoCostBasis.findMany({
    where: { platform, notes: AUTO_BACKFILL_NOTE },
    select: { id: true, asset: true },
  });
  const toDelete = existingAuto
    .filter((r) => !derivableAssets.has(r.asset))
    .map((r) => r.id);
  let costBasisDeleted = 0;
  if (toDelete.length > 0) {
    const del = await prisma.cryptoCostBasis.deleteMany({
      where: { id: { in: toDelete } },
    });
    costBasisDeleted = del.count;
  }

  let costBasisInserted = 0;
  let costBasisUpdated = 0;
  for (const asset of derivableAssets) {
    const costEur = Math.max(0, cumByAsset.get(asset)!.costEur);
    if (costEur <= 0) continue;
    const existing = await prisma.cryptoCostBasis.findUnique({
      where: { platform_asset: { platform, asset } },
    });
    if (existing) {
      // Aggiorna solo se la riga è auto (preserva manual override).
      if (existing.notes === AUTO_BACKFILL_NOTE) {
        await prisma.cryptoCostBasis.update({
          where: { id: existing.id },
          data: { costEur, notes: AUTO_BACKFILL_NOTE },
        });
        costBasisUpdated++;
      }
    } else {
      await prisma.cryptoCostBasis.create({
        data: { platform, asset, costEur, notes: AUTO_BACKFILL_NOTE },
      });
      costBasisInserted++;
    }
  }

  const aggregateCostEur = [...derivableAssets].reduce(
    (s, asset) => s + Math.max(0, cumByAsset.get(asset)!.costEur),
    0,
  );

  return {
    tradesUpdated,
    tradesSkipped,
    skipReasons,
    costBasisInserted,
    costBasisUpdated,
    costBasisDeleted,
    skippedAssets,
    assetsTotal: derivableAssets.size,
    aggregateCostEur,
  };
}
