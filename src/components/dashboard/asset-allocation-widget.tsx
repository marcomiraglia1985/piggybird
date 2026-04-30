"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { formatEUR } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";

type Props = {
  liquidity: number;
  savings: number;
  investments: number;
  estates: number;
};

const SLICE_NAMES = ["Liquidità", "Risparmi", "Investimenti", "Immobili"] as const;
type SliceName = (typeof SLICE_NAMES)[number];

const COLORS: Record<SliceName, string> = {
  Liquidità: "#34d399",
  Risparmi: "#fbbf24",
  Investimenti: "#a78bfa",
  Immobili: "#94a3b8",
};

type Settings = { excludeEstates: boolean };
const DEFAULTS: Settings = { excludeEstates: false };

export function AssetAllocationWidget({
  liquidity,
  savings,
  investments,
  estates,
}: Props) {
  const [opts, setOpts, reset] = useWidgetSettings("asset-allocation", DEFAULTS);
  const includeEstates = !opts.excludeEstates && estates > 0;

  const data = useMemo(() => {
    const all: Array<{ name: SliceName; value: number }> = [
      { name: "Liquidità", value: Math.max(0, liquidity) },
      { name: "Risparmi", value: Math.max(0, savings) },
      { name: "Investimenti", value: Math.max(0, investments) },
    ];
    if (includeEstates) {
      all.push({ name: "Immobili", value: Math.max(0, estates) });
    }
    const total = all.reduce((s, d) => s + d.value, 0);
    return { slices: all.filter((d) => d.value > 0), total, all };
  }, [liquidity, savings, investments, estates, includeEstates]);

  const centerLabel = includeEstates ? "NW" : "LNW";

  return (
    <Card className="p-6 h-[420px] flex flex-col">
      <CardHeader className="mb-6 shrink-0">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <PieIcon className="size-4 text-violet-400" />
            Asset allocation
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <WidgetHelpPopover title="Asset allocation">
            <p>
              <strong className="text-[var(--fg)]">
                Come è distribuito il tuo patrimonio
              </strong>{" "}
              tra le macro-categorie: liquidità sui conti, risparmi
              (depositi/obbligazioni), e investimenti (azioni/crypto/ETF).
            </p>
            <p>
              Di default include anche il valore degli immobili di proprietà —
              quello che vedi è il <strong>NW</strong> (Net Worth) completo.
              Dalle opzioni puoi escluderli per vedere solo il{" "}
              <strong>LNW</strong> (asset liquidi).
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Una buona allocazione bilancia liquidità per emergenze e
              investimenti per la crescita di lungo periodo.
            </p>
          </WidgetHelpPopover>
          <WidgetSettingsPopover title="Asset allocation" onReset={reset}>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={opts.excludeEstates}
                onChange={(e) => setOpts({ excludeEstates: e.target.checked })}
                className="size-3.5 mt-0.5 accent-violet-500"
                disabled={estates === 0}
              />
              <span>
                Escludi <strong>immobili</strong> dal totale{" "}
                <em>(passa da NW a LNW)</em>
                {estates === 0 && (
                  <span className="block text-[10px] text-[var(--fg-subtle)] mt-0.5">
                    Nessun immobile di proprietà attivo.
                  </span>
                )}
              </span>
            </label>
          </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 flex-1 flex flex-col min-h-0">
        {data.total === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Nessun dato disponibile.
          </p>
        ) : (
          <div className="flex flex-col flex-1 gap-4 min-h-0">
            <div className="relative flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={76}
                    outerRadius={112}
                    paddingAngle={2}
                    stroke="none"
                    animationDuration={900}
                    animationEasing="ease-out"
                  >
                    {data.slices.map((s) => (
                      <Cell key={s.name} fill={COLORS[s.name]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      const name = p.name as SliceName;
                      const value = Number(p.value);
                      const pct = (value / data.total) * 100;
                      return (
                        <div className="surface-2 px-3 py-2 text-xs shadow-xl">
                          <div className="text-[var(--fg-muted)]">{name}</div>
                          <div className="text-base font-semibold tabular-nums mt-0.5">
                            {formatEUR(value, { compact: true })}
                          </div>
                          <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                            {pct.toFixed(1)}%
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
                    {centerLabel}
                  </div>
                  <div className="text-xl font-semibold tabular-nums">
                    {formatEUR(data.total, { compact: true })}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 shrink-0">
              {data.all.map(({ name, value }) => {
                const pct = data.total > 0 ? (value / data.total) * 100 : 0;
                return (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs min-w-0"
                  >
                    <div className="flex items-center gap-2 text-[var(--fg-muted)] min-w-0">
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[name] }}
                      />
                      <span className="truncate">{name}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 tabular-nums shrink-0">
                      <span className="font-medium">
                        {formatEUR(value, { compact: true })}
                      </span>
                      <span className="text-[10px] text-[var(--fg-subtle)] w-7 text-right">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
