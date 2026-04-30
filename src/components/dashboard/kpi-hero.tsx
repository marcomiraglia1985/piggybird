"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { formatEUR, cn } from "@/lib/utils";

export function KpiHero({
  total,
  liquidity,
  savings,
  investments,
  investmentsGainPct,
  prevMonthTotal,
}: {
  total: number;
  liquidity: number;
  savings: number;
  investments: number;
  investmentsGainPct?: number | null;
  prevMonthTotal?: number;
}) {
  const delta = prevMonthTotal ? total - prevMonthTotal : 0;
  const deltaPct = prevMonthTotal ? delta / prevMonthTotal : 0;
  const positive = delta >= 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-bg-elevated)] to-[var(--color-surface)] p-6 md:p-8"
    >
      <div className="pointer-events-none absolute -top-20 -right-20 size-72 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-10 size-72 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs font-medium uppercase tracking-widest text-[var(--color-fg-muted)]"
            title="Patrimonio liquido: cash + risparmi + investimenti. Esclude il valore degli immobili."
          >
            Liquid Net Worth
          </span>
          {prevMonthTotal && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                positive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20",
              )}
            >
              {positive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {positive ? "+" : ""}
              {formatEUR(delta, { compact: true })} ({(deltaPct * 100).toFixed(1)}%)
            </div>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <CountUp
            value={total}
            duration={1.4}
            format={(n) => formatEUR(n)}
            className="text-5xl md:text-6xl font-semibold tracking-tight text-headline"
          />
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Liquidità" value={liquidity} color="emerald" />
          <Stat label="Risparmi" value={savings} color="amber" />
          <Stat
            label="Investimenti"
            value={investments}
            color="violet"
            className="col-span-2 md:col-span-1"
            gainPct={investmentsGainPct ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  className,
  gainPct,
}: {
  label: string;
  value: number;
  color: "emerald" | "amber" | "violet";
  className?: string;
  gainPct?: number;
}) {
  const dotColors = {
    emerald: "bg-emerald-400",
    amber: "bg-amber-400",
    violet: "bg-violet-400",
  } as const;
  const positive = gainPct != null && gainPct >= 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
        <span className={cn("size-1.5 rounded-full", dotColors[color])} />
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <CountUp
          value={value}
          format={(n) => formatEUR(n, { compact: true })}
          className="text-2xl font-medium"
        />
        {gainPct != null && (
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              positive ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {positive ? "+" : ""}
            {(gainPct * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
