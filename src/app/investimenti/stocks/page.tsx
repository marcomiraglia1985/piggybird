import { prisma } from "@/lib/prisma";
import { formatEUR } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, TrendingUp, History } from "lucide-react";
import { TradingClient } from "@/components/investimenti/trading-client";
import { CashBalance } from "@/components/investimenti/cash-balance";
import { StocksRefreshButton } from "@/components/investimenti/stocks-refresh-button";
import { RichTooltip } from "@/components/ui/rich-tooltip";
import { ApiConnectionBanner } from "@/components/investimenti/api-connection-banner";

export const dynamic = "force-dynamic";

export default async function TradingPage() {
  const positions = await prisma.stockPosition.findMany({
    where: { platform: "Revolut" },
    orderBy: [{ assetType: "asc" }, { ticker: "asc" }],
  });

  const enriched = positions.map((p) => {
    const eurValue = p.shares * p.currentPrice * p.fxToEur;
    const eurPrice = p.currentPrice * p.fxToEur;
    // avgCost è in valuta NATIVA (USD/GBP/EUR): converto in EUR a FX corrente
    // per allinearmi a Revolut (che mostra l'avg cost riconvertito al FX live).
    const eurAvgCost = p.avgCost ? p.avgCost * p.fxToEur : null;
    const gainAbs = eurAvgCost != null ? p.shares * (eurPrice - eurAvgCost) : null;
    const gainPct = eurAvgCost ? (eurPrice - eurAvgCost) / eurAvgCost : null;
    return {
      ...p,
      lastUpdated: p.lastUpdated.toISOString(),
      eurValue,
      gainAbs,
      gainPct,
    };
  });

  // Realized PnL aggregato (per future chart)
  const realized = await prisma.realizedPnL.findMany({
    where: { platform: "Revolut" },
    orderBy: { dateSold: "asc" },
  });

  // Cash disponibile nel conto trading
  const cashRows = await prisma.tradingCash.findMany({
    where: { platform: "Revolut" },
    orderBy: { currency: "asc" },
  });
  const cashSerialized = cashRows.map((c) => ({
    ...c,
    lastUpdated: c.lastUpdated.toISOString(),
  }));
  const cashEur = cashRows.reduce((s, c) => s + c.amount * c.fxToEur, 0);

  const positionsTotal = enriched.reduce((s, p) => s + p.eurValue, 0);
  const total = positionsTotal + cashEur;
  const totalCost = enriched.reduce(
    (s, p) => (p.avgCost ? s + p.shares * p.avgCost * p.fxToEur : s), // avgCost in nativo → EUR a fx live
    0,
  );
  const unrealizedGain = totalCost > 0 ? positionsTotal - totalCost : 0;

  // Realized P/L convertito in EUR. fxAtSell viene popolato durante l'import:
  // se è 1.0 ma currency!=EUR, fallback a una stima conservativa (current
  // platform FX corrente, dalla prima posizione con quella currency).
  const usdFxApprox =
    enriched.find((p) => p.currency === "USD")?.fxToEur ?? 0.92;
  const realizedGainEur = realized.reduce((s, r) => {
    const fx = r.fxAtSell > 0 && r.fxAtSell !== 1.0 ? r.fxAtSell : (r.currency === "USD" ? usdFxApprox : 1);
    return s + r.pnl * fx;
  }, 0);

  // Breakdown by assetType (+ cash come voce a parte)
  const byType: Record<string, number> = {};
  for (const p of enriched) byType[p.assetType] = (byType[p.assetType] ?? 0) + p.eurValue;
  if (cashEur > 0) byType["cash"] = cashEur;

  const TYPE_LABELS: Record<string, string> = {
    stock: "Azioni",
    etf: "ETF",
    metal: "Materie prime",
    cash: "Cash",
  };

  const lastUpdated = positions.length > 0
    ? positions.reduce((max, p) => (p.lastUpdated > max ? p.lastUpdated : max), positions[0].lastUpdated)
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
              <span>📈</span> Trading Revolut
            </h1>
            <p className="text-sm text-[var(--fg-muted)] mt-0.5">
              {positions.length} posizioni · {realized.length} trade chiusi · prezzi live Yahoo Finance
            </p>
          </div>
          <StocksRefreshButton lastUpdated={lastUpdated?.toISOString() ?? null} />
        </div>
      </header>

      <ApiConnectionBanner status="manual" />

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
                </div>
              )}
            </div>
            {totalCost > 0 && (
              <div className="sm:text-right">
                <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-2 inline-flex items-center gap-1 sm:justify-end">
                  <RichTooltip
                    title="Unrealized P/L"
                    icon={<TrendingUp className="size-3.5 text-violet-400" />}
                    align="right"
                  >
                    <p>
                      Calcolato applicando il <strong>tasso di cambio corrente</strong> sia al cost basis che al value:
                    </p>
                    <p className="font-mono text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded p-1.5 text-center">
                      shares × (currentPrice − avgCost) × fxToEur
                    </p>
                    <p>
                      <strong>Differenza con Revolut</strong>: Revolut usa il FX al momento dell&apos;acquisto per il cost basis. Con USD apprezzato/deprezzato vs EUR negli anni, la differenza può essere di <strong>centinaia di euro</strong> su portfolio multi-currency.
                    </p>
                    <p className="text-[10px] text-[var(--color-fg-subtle)] pt-2 border-t border-[var(--color-border)]/50">
                      Il valore mostrato qui è P/L &quot;al netto del FX&quot; — non riflette il guadagno/perdita di cambio.
                    </p>
                  </RichTooltip>
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

          {Object.keys(byType).length > 1 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(byType).map(([type, value]) => (
                <div
                  key={type}
                  className="rounded-full bg-[var(--surface)]/60 border border-[var(--border)] px-3 py-1.5 text-xs"
                >
                  <span className="text-[var(--fg-muted)]">{TYPE_LABELS[type] ?? type}</span>{" "}
                  <span className="font-medium tabular-nums">{formatEUR(value, { compact: value > 999 })}</span>
                  {total > 0 && (
                    <span className="text-[var(--fg-subtle)] ml-1">
                      ({((value / total) * 100).toFixed(0)}%)
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {realized.length > 0 && (
            <div className="pt-4 border-t border-[var(--border)] flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="inline-flex items-center gap-1">
                <RichTooltip
                  title="Realized P/L"
                  icon={<History className="size-3.5 text-violet-400" />}
                  align="left"
                >
                  <p>
                    Somma dei P/L dei trade chiusi, convertiti in EUR.
                  </p>
                  <p>
                    Quando disponibile usa il <strong>fxAtSell</strong> del trade (popolato durante l&apos;import); altrimenti fallback al <strong>cambio corrente</strong>.
                  </p>
                  <p className="text-[10px] text-[var(--color-fg-subtle)] pt-2 border-t border-[var(--color-border)]/50">
                    Può differire da Revolut di qualche % su trade vecchi (FX storico approssimato).
                  </p>
                </RichTooltip>
                <span className="text-[var(--fg-muted)]">Realized P/L (storico): </span>
                <span
                  className={`font-medium tabular-nums ${realizedGainEur >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {realizedGainEur >= 0 ? "+" : ""}
                  {formatEUR(realizedGainEur)}
                </span>
              </div>
              <div className="text-xs text-[var(--fg-subtle)]">
                ({realized.length} trade chiusi dal{" "}
                {new Date(realized[0].dateSold).toLocaleDateString("it-IT", {
                  month: "short",
                  year: "numeric",
                })}
                )
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cash */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
          Saldo cash
        </h2>
        <CashBalance cash={cashSerialized} />
      </div>

      {/* Posizioni */}
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
          Posizioni aperte ({positions.length})
        </h2>
        <TradingClient positions={enriched} />
      </div>
    </div>
  );
}
