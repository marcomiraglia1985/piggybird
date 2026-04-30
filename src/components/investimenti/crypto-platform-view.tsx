import { prisma } from "@/lib/prisma";
import { formatEUR } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CryptoSyncButton } from "@/components/investimenti/crypto-sync-button";
import { RevolutXSyncButton } from "@/components/investimenti/revolut-x-sync-button";
import { CryptoCostBasisEditor } from "@/components/investimenti/crypto-cost-basis-editor";
import { InvestmentSummaryEditor } from "@/components/investimenti/investment-summary-editor";

const SOURCE_LABELS: Record<string, string> = {
  spot: "Spot",
  funding: "Funding",
  "earn-flexible": "Earn Flexible",
  "earn-locked": "Earn Locked",
  "margin-cross": "Cross Margin",
  "margin-isolated": "Isolated Margin",
  "futures-usdm": "USDⓈ-M Futures",
  "futures-coinm": "COIN-M Futures",
  manual: "Manuale",
};

export async function CryptoPlatformView({
  platform,
  title,
  emoji,
  description,
  syncProvider,
}: {
  platform: string;
  title: string;
  emoji: string;
  description: string;
  syncProvider: "binance" | "revolut-x" | null;
}) {
  const positions = await prisma.cryptoPosition.findMany({
    where: { platform },
    orderBy: [{ eurValue: "desc" }],
  });

  const costBases = await prisma.cryptoCostBasis.findMany({
    where: { platform },
  });
  const costByAsset = new Map(costBases.map((c) => [c.asset, c.costEur]));

  // Investment aggregato (per platform totals quando non c'è breakdown per-asset)
  const investment = await prisma.investment.findFirst({
    where: { platform, type: "crypto" },
  });

  const total = positions.reduce((s, p) => s + p.eurValue, 0);

  // Aggregate by asset
  const byAsset = new Map<
    string,
    { amount: number; eurValue: number; sources: Set<string> }
  >();
  for (const p of positions) {
    const e = byAsset.get(p.asset) ?? { amount: 0, eurValue: 0, sources: new Set() };
    e.amount += p.amount;
    e.eurValue += p.eurValue;
    e.sources.add(p.source);
    byAsset.set(p.asset, e);
  }
  const assetRows = [...byAsset.entries()]
    .map(([asset, v]) => ({
      asset,
      ...v,
      sources: [...v.sources],
      costEur: costByAsset.get(asset) ?? null,
    }))
    .sort((a, b) => b.eurValue - a.eurValue);

  const perAssetCost = assetRows.reduce((s, r) => s + (r.costEur ?? 0), 0);
  const valueOfPricedAssets = assetRows
    .filter((r) => r.costEur != null)
    .reduce((s, r) => s + r.eurValue, 0);

  // Se non c'è alcun cost basis per-asset, ma Investment.costEur è valorizzato,
  // usalo come fallback (cost basis aggregato platform-level — utile per
  // portafogli storici dove non si ha il dettaglio per ogni trade).
  const usingAggregateCost = perAssetCost === 0 && investment?.costEur != null;
  const totalCost = usingAggregateCost ? investment!.costEur! : perAssetCost;
  const valueOfPriced = usingAggregateCost ? total : valueOfPricedAssets;
  const unrealizedGain = totalCost > 0 ? valueOfPriced - totalCost : 0;

  // By source
  const bySource = new Map<string, number>();
  for (const p of positions) {
    bySource.set(p.source, (bySource.get(p.source) ?? 0) + p.eurValue);
  }
  const sourceRows = [...bySource.entries()]
    .map(([source, eurValue]) => ({ source, eurValue }))
    .sort((a, b) => b.eurValue - a.eurValue);

  const lastSync =
    positions.length > 0
      ? positions.reduce(
          (max, p) => (p.lastUpdated > max ? p.lastUpdated : max),
          positions[0].lastUpdated,
        )
      : null;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/investimenti"
          className="inline-flex items-center gap-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors mb-2"
        >
          <ArrowLeft className="size-3" /> Investimenti
        </Link>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
              <span>{emoji}</span> {title}
            </h1>
            <p className="text-sm text-[var(--fg-muted)] mt-0.5">
              {positions.length} posizioni · {byAsset.size} asset · {sourceRows.length} wallet ·{" "}
              {description}
            </p>
          </div>
          {syncProvider === "binance" && (
            <CryptoSyncButton lastSync={lastSync?.toISOString() ?? null} />
          )}
          {syncProvider === "revolut-x" && (
            <RevolutXSyncButton lastSync={lastSync?.toISOString() ?? null} />
          )}
        </div>
      </header>

      {positions.length === 0 ? (
        <>
          {investment && (
            <InvestmentSummaryEditor
              investmentId={investment.id}
              currentValue={investment.currentValue}
              costEur={investment.costEur}
            />
          )}
          <div className="surface p-6 text-sm text-[var(--fg-muted)] space-y-3">
            <p>
              Nessun breakdown per asset disponibile. Quando vorrai dettagliare le posizioni,
              aggiungile dal form sotto. Una volta aggiunte, il riepilogo aggregato sarà
              sostituito dal totale calcolato dalle posizioni.
            </p>
            <CryptoCostBasisEditor platform={platform} assets={[]} allowAdd />
          </div>
        </>
      ) : (
        <>
          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-violet-500/10 via-[var(--surface)] to-indigo-500/10 p-8">
            <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-violet-500/20 blur-3xl" />
            <div className="relative space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                <div>
                  <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2">
                    Valore totale
                  </div>
                  <div className="text-5xl font-semibold tracking-tight text-headline-violet">
                    {formatEUR(total)}
                  </div>
                  {totalCost > 0 && (
                    <div className="mt-2 text-sm text-[var(--fg-muted)]">
                      Costo {formatEUR(totalCost, { compact: true })}
                      {valueOfPriced < total && (
                        <span className="text-[11px] text-[var(--fg-subtle)] ml-1.5">
                          (su {formatEUR(valueOfPriced, { compact: true })})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {totalCost > 0 && (
                  <div className="sm:text-right">
                    <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2">
                      Unrealized P/L
                    </div>
                    <div
                      className={`text-5xl font-semibold tracking-tight tabular-nums ${
                        unrealizedGain >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {unrealizedGain >= 0 ? "+" : ""}
                      {formatEUR(unrealizedGain, { compact: true })}
                    </div>
                    <div
                      className={`mt-2 text-sm tabular-nums ${
                        unrealizedGain >= 0 ? "text-emerald-400/80" : "text-rose-400/80"
                      }`}
                    >
                      {unrealizedGain >= 0 ? "+" : ""}
                      {((unrealizedGain / totalCost) * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
              {sourceRows.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {sourceRows.map((s) => (
                    <div
                      key={s.source}
                      className="rounded-full bg-[var(--surface)]/60 border border-[var(--border)] px-3 py-1.5 text-xs"
                    >
                      <span className="text-[var(--fg-muted)]">
                        {SOURCE_LABELS[s.source] ?? s.source}
                      </span>{" "}
                      <span className="font-medium tabular-nums">
                        {formatEUR(s.eurValue, { compact: s.eurValue > 999 })}
                      </span>
                      <span className="text-[var(--fg-subtle)] ml-1">
                        ({((s.eurValue / total) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cost basis aggregato (solo se non c'è breakdown per-asset) */}
          {perAssetCost === 0 && investment && (
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
                Costo aggregato (platform-level)
              </h2>
              <InvestmentSummaryEditor
                investmentId={investment.id}
                currentValue={investment.currentValue}
                costEur={investment.costEur}
              />
              <p className="mt-2 text-[11px] text-[var(--fg-subtle)] px-1">
                Imposta il costo totale storico cliccando ✏️. Il valore corrente si aggiorna
                automaticamente dalle posizioni (sync); il costo resta fisso e ricalcola il
                gain quando i prezzi si muovono.
              </p>
            </div>
          )}

          {/* Asset breakdown con cost basis */}
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
              Asset
            </h2>
            <CryptoCostBasisEditor
              platform={platform}
              assets={assetRows}
              allowAdd={false}
            />
          </div>
        </>
      )}
    </div>
  );
}
