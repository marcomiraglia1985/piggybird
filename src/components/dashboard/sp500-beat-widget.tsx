"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  LineChart as LineChartIcon,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { cn, formatEUR } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import { computeIRR, type IrrCashflow } from "@/lib/irr";

type SpyPoint = { date: string; price: number };

type Cashflow = {
  date: string;
  amountEur: number;
  platform: string;
  type: "TOP-UP" | "WITHDRAWAL";
};

type Props = {
  cashflows: Cashflow[];
  finalByPlatform: Record<string, number>;
  platforms: string[];
  spySeries: SpyPoint[] | null;
  mdloxSeries: SpyPoint[] | null;
  brkbSeries: SpyPoint[] | null;
};

type ViewMode = "numeric" | "chart";

type Settings = {
  selectedPlatforms: string[] | null;
  viewMode: ViewMode;
  showMdlox: boolean;
  showBrkb: boolean;
};
const DEFAULTS: Settings = {
  selectedPlatforms: null,
  viewMode: "chart",
  showMdlox: false,
  showBrkb: false,
};

type BenchmarkConfig = {
  key: "spy" | "mdlox" | "brkb";
  label: string;
  longLabel: string;
  color: string;
  series: SpyPoint[] | null;
};

const YEAR_MS = 365.25 * 86_400_000;

function formatPct(p: number, sign = false) {
  const formatted = (p * 100).toFixed(1);
  return sign && p >= 0 ? `+${formatted}%` : `${formatted}%`;
}

function formatStartMonth(iso: string) {
  const d = new Date(iso);
  const labels = [
    "gen",
    "feb",
    "mar",
    "apr",
    "mag",
    "giu",
    "lug",
    "ago",
    "set",
    "ott",
    "nov",
    "dic",
  ];
  return `${labels[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function spyPriceAt(series: SpyPoint[], targetMs: number): number | null {
  if (series.length === 0) return null;
  const first = new Date(series[0].date).getTime();
  const last = new Date(series[series.length - 1].date).getTime();
  if (targetMs <= first) return series[0].price;
  if (targetMs >= last) return series[series.length - 1].price;
  for (let i = 1; i < series.length; i++) {
    const t1 = new Date(series[i].date).getTime();
    if (t1 >= targetMs) {
      const t0 = new Date(series[i - 1].date).getTime();
      const p0 = series[i - 1].price;
      const p1 = series[i].price;
      const w = (targetMs - t0) / (t1 - t0);
      return p0 + (p1 - p0) * w;
    }
  }
  return series[series.length - 1].price;
}

export function Sp500BeatWidget({
  cashflows,
  finalByPlatform,
  platforms,
  spySeries,
  mdloxSeries,
  brkbSeries,
}: Props) {
  const [opts, setOpts, reset] = useWidgetSettings("sp500-beat", DEFAULTS);

  const activePlatforms =
    opts.selectedPlatforms == null
      ? platforms
      : opts.selectedPlatforms.filter((p) => platforms.includes(p));

  const benchmarks: BenchmarkConfig[] = useMemo(() => {
    const list: BenchmarkConfig[] = [
      { key: "spy", label: "S&P 500", longLabel: "SPY", color: "#94a3b8", series: spySeries },
    ];
    if (opts.showMdlox && mdloxSeries) {
      list.push({
        key: "mdlox",
        label: "Larry Fink",
        longLabel: "MDLOX (BlackRock Global Allocation)",
        color: "#fb923c",
        series: mdloxSeries,
      });
    }
    if (opts.showBrkb && brkbSeries) {
      list.push({
        key: "brkb",
        label: "Warren Buffett",
        longLabel: "BRK-B (Berkshire Hathaway)",
        color: "#34d399",
        series: brkbSeries,
      });
    }
    return list;
  }, [spySeries, mdloxSeries, brkbSeries, opts.showMdlox, opts.showBrkb]);

  const data = useMemo(() => {
    if (
      !spySeries ||
      spySeries.length < 2 ||
      activePlatforms.length === 0 ||
      cashflows.length === 0
    ) {
      return null;
    }
    const filtered = cashflows
      .filter((cf) => activePlatforms.includes(cf.platform))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (filtered.length === 0) return null;

    const finalValue = activePlatforms.reduce(
      (s, p) => s + (finalByPlatform[p] ?? 0),
      0,
    );
    if (finalValue <= 0) return null;

    const lastCashflowMs = filtered.reduce(
      (max, cf) => Math.max(max, new Date(cf.date).getTime()),
      0,
    );
    const todayMs = Math.max(Date.now(), lastCashflowMs + 86_400_000);
    const todayIso = new Date(todayMs).toISOString();

    const marcoCashflows: IrrCashflow[] = [
      ...filtered.map((cf) => ({ date: cf.date, amount: cf.amountEur })),
      { date: todayIso, amount: finalValue },
    ];
    const portfolioIrr = computeIRR(marcoCashflows);
    if (portfolioIrr == null) return null;

    const totalIn = filtered
      .filter((cf) => cf.amountEur < 0)
      .reduce((s, cf) => s + Math.abs(cf.amountEur), 0);
    const totalOutBefore = filtered
      .filter((cf) => cf.amountEur > 0)
      .reduce((s, cf) => s + cf.amountEur, 0);
    const portfolioTotalReturn =
      totalIn > 0 ? (totalOutBefore + finalValue - totalIn) / totalIn : 0;
    const startDateIso = filtered[0].date;
    const yearsBetween = (todayMs - new Date(startDateIso).getTime()) / YEAR_MS;

    // Per ogni benchmark abilitato calcola: shares accumulate basate su prezzo
    // reale al timestamp di ogni cashflow → finalValue → IRR + total return.
    type BenchmarkResult = {
      key: string;
      label: string;
      longLabel: string;
      color: string;
      irr: number;
      totalReturn: number;
      finalValue: number;
      sharesAt: Map<string, number>;
      lastPrice: number;
    };
    const benchResults: BenchmarkResult[] = [];
    for (const b of benchmarks) {
      const series = b.series;
      if (!series || series.length < 2) continue;
      const last = series[series.length - 1];
      const todayPrice = spyPriceAt(series, todayMs) ?? last.price;
      let bFinal = 0;
      let shares = 0;
      const sharesAt = new Map<string, number>();
      for (const cf of filtered) {
        const ms = new Date(cf.date).getTime();
        const price = spyPriceAt(series, ms);
        if (price == null || price <= 0) {
          sharesAt.set(cf.date, shares);
          continue;
        }
        shares += -cf.amountEur / price;
        sharesAt.set(cf.date, shares);
        bFinal += -cf.amountEur * (todayPrice / price);
      }
      const cf: IrrCashflow[] = [
        ...filtered.map((c) => ({ date: c.date, amount: c.amountEur })),
        { date: todayIso, amount: bFinal },
      ];
      const irr = computeIRR(cf);
      if (irr == null) continue;
      const tr =
        totalIn > 0 ? (totalOutBefore + bFinal - totalIn) / totalIn : 0;
      benchResults.push({
        key: b.key,
        label: b.label,
        longLabel: b.longLabel,
        color: b.color,
        irr,
        totalReturn: tr,
        finalValue: bFinal,
        sharesAt,
        lastPrice: todayPrice,
      });
    }
    const spy = benchResults.find((b) => b.key === "spy");
    if (!spy) return null;

    // Trajectory unificata: 1 colonna per benchmark + colonna "marco".
    type TrajectoryPoint = { date: string; marco: number } & Record<string, number>;
    const trajectory: TrajectoryPoint[] = [];
    let marcoVal = 0;
    let prevMs = 0;
    for (const cf of filtered) {
      const ms = new Date(cf.date).getTime();
      const yearsFromPrev = prevMs === 0 ? 0 : (ms - prevMs) / YEAR_MS;
      if (yearsFromPrev > 0) {
        marcoVal *= Math.pow(1 + portfolioIrr, yearsFromPrev);
      }
      marcoVal += -cf.amountEur;
      const point: TrajectoryPoint = { date: cf.date, marco: Math.max(0, marcoVal) };
      for (const br of benchResults) {
        const shares = br.sharesAt.get(cf.date) ?? 0;
        const series = benchmarks.find((b) => b.key === br.key)?.series;
        const px = series ? spyPriceAt(series, ms) : null;
        const val = px != null ? shares * px : 0;
        point[br.key] = Math.max(0, val);
      }
      trajectory.push(point);
      prevMs = ms;
    }
    if (prevMs > 0) {
      const yearsFromLast = (todayMs - prevMs) / YEAR_MS;
      if (yearsFromLast > 0) {
        marcoVal *= Math.pow(1 + portfolioIrr, yearsFromLast);
      }
      const point: TrajectoryPoint = { date: todayIso, marco: Math.max(0, marcoVal) };
      for (const br of benchResults) {
        const lastShares = [...br.sharesAt.values()].pop() ?? 0;
        point[br.key] = Math.max(0, lastShares * br.lastPrice);
      }
      trajectory.push(point);
    }

    return {
      portfolioIrr,
      portfolioTotalReturn,
      benchResults,
      // Compat: vecchie proprietà ancora usate dal layout numerico
      spyIrr: spy.irr,
      spyTotalReturn: spy.totalReturn,
      spyFinal: spy.finalValue,
      cagrDelta: portfolioIrr - spy.irr,
      totalDelta: portfolioTotalReturn - spy.totalReturn,
      beating: portfolioIrr - spy.irr > 0,
      years: yearsBetween,
      startDateIso,
      finalValue,
      trajectory,
    };
  }, [cashflows, finalByPlatform, activePlatforms, spySeries, benchmarks]);

  function togglePlatform(p: string) {
    const current = activePlatforms;
    const next = current.includes(p)
      ? current.filter((x) => x !== p)
      : [...current, p];
    setOpts({ selectedPlatforms: next });
  }

  const allSelected = activePlatforms.length === platforms.length;
  const isChartMode = opts.viewMode === "chart";

  return (
    <Card className={cn("p-6", isChartMode && "h-[420px] flex flex-col")}>
      <CardHeader className={cn("mb-6", isChartMode && "shrink-0")}>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <LineChartIcon className="size-4 text-emerald-400" />
            S&amp;P beat
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <WidgetHelpPopover title="S&P beat">
            <p>
              <strong className="text-[var(--fg)]">
                Quanto stai battendo (o sotto-performando) l&apos;S&amp;P 500
              </strong>{" "}
              sui tuoi conti di investimento. Calcolato con <strong>IRR</strong>{" "}
              (internal rate of return) sui flussi cassa reali del trading
              account, confrontato con un&apos;ipotetica strategia &quot;tutti
              gli stessi flussi su SPY&quot; (dividendi reinvestiti).
            </p>
            <p>
              <strong>Sorgente cashflow</strong>: TOP-UP e WITHDRAWAL letti
              dal CSV export del tuo broker, importato via{" "}
              <em>Impostazioni → Trade history broker</em>. Auto-detect del
              formato (Revolut supportato, altri in arrivo).
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 IRR è la metrica usata da Revolut/eToro per il rendimento
              ponderato. Vista grafico: la curva Tu è approssimata
              (forward-compounding all&apos;IRR), la curva SPY usa prezzi
              storici reali.
            </p>
          </WidgetHelpPopover>
          <WidgetSettingsPopover title="S&P beat" onReset={reset}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="block text-[var(--fg-muted)]">Vista</span>
                <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
                  {(["numeric", "chart"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOpts({ viewMode: mode })}
                      className={cn(
                        "flex-1 px-3 py-1 text-[11px] font-medium rounded-md transition-colors",
                        opts.viewMode === mode
                          ? "bg-violet-500/20 text-violet-300"
                          : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                      )}
                    >
                      {mode === "numeric" ? "Numerica" : "Grafico"}
                    </button>
                  ))}
                </div>
              </div>

              {platforms.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--fg-muted)]">
                      Conti da includere
                    </span>
                    {!allSelected && (
                      <button
                        type="button"
                        onClick={() => setOpts({ selectedPlatforms: null })}
                        className="text-[10px] text-violet-400 hover:text-violet-300"
                      >
                        Tutti
                      </button>
                    )}
                  </div>
                  {platforms.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={activePlatforms.includes(p)}
                        onChange={() => togglePlatform(p)}
                        className="size-3.5 accent-violet-500"
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/50">
                <span className="text-[var(--fg-muted)]">Benchmark extra</span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={opts.showMdlox}
                    onChange={(e) => setOpts({ showMdlox: e.target.checked })}
                    className="size-3.5 accent-orange-500"
                    disabled={!mdloxSeries}
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-orange-400" />
                    Larry Fink
                    <span className="text-[10px] text-[var(--fg-subtle)]">
                      MDLOX
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={opts.showBrkb}
                    onChange={(e) => setOpts({ showBrkb: e.target.checked })}
                    className="size-3.5 accent-emerald-500"
                    disabled={!brkbSeries}
                  />
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    Warren Buffett
                    <span className="text-[10px] text-[var(--fg-subtle)]">
                      BRK-B
                    </span>
                  </span>
                </label>
                <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
                  Confronta la tua performance contro il fondo attivo di Larry
                  Fink (MDLOX, dal 1989) o Berkshire Hathaway di Warren Buffett.
                </p>
              </div>
            </div>
          </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent className={cn(isChartMode && "flex-1 flex flex-col min-h-0 space-y-3")}>
        {platforms.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-3xl">📊</p>
            <p className="text-xs text-[var(--fg-subtle)]">
              Nessun broker importato. Vai in{" "}
              <a
                href="/impostazioni"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                Impostazioni
              </a>{" "}
              e carica il CSV trade history del tuo broker.
            </p>
          </div>
        ) : !spySeries ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Yahoo Finance non risponde. Riprova tra un attimo.
          </p>
        ) : activePlatforms.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Seleziona almeno un conto dalle{" "}
            <span className="text-[var(--fg-muted)]">opzioni ⚙</span>.
          </p>
        ) : !data ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Dati insufficienti per calcolare l&apos;IRR.
          </p>
        ) : isChartMode ? (
          <ChartView data={data} />
        ) : (
          <NumericView data={data} />
        )}
      </CardContent>
    </Card>
  );
}

type WidgetData = {
  portfolioIrr: number;
  spyIrr: number;
  portfolioTotalReturn: number;
  spyTotalReturn: number;
  cagrDelta: number;
  totalDelta: number;
  beating: boolean;
  years: number;
  startDateIso: string;
  finalValue: number;
  spyFinal: number;
  trajectory: Array<{ date: string; marco: number; spy: number }>;
};

function NumericView({ data }: { data: WidgetData }) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
          {data.beating ? "Stai battendo SPY di" : "Stai sotto-performando di"}
        </div>
        <div
          className={cn(
            "text-5xl font-semibold tabular-nums inline-flex items-center gap-2",
            data.beating ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {data.beating ? (
            <TrendingUp className="size-7" />
          ) : (
            <TrendingDown className="size-7" />
          )}
          {formatPct(Math.abs(data.cagrDelta))}
        </div>
        <div className="text-[11px] text-[var(--fg-subtle)] tabular-nums">
          IRR annualizzato · {data.years.toFixed(1)} anni dal{" "}
          {formatStartMonth(data.startDateIso)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)]">
        <Stat
          label="Tu (IRR)"
          irr={data.portfolioIrr}
          totalReturn={data.portfolioTotalReturn}
        />
        <Stat
          label="SPY (IRR)"
          irr={data.spyIrr}
          totalReturn={data.spyTotalReturn}
        />
      </div>
    </div>
  );
}

function ChartView({ data }: { data: WidgetData }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2 shrink-0">
        <div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums inline-flex items-center gap-1.5",
              data.beating ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {data.beating ? (
              <TrendingUp className="size-5" />
            ) : (
              <TrendingDown className="size-5" />
            )}
            {formatPct(data.cagrDelta, true)}
          </div>
          <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
            IRR delta · {data.years.toFixed(1)} anni
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-400" />
            <span className="text-[var(--fg-muted)]">Tu</span>
            <span className="tabular-nums font-medium">
              {formatEUR(data.finalValue, { compact: true })}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-slate-400" />
            <span className="text-[var(--fg-muted)]">SPY</span>
            <span className="tabular-nums font-medium">
              {formatEUR(data.spyFinal, { compact: true })}
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.trajectory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) =>
                new Date(v).toLocaleDateString("it-IT", {
                  month: "short",
                  year: "2-digit",
                })
              }
              minTickGap={32}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickFormatter={(v: number) => formatEUR(v, { compact: true })}
              axisLine={false}
              tickLine={false}
              width={48}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              cursor={{ stroke: "#a78bfa", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as {
                  date: string;
                  marco: number;
                } & Record<string, number>;
                return (
                  <div className="surface-2 px-3 py-2 text-xs shadow-xl">
                    <div className="text-[var(--fg-muted)]">
                      {new Date(p.date).toLocaleDateString("it-IT", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-violet-400" />
                      <span className="text-[var(--fg-muted)]">Tu</span>
                      <span className="tabular-nums font-medium ml-auto">
                        {formatEUR(p.marco, { compact: true })}
                      </span>
                    </div>
                    {data.benchResults.map((br) => (
                      <div key={br.key} className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: br.color }}
                        />
                        <span className="text-[var(--fg-muted)]">{br.label}</span>
                        <span className="tabular-nums font-medium ml-auto">
                          {formatEUR(p[br.key] ?? 0, { compact: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="marco"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              animationDuration={900}
            />
            {data.benchResults.map((br) => (
              <Line
                key={br.key}
                type="monotone"
                dataKey={br.key}
                stroke={br.color}
                strokeWidth={2}
                dot={false}
                animationDuration={900}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function Stat({
  label,
  irr,
  totalReturn,
}: {
  label: string;
  irr: number;
  totalReturn: number;
}) {
  const positive = irr >= 0;
  const tone = positive ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
        {label}
      </span>
      <span className={`text-base font-medium tabular-nums ${tone}`}>
        {formatPct(irr, true)}
      </span>
      <span className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
        {formatPct(totalReturn, true)} totale
      </span>
    </div>
  );
}
