"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
} from "recharts";
import { formatEUR, formatMonth, cn } from "@/lib/utils";
import { WidgetHelpPopover } from "@/components/dashboard/widget-help-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import { findMilestoneUnlocks } from "@/lib/milestones";

type Point = { month: string; total: number; isFuture?: boolean };

type Range = "1A" | "3A" | "5A" | "TUTTO";

const RANGES: { key: Range; label: string; months: number | null }[] = [
  { key: "1A", label: "1 Anno", months: 12 },
  { key: "3A", label: "3 Anni", months: 36 },
  { key: "5A", label: "5 Anni", months: 60 },
  { key: "TUTTO", label: "Tutto", months: null },
];

export function NetWorthChart({ data }: { data: Point[] }) {
  const [range, setRange] = useState<Range>("TUTTO");
  // Toggle dal widget Milestones (stessa chiave localStorage). Permette di
  // mostrare pallini dorati sui punti dove il LNW ha raggiunto una soglia
  // milestone per la prima volta.
  const [milestoneOpts] = useWidgetSettings("milestones", { showOnChart: false });

  const filtered = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range);
    const base = !cfg?.months ? data : data.slice(-cfg.months);
    // Suddivide ogni punto in totalPast / totalFuture per la doppia Area.
    // Il punto "bridge" (ultimo passato o primo futuro) ha entrambi valorizzati
    // per garantire continuità grafica.
    const firstFutureIdx = base.findIndex((p) => p.isFuture);
    return base.map((p, i) => {
      const isPast = !p.isFuture;
      const isBridgeFromPast = isPast && firstFutureIdx > 0 && i === firstFutureIdx - 1;
      const isFirstFuture = p.isFuture && i === firstFutureIdx;
      return {
        ...p,
        totalPast: isPast || isBridgeFromPast ? p.total : null,
        totalFuture: p.isFuture || isBridgeFromPast || isFirstFuture ? p.total : null,
      };
    });
  }, [data, range]);

  // Milestone marker da disegnare sopra la curva (solo punti DENTRO il
  // periodo filtrato). Calcolato dalla history reale (non future).
  const milestoneMarkers = useMemo(() => {
    if (!milestoneOpts.showOnChart) return [];
    const real = data.filter((p) => !p.isFuture);
    const unlocks = findMilestoneUnlocks(real);
    const months = filtered.map((p) => p.month);
    return unlocks.filter((u) => months.includes(u.month));
  }, [data, filtered, milestoneOpts.showOnChart]);

  const stats = useMemo(() => {
    const past = filtered.filter((p) => !p.isFuture);
    if (past.length < 2) return { delta: 0, deltaPct: 0 };
    const first = past[0].total;
    const last = past[past.length - 1].total;
    return {
      delta: last - first,
      deltaPct: first === 0 ? 0 : (last - first) / first,
    };
  }, [filtered]);

  return (
    <div className="surface p-6 h-[420px] flex flex-col">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap shrink-0">
        <div>
          <h2
            className="text-sm font-medium text-[var(--color-fg-muted)] uppercase tracking-wide"
            title="Liquid Net Worth: cash + risparmi + investimenti, esclusi gli immobili"
          >
            Andamento Liquid Net Worth
          </h2>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">
            {filtered.length > 0 && (
              <>
                Da {formatMonth(filtered[0].month)} —{" "}
                <span className={cn(stats.delta >= 0 ? "text-emerald-400" : "text-rose-400", "font-medium")}>
                  {stats.delta >= 0 ? "+" : ""}{formatEUR(stats.delta, { compact: true })} ({(stats.deltaPct * 100).toFixed(1)}%)
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
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
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-md"
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>
          <WidgetHelpPopover title="Andamento LNW">
            <p>
              <strong className="text-[var(--fg)]">La curva del tuo patrimonio
              liquido</strong> (conti + risparmi + cash + investimenti) nel
              tempo. Sono esclusi gli immobili.
            </p>
            <p>
              Ogni punto è uno snapshot di fine mese. La linea continua è
              storica, quella tratteggiata (se presente) è una proiezione
              futura basata sui movimenti programmati fino a fine anno.
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Questa è la metrica più affidabile per misurare se stai
              andando bene! Le spese mensili possono ingannare (es. acquisto
              casa fa scendere il LNW ma sposta valore in immobile), ma sul
              lungo periodo questa curva dice la verità.
            </p>
          </WidgetHelpPopover>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filtered} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient key="nwGradient" id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop key="0" offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                <stop key="55" offset="55%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop key="100" offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(v: string) =>
                new Date(v).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
              }
              minTickGap={32}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatEUR(v, { compact: true })}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: "#a78bfa", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="surface-2 px-3 py-2 text-xs shadow-xl">
                    <div className="text-[var(--color-fg-muted)] inline-flex items-center gap-1.5">
                      {formatMonth(p.month)}
                      {p.isFuture && (
                        <span className="text-[10px] uppercase tracking-wider px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">
                          proiezione
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold mt-0.5">{formatEUR(p.total)}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="totalPast"
              stroke="#a78bfa"
              strokeWidth={2}
              fill="url(#nwGradient)"
              animationDuration={1100}
              animationEasing="ease-out"
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="totalFuture"
              stroke="#a78bfa"
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#nwGradient)"
              fillOpacity={0.5}
              animationDuration={1100}
              animationEasing="ease-out"
              connectNulls={false}
            />
            {milestoneMarkers.map((m) => (
              <ReferenceDot
                key={m.tier.amount}
                x={m.month}
                y={m.total}
                r={3}
                fill="#f59e0b"
                stroke="none"
                ifOverflow="visible"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
