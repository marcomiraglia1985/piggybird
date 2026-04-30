"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatEUR } from "@/lib/utils";

type Point = { month: string; balance: number };

export function SavingsCharts({
  accountId,
  capitale,
  interessi,
  series,
}: {
  accountId: string;
  capitale: number;
  interessi: number;
  series: Point[];
}) {
  const total = capitale + interessi;
  const principalPct = total > 0 ? (capitale / total) * 100 : 100;
  const interestPct = total > 0 ? (interessi / total) * 100 : 0;
  const gradId = `savings-grad-${accountId}`;

  const hasTrend = series.length >= 2 && series.some((p) => p.balance !== series[0].balance);

  return (
    <div className="p-4 space-y-3 bg-amber-500/[0.03]">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium mb-1.5">
          Composizione
        </div>
        {total > 0 ? (
          <>
            <div className="h-6 rounded-md overflow-hidden flex bg-[var(--color-surface-2)] border border-[var(--color-border)]">
              {capitale > 0 && (
                <div
                  className="bg-amber-500/70 flex items-center justify-end px-1.5 text-[10px] tabular-nums text-amber-950 font-semibold"
                  style={{ width: `${principalPct}%` }}
                >
                  {principalPct >= 18 && `${principalPct.toFixed(0)}%`}
                </div>
              )}
              {interessi > 0 && (
                <div
                  className="bg-emerald-500/80 flex items-center justify-start px-1.5 text-[10px] tabular-nums text-emerald-950 font-semibold"
                  style={{ width: `${interestPct}%` }}
                >
                  {interestPct >= 12 && `${interestPct.toFixed(1)}%`}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-amber-500/70" />
                <span className="text-[var(--color-fg-subtle)]">Capitale</span>
                <span className="tabular-nums text-amber-400">{formatEUR(capitale)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm bg-emerald-500/80" />
                <span className="text-[var(--color-fg-subtle)]">Interessi</span>
                <span className="tabular-nums text-emerald-400">+{formatEUR(interessi)}</span>
              </span>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-[var(--color-fg-subtle)] py-1">
            Nessun saldo da scomporre.
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium mb-1.5">
          Andamento 12 mesi
        </div>
        {hasTrend ? (
          <div className="h-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <XAxis dataKey="month" hide />
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(245 158 11)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  cursor={{ stroke: "rgb(245 158 11)", strokeOpacity: 0.3 }}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                    padding: "4px 8px",
                  }}
                  labelStyle={{ color: "var(--color-fg-muted)", fontSize: 10 }}
                  formatter={(v: number) => [formatEUR(v), "Saldo"]}
                  labelFormatter={(label: unknown) => {
                    if (typeof label !== "string" || !label.includes("-")) return "";
                    const [y, m] = label.split("-");
                    const d = new Date(parseInt(y), parseInt(m) - 1, 1);
                    return d.toLocaleDateString("it-IT", {
                      month: "short",
                      year: "numeric",
                    });
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="rgb(245 158 11)"
                  fill={`url(#${gradId})`}
                  strokeWidth={1.75}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--color-fg-subtle)] py-1">
            Storico insufficiente per il grafico.
          </div>
        )}
      </div>
    </div>
  );
}
