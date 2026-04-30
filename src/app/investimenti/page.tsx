import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import { SyncAllButton } from "@/components/investimenti/sync-all-button";
import { StockTradesImportDialog } from "@/components/investimenti/stock-trades-import-dialog";
import { ensureDefaultInvestmentCategories } from "@/lib/seed-defaults";
import { getInvestmentsHistoryV2, hasInvestmentData } from "@/lib/investments-history";
import { getCredentialStatus } from "@/lib/credentials";
import { InvestmentsChart } from "@/components/charts/investments-chart";

export const dynamic = "force-dynamic";

const TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  stocks: { label: "Azioni", emoji: "📈", color: "from-blue-500/20 to-blue-500/5 border-blue-500/20" },
  metals: { label: "Materie prime", emoji: "🪙", color: "from-amber-500/20 to-amber-500/5 border-amber-500/20" },
  crypto: { label: "Crypto", emoji: "🚀", color: "from-violet-500/20 to-violet-500/5 border-violet-500/20" },
  etf: { label: "ETF", emoji: "📊", color: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20" },
};

export default async function InvestimentiPage() {
  // Prima visita: seed delle categorie investimento di default se mancano
  await ensureDefaultInvestmentCategories();

  const [history, dataState, binanceCred, revolutXCred] = await Promise.all([
    getInvestmentsHistoryV2(),
    hasInvestmentData(),
    getCredentialStatus("binance"),
    getCredentialStatus("revolut-x"),
  ]);

  // Sync target abilitati: solo le integrazioni davvero connesse + il refresh
  // dei prezzi Yahoo (universale, non richiede credenziali — agisce su
  // qualsiasi StockPosition esista nel DB).
  const syncTargets = [
    binanceCred ? { provider: "binance" as const } : null,
    revolutXCred ? { provider: "revolut-x" as const } : null,
    { provider: "stocks-prices" as const }, // sempre attivo
  ].filter((t): t is { provider: "binance" | "revolut-x" | "stocks-prices" } => t !== null);

  const investments = await prisma.investment.findMany({
    where: { currentValue: { gt: 0 } },
    orderBy: [{ displayOrder: "asc" }, { currentValue: "desc" }],
  });
  const total = investments.reduce((s, i) => s + i.currentValue, 0);

  // Cost basis aggregato: somma le posizioni con costEur set
  // Per Stocks Revolut e Crypto Binance leggo da tabelle dettagliate
  const stockPositions = await prisma.stockPosition.findMany({});
  const stocksCostEur = stockPositions.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.avgCost * p.fxToEur : s),
    0,
  );
  const stocksValueWithCost = stockPositions.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.currentPrice * p.fxToEur : s),
    0,
  );

  const cryptoCostBases = await prisma.cryptoCostBasis.findMany({});
  const cryptoCostByPlat = new Map<string, number>();
  for (const c of cryptoCostBases) {
    cryptoCostByPlat.set(
      `${c.platform}|${c.asset}`,
      (cryptoCostByPlat.get(`${c.platform}|${c.asset}`) ?? 0) + c.costEur,
    );
  }
  const cryptoCostTotal = cryptoCostBases.reduce((s, c) => s + c.costEur, 0);
  const cryptoPositions = await prisma.cryptoPosition.findMany({});
  const cryptoValueWithCost = cryptoPositions
    .filter((p) => cryptoCostByPlat.has(`${p.platform}|${p.asset}`))
    .reduce((s, p) => s + p.eurValue, 0);

  // Investment-level costEur (es. Crypto Revolut X aggregato senza breakdown)
  // Solo se la piattaforma NON ha già costi a livello CryptoCostBasis (per evitare double count)
  let investmentLevelCost = 0;
  let investmentLevelValue = 0;
  for (const inv of investments) {
    if (inv.costEur != null) {
      const hasCryptoBreakdown =
        inv.type === "crypto" &&
        cryptoCostBases.some((c) => c.platform === inv.platform);
      if (hasCryptoBreakdown) continue;
      const hasStockBreakdown =
        inv.type === "stocks" && stockPositions.some((p) => p.platform === inv.platform);
      if (hasStockBreakdown) continue;
      investmentLevelCost += inv.costEur;
      investmentLevelValue += inv.currentValue;
    }
  }

  const totalCost = stocksCostEur + cryptoCostTotal + investmentLevelCost;
  const valueOfPriced =
    stocksValueWithCost + cryptoValueWithCost + investmentLevelValue;
  const unrealizedGain = totalCost > 0 ? valueOfPriced - totalCost : 0;
  const unrealizedPct = totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0;

  const byType = investments.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.type] = (acc[inv.type] ?? 0) + inv.currentValue;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investimenti</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Snapshot del portfolio · {investments.length} posizioni
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SyncAllButton targets={syncTargets} />
          <StockTradesImportDialog />
        </div>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-violet-500/10 via-[var(--color-surface)] to-indigo-500/10 p-8">
        <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <div>
              <div className="text-xs uppercase tracking-widest text-[var(--color-fg-muted)] mb-2 flex items-center gap-2">
                <TrendingUp className="size-3.5" />
                Valore totale
              </div>
              <div className="text-5xl font-semibold tracking-tight text-headline-violet">
                {formatEUR(total)}
              </div>
              {totalCost > 0 && (
                <div className="mt-2 text-sm text-[var(--color-fg-muted)]">
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
                <div className="text-xs uppercase tracking-widest text-[var(--color-fg-muted)] mb-2">
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
                  {unrealizedPct.toFixed(2)}%
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(byType).map(([type, val]) => {
              const meta = TYPE_META[type] ?? { label: type, emoji: "•", color: "" };
              const pct = total > 0 ? (val / total) * 100 : 0;
              return (
                <div
                  key={type}
                  className="flex items-center gap-2 rounded-full bg-[var(--color-surface)]/60 border border-[var(--color-border)] px-3 py-1.5 text-xs"
                >
                  <span>{meta.emoji}</span>
                  <span className="font-medium">{meta.label}</span>
                  <span className="text-[var(--color-fg-muted)]">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <InvestmentsChart
        data={history}
        hasStocks={dataState.hasStocks}
        hasCrypto={dataState.hasCrypto}
        binanceConnected={!!binanceCred}
      />

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
          Posizioni
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {investments.map((inv) => {
            const meta = TYPE_META[inv.type] ?? { label: inv.type, emoji: "•", color: "" };
            const isBinance = inv.platform === "Binance" && inv.type === "crypto";
            const isRevolutCrypto = inv.platform === "Revolut X" && inv.type === "crypto";
            const isStocksRevolut = inv.platform === "Revolut" && inv.type === "stocks";
            const detailHref = isBinance
              ? "/investimenti/crypto"
              : isRevolutCrypto
                ? "/investimenti/crypto-revolut"
                : isStocksRevolut
                  ? "/investimenti/stocks"
                  : null;
            const card = (
              <div
                className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${meta.color} p-5 transition-transform ${detailHref ? "hover:-translate-y-0.5" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
                    {meta.emoji}
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)]">
                    {inv.platform}
                  </span>
                </div>
                <div className="text-sm text-[var(--fg-muted)]">{inv.name}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {formatEUR(inv.currentValue)}
                </div>
                {detailHref && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-violet-400">
                    <span className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
                    Live · click per dettaglio
                  </div>
                )}
              </div>
            );
            return detailHref ? (
              <Link key={inv.id} href={detailHref} className="block">
                {card}
              </Link>
            ) : (
              <div key={inv.id}>{card}</div>
            );
          })}

          {!investments.some(
            (i) => i.platform === "Revolut X" && i.type === "crypto",
          ) && (
            <Link
              href="/investimenti/crypto-revolut"
              className="block group relative overflow-hidden rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)]/40 p-5 transition-colors hover:border-violet-500/40 hover:bg-violet-500/[0.04]"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
                  🚀
                </div>
                <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)]">
                  Revolut X
                </span>
              </div>
              <div className="text-sm text-[var(--fg-muted)]">Crypto Revolut X</div>
              <div className="text-2xl font-semibold tabular-nums mt-1 text-[var(--fg-subtle)]">
                Da configurare
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-violet-400">
                <span>+ aggiungi posizioni manuali</span>
              </div>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stato integrazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-[var(--fg-muted)]">
            <li>
              ✅ <strong>Crypto Binance</strong> — sync API live (saldi spot/earn/funding,
              prezzi EUR ufficiali). Cost basis aggregato manuale.
            </li>
            <li>
              ✅ <strong>Crypto Revolut X</strong> — sync API live via Ed25519 (read-only,
              endpoint <code className="text-xs">revx.revolut.com/api/1.0/balances</code>).
              Prezzi EUR via ticker pubblico Binance. Cost basis manuale per asset.
            </li>
            <li>
              ✅ <strong>Stocks Trading Revolut</strong> — prezzi live via Yahoo Finance
              (refresh manuale dal pulsante &quot;Sync tutto&quot;). Cost basis FIFO da CSV
              import + FX ECB. Allineato a Revolut a livello per-ticker.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-[var(--fg-subtle)]">
            Pulsante &quot;Sync tutto&quot; in alto lancia tutti i sync attivi in parallelo.
            FX EUR/USD da ECB reference rate.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
