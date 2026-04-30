"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Sparkles, Plug, TrendingUp, TrendingDown } from "lucide-react";
import { formatEUR, formatMonth, formatDate, cn } from "@/lib/utils";

type Point = { month: string; total: number; costBasis?: number };
type Range = "1A" | "3A" | "5A" | "TUTTO";

/** Days indica giorni di lookback dalla fine della serie. Con granularità
 *  daily, slice(-N) prende gli ultimi N giorni. */
const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: "1A", label: "1 Anno", days: 365 },
  { key: "3A", label: "3 Anni", days: 365 * 3 },
  { key: "5A", label: "5 Anni", days: 365 * 5 },
  { key: "TUTTO", label: "Tutto", days: null },
];

export function InvestmentsChart({
  data,
  hasStocks = false,
  hasCrypto = false,
  binanceConnected = false,
}: {
  data: Point[];
  hasStocks?: boolean;
  hasCrypto?: boolean;
  binanceConnected?: boolean;
}) {
  const [range, setRange] = useState<Range>("TUTTO");

  const filtered = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    return !cfg?.days ? data : data.slice(-cfg.days);
  }, [data, range]);

  const stats = useMemo(() => {
    if (filtered.length < 2) return { delta: 0, deltaPct: 0 };
    const first = filtered[0].total;
    const last = filtered[filtered.length - 1].total;
    return {
      delta: last - first,
      deltaPct: first === 0 ? 0 : (last - first) / first,
    };
  }, [filtered]);

  // Unrealized P/L corrente: portfolio - cost basis (sull'ultimo punto)
  const plStats = useMemo(() => {
    const last = filtered[filtered.length - 1];
    if (!last || last.costBasis == null || last.costBasis <= 0) return null;
    const pl = last.total - last.costBasis;
    const pct = pl / last.costBasis;
    return { value: last.total, cost: last.costBasis, pl, pct };
  }, [filtered]);

  const hasCostBasis = filtered.some(
    (p) => p.costBasis != null && p.costBasis > 0,
  );

  // Banner: appare quando c'è almeno UN gap di precisione possibile
  const showApiHint = !binanceConnected && hasCrypto;
  const showStocksHint = !hasStocks && data.length === 0;

  if (data.length === 0) {
    return (
      <div className="surface p-6 h-[320px] flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-sm text-[var(--fg-muted)] max-w-md">
          Nessuna storia investimenti ancora. Per il grafico più preciso
          collega le tue API o importa lo storico trades.
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          <Link
            href="/impostazioni"
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border border-violet-500/30 text-xs font-medium text-violet-300 hover:border-violet-500/50 transition-colors"
          >
            <Plug className="size-3.5" />
            Connetti Binance
          </Link>
          <Link
            href="/investimenti/stocks"
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border border-violet-500/30 text-xs font-medium text-violet-300 hover:border-violet-500/50 transition-colors"
          >
            <Sparkles className="size-3.5" />
            Importa stocks CSV
          </Link>
        </div>
        {showStocksHint && (
          <p className="text-[11px] text-[var(--fg-subtle)] max-w-md">
            Anche con dati manuali puoi vedere un grafico — basta avere snapshot
            net worth o tx categorizzate come investimento.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="surface p-6 flex flex-col">
      {showApiHint && (
        <div className="mb-4 px-3 py-2 rounded-md bg-violet-500/[0.06] border border-violet-500/20 text-[11px] text-violet-300/90 flex items-center gap-2">
          <Sparkles className="size-3.5 shrink-0" />
          <span>
            Per un grafico crypto preciso al day-by-day,{" "}
            <Link href="/impostazioni" className="underline font-medium hover:text-violet-200">
              connetti la tua API Binance
            </Link>
            . Senza, le holdings storiche sono approssimate.
          </span>
        </div>
      )}
      <div className="h-[380px] flex flex-col">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap shrink-0">
        <div>
          <h2 className="text-sm font-medium text-[var(--color-fg-muted)] uppercase tracking-wide">
            Andamento investimenti
          </h2>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
            {filtered.length > 0 && (
              <>
                Da {formatMonth(filtered[0].month)} —{" "}
                <span
                  className={cn(
                    stats.delta >= 0 ? "text-emerald-400" : "text-rose-400",
                    "font-medium",
                  )}
                >
                  {stats.delta >= 0 ? "+" : ""}
                  {formatEUR(stats.delta, { compact: true })} (
                  {(stats.deltaPct * 100).toFixed(1)}%)
                </span>
              </>
            )}
          </p>
          {plStats && (
            <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)]">
              {plStats.pl >= 0 ? (
                <TrendingUp className="size-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="size-3.5 text-rose-400" />
              )}
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Unrealized P/L
              </span>
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  plStats.pl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {plStats.pl >= 0 ? "+" : ""}
                {formatEUR(plStats.pl, { compact: true })}
              </span>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  plStats.pl >= 0 ? "text-emerald-400/70" : "text-rose-400/70",
                )}
              >
                ({plStats.pl >= 0 ? "+" : ""}
                {(plStats.pct * 100).toFixed(1)}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "relative px-3 py-1 text-xs font-medium rounded-md transition-colors",
                range === r.key
                  ? "text-white"
                  : "text-[var(--color-fg-muted)] hover:text-white",
              )}
            >
              {range === r.key && (
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-md" />
              )}
              <span className="relative">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={filtered}
            margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="invGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                <stop offset="55%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
              opacity={0.4}
            />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatEUR(v, { compact: true })}
              tick={{ fontSize: 11, fill: "var(--color-fg-subtle)" }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-fg-subtle)", strokeWidth: 1, strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(m) =>
                formatDate(new Date(m as string), {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              }
              formatter={(v: number, name) => {
                const label =
                  name === "total" ? "Portafoglio" : "Capitale investito";
                return [formatEUR(v), label];
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="total"
              stroke="#a78bfa"
              strokeWidth={2.5}
              fill="url(#invGradient)"
            />
            {hasCostBasis && (
              <Line
                type="monotone"
                dataKey="costBasis"
                name="costBasis"
                stroke="#fbbf24"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasCostBasis && (
        <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--color-fg-subtle)] shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-violet-400" />
            Valore portafoglio (mark-to-market)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />
            Capitale investito (cost basis)
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
