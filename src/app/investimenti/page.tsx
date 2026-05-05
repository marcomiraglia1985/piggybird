import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { TrendingUp, Layers } from "lucide-react";
import { SyncAllButton } from "@/components/investimenti/sync-all-button";
import { RichTooltip } from "@/components/ui/rich-tooltip";
import { StockTradesImportDialog } from "@/components/investimenti/stock-trades-import-dialog";
import { ensureDefaultInvestmentCategories } from "@/lib/seed-defaults";
import { hasInvestmentData } from "@/lib/investments-history";
import { Suspense } from "react";
import {
  InvestmentsChartAsync,
  InvestmentsChartSkeleton,
} from "./_chart-async";
import { getCredentialStatus } from "@/lib/credentials";

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

  // history rimossa dal Promise.all: era la slow op (5-10s di fetch live
  // Yahoo + Binance). Spostata in <Suspense> sotto così il resto della
  // pagina appare subito.
  const [dataState, binanceCred, revolutXCred] = await Promise.all([
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

  const isEmpty = investments.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Investimenti</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Snapshot del portfolio · {investments.length}{" "}
            {investments.length === 1 ? "conto" : "conti"} broker
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SyncAllButton targets={syncTargets} />
          <StockTradesImportDialog />
        </div>
      </header>

      {isEmpty && (
        <div className="surface p-8 text-center space-y-3 border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.06] via-[var(--color-surface)] to-indigo-500/[0.04]">
          <div className="size-14 mx-auto rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-2xl">
            📈
          </div>
          <h2 className="text-lg font-semibold tracking-tight">Nessun investimento ancora</h2>
          <p className="text-sm text-[var(--color-fg-muted)] max-w-md mx-auto leading-relaxed">
            Per iniziare crea un conto di tipo &quot;Investimento&quot; (Conti → Aggiungi conto).
            Quando hai un broker con API supportata, collega le credenziali in Impostazioni →
            Integrazioni. Per broker senza API usa import CSV dei trade.
          </p>
          <div className="inline-flex flex-wrap items-center justify-center gap-2 pt-1">
            <Link
              href="/conti/nuovo?type=investment"
              className="h-9 px-4 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 inline-flex items-center gap-1.5"
            >
              + Aggiungi conto investimento
            </Link>
            <Link
              href="/impostazioni"
              className="h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm hover:border-[var(--color-border-strong)] inline-flex items-center"
            >
              Impostazioni → Integrazioni
            </Link>
          </div>
        </div>
      )}

      {!isEmpty && (
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
                <div className="text-xs uppercase tracking-widest text-[var(--color-fg-muted)] mb-2 inline-flex items-center gap-1 sm:justify-end">
                  <RichTooltip
                    title="Come calcoliamo Unrealized P/L"
                    icon={<Layers className="size-3.5 text-violet-400" />}
                    align="right"
                  >
                    <p>
                      È la differenza tra il <strong>valore corrente</strong> delle tue posizioni e il loro <strong>cost basis</strong> (quanto hai speso per acquistarle), per ogni asset di cui conosciamo il costo.
                    </p>
                    <p>Il cost basis viene letto in ordine di preferenza:</p>
                    <ul className="space-y-1 pl-3 list-disc">
                      <li>
                        Per ogni posizione di stock/ETF di cui hai un <strong>prezzo medio di carico</strong>: <span className="font-mono text-[10px]">shares × (currentPrice − avgCost) × FX</span>
                      </li>
                      <li>
                        Per crypto con cost basis dettagliato per asset (es. da export di un exchange): differenza tra valore corrente e cost registrato
                      </li>
                      <li>
                        Per investimenti aggregati con cost manuale (es. lump sum di un conto): <span className="font-mono text-[10px]">currentValue − costEur</span>
                      </li>
                    </ul>
                    <p>
                      Le posizioni senza cost basis noto sono escluse dal calcolo (compaiono nel valore totale ma non nel P/L).
                    </p>
                    <p className="text-[10px] text-[var(--color-fg-subtle)] pt-2 border-t border-[var(--color-border)]/50">
                      Le conversioni in EUR usano il <strong>cambio corrente</strong>. Su posizioni multi-currency con FX cambiato negli anni, il numero qui può differire da quello del tuo broker (che spesso lockà il FX al momento dell&apos;acquisto).
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
      )}

      {!isEmpty && (
      <Suspense fallback={<InvestmentsChartSkeleton />}>
        <InvestmentsChartAsync
          hasStocks={dataState.hasStocks}
          hasCrypto={dataState.hasCrypto}
          binanceConnected={!!binanceCred}
        />
      </Suspense>
      )}

      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
          Conti broker
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {investments.map((inv) => {
            const meta = TYPE_META[inv.type] ?? { label: inv.type, emoji: "•", color: "" };
            // Universal-app: il platform = nome conto utente (es. "Binance Trading",
            // "Revolut Trading"). Match heuristic su pattern del nome anziché
            // string equality, così funziona qualsiasi nome scelto dall'utente.
            const platLower = inv.platform.toLowerCase();
            const isBinance = inv.type === "crypto" && platLower.includes("binance");
            const isRevolutCrypto =
              inv.type === "crypto" && /revolut/.test(platLower) && /\bx\b/.test(platLower);
            const isStocksRevolut =
              inv.type === "stocks" && /revolut/.test(platLower) && !/\bx\b/.test(platLower);
            const detailHref = isBinance
              ? "/investimenti/crypto"
              : isRevolutCrypto
                ? "/investimenti/crypto-revolut"
                : isStocksRevolut
                  ? "/investimenti/stocks"
                  : null;
            // Stato API per la badge sotto al valore:
            // - "api-live"      → credential configurata e provider supporta sync (Binance, Revolut X)
            // - "api-available" → provider supporta API ma credential mancante (CTA "collega")
            // - "api-pending"   → provider non ha ancora API integration (es. Stocks via Yahoo)
            // - "no-detail"     → nessun detail né API (semplice card statica)
            let apiState: "api-live" | "api-available" | "api-pending" | "no-detail";
            if (isBinance) apiState = binanceCred ? "api-live" : "api-available";
            else if (isRevolutCrypto) apiState = revolutXCred ? "api-live" : "api-available";
            else if (detailHref) apiState = "api-pending";
            else apiState = "no-detail";

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
                {apiState === "api-live" && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-500 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                    API attiva · click per dettaglio
                  </div>
                )}
                {apiState === "api-available" && (
                  <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
                    Collega API per sync automatico · click per dettaglio
                  </div>
                )}
                {apiState === "api-pending" && (
                  <div className="mt-2 text-[11px] text-[var(--fg-muted)]">
                    Sync manuale · click per dettaglio
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

        </div>
      </div>

      <div className="text-[11px] text-[var(--fg-muted)] leading-relaxed pt-2 surface p-3">
        Per attivare il sync automatico di un provider con API supportata, vai su{" "}
        <Link
          href="/impostazioni"
          className="text-violet-700 dark:text-violet-300 hover:underline font-medium"
        >
          Impostazioni → Integrazioni
        </Link>{" "}
        e collega le tue credenziali read-only.
      </div>

      <div className="text-[10px] text-[var(--fg-subtle)] leading-relaxed pt-2">
        <span className="opacity-70">Note tecniche:</span>{" "}
        Crypto via API degli exchange connessi (saldi e prezzi EUR ufficiali) ·
        Stocks/ETF prezzi via Yahoo Finance (refresh manuale dal bottone Sync) ·
        Cost basis FIFO da CSV broker importati · Conversioni FX a tassi ECB.
        Sync tutto = lancia in parallelo tutti i provider connessi.
      </div>
    </div>
  );
}
