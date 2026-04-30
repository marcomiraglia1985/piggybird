"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertTriangle, Activity, BarChart3 } from "lucide-react";
import {
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { formatEUR, cn } from "@/lib/utils";

type Range = "1mo" | "3mo" | "6mo" | "1y" | "5y" | "max";
const RANGES: { key: Range; label: string }[] = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "Max" },
];

type Series = { date: string; open?: number; high?: number; low?: number; close: number }[];
type Trade = { date: string; type: "BUY" | "SELL"; qty: number; pricePerUnit: number; totalEur: number };
type ChartType = "line" | "candle";

type Candle = { ts: number; open: number; high: number; low: number; close: number };

function CandleLayer({ data }: { data: Candle[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale || data.length === 0) return null;
  // Larghezza candela: 70% della distanza tra due timestamp consecutivi
  const candleWidth = (() => {
    if (data.length < 2) return 6;
    const dx = (xScale(data[1].ts) ?? 0) - (xScale(data[0].ts) ?? 0);
    return Math.max(2, Math.min(10, Math.abs(dx) * 0.7));
  })();
  return (
    <g>
      {data.map((c) => {
        const x = xScale(c.ts);
        const yOpen = yScale(c.open);
        const yClose = yScale(c.close);
        const yHigh = yScale(c.high);
        const yLow = yScale(c.low);
        if (
          x == null ||
          yOpen == null ||
          yClose == null ||
          yHigh == null ||
          yLow == null
        )
          return null;
        const isUp = c.close >= c.open;
        const color = isUp ? "#10b981" : "#f43f5e";
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={c.ts}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={x - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              fillOpacity={isUp ? 0.85 : 0.95}
            />
          </g>
        );
      })}
    </g>
  );
}

export function AssetChartModal({
  open,
  onClose,
  symbol,
  kind,
  title,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  kind: "stock" | "crypto";
  title?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range>("1y");
  const [series, setSeries] = useState<Series>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrades, setShowTrades] = useState(true);
  const [chartType, setChartType] = useState<ChartType>("line");

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/integrations/price-history?symbol=${encodeURIComponent(symbol)}&kind=${kind}&range=${range}`).then((r) => r.json()),
      fetch(`/api/integrations/trade-history?symbol=${encodeURIComponent(symbol)}&kind=${kind}`).then((r) => r.json()),
    ])
      .then(([priceJ, tradesJ]) => {
        if (priceJ.error) throw new Error(priceJ.error);
        setSeries(priceJ.series ?? []);
        setTrades(tradesJ.trades ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore"))
      .finally(() => setLoading(false));
  }, [open, symbol, kind, range]);

  // Filtra trade dentro il range del chart
  const tradesInRange = (() => {
    if (series.length === 0) return [];
    const startTs = new Date(series[0].date).getTime();
    const endTs = new Date(series[series.length - 1].date).getTime();
    return trades.filter((t) => {
      const ts = new Date(t.date).getTime();
      return ts >= startTs && ts <= endTs;
    });
  })();
  const buys = tradesInRange.filter((t) => t.type === "BUY");
  const sells = tradesInRange.filter((t) => t.type === "SELL");

  const stats =
    series.length > 1
      ? {
          first: series[0].close,
          last: series[series.length - 1].close,
          delta: series[series.length - 1].close - series[0].close,
          deltaPct: (series[series.length - 1].close - series[0].close) / series[0].close,
          high: Math.max(...series.map((s) => s.close)),
          low: Math.min(...series.map((s) => s.close)),
        }
      : null;

  if (!mounted || !open) return null;

  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl surface p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight inline-flex items-center gap-2">
                  <span className="font-mono">{symbol}</span>
                  {title && <span className="text-[var(--fg-muted)] text-base font-normal">{title}</span>}
                </h2>
                {stats && (
                  <div className="flex items-baseline gap-3 mt-2 text-sm">
                    <span className="text-2xl font-semibold tabular-nums">
                      {formatEUR(stats.last)}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums font-medium",
                        stats.delta >= 0 ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {stats.delta >= 0 ? "+" : ""}
                      {formatEUR(stats.delta, { compact: true })} ({(stats.deltaPct * 100).toFixed(2)}%)
                    </span>
                    <span className="text-[var(--fg-muted)]">
                      H {formatEUR(stats.high, { compact: true })} · L {formatEUR(stats.low, { compact: true })}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] w-fit">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      range === r.key
                        ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] w-fit">
                <button
                  onClick={() => setChartType("line")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                    chartType === "line"
                      ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  <Activity className="size-3" /> Linea
                </button>
                <button
                  onClick={() => setChartType("candle")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                    chartType === "candle"
                      ? "bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  )}
                >
                  <BarChart3 className="size-3" /> Candele
                </button>
              </div>
            </div>

            <div className="h-80">
              {loading && (
                <div className="h-full flex items-center justify-center text-sm text-[var(--fg-muted)] gap-2">
                  <Loader2 className="size-4 animate-spin" /> Carico storico…
                </div>
              )}
              {error && (
                <div className="h-full flex items-center justify-center text-sm text-rose-400 gap-2">
                  <AlertTriangle className="size-4" /> {error}
                </div>
              )}
              {!loading && !error && series.length > 0 && (() => {
                const seriesNum = series.map((s) => ({
                  ts: new Date(s.date).getTime(),
                  open: s.open,
                  high: s.high,
                  low: s.low,
                  close: s.close,
                }));
                function snapToSeries(ts: number): number {
                  let best = seriesNum[0];
                  let bestDiff = Math.abs(best.ts - ts);
                  for (const p of seriesNum) {
                    const d = Math.abs(p.ts - ts);
                    if (d < bestDiff) { best = p; bestDiff = d; }
                  }
                  return best.close;
                }
                // In modalità "line" il pallino sta esattamente sulla riga (snap al close).
                // In modalità "candle" usa il prezzo reale del trade (è dentro o vicino al body).
                const buysNum = buys.map((t) => {
                  const ts = new Date(t.date).getTime();
                  return { ts, price: chartType === "line" ? snapToSeries(ts) : t.pricePerUnit, ...t };
                });
                const sellsNum = sells.map((t) => {
                  const ts = new Date(t.date).getTime();
                  return { ts, price: chartType === "line" ? snapToSeries(ts) : t.pricePerUnit, ...t };
                });
                const xMin = seriesNum[0].ts;
                const xMax = seriesNum[seriesNum.length - 1].ts;
                return (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={seriesNum} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="assetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                        <stop offset="55%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      domain={[xMin, xMax]}
                      scale="time"
                      tickFormatter={(v: number) => {
                        const d = new Date(v);
                        if (range === "1mo" || range === "3mo")
                          return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
                        return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
                      }}
                      minTickGap={48}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatEUR(v, { compact: true })}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      domain={(() => {
                        if (chartType === "candle") {
                          const lows: number[] = [];
                          const highs: number[] = [];
                          for (const s of seriesNum) {
                            const l = s.low ?? s.close;
                            const h = s.high ?? s.close;
                            if (typeof l === "number" && isFinite(l)) lows.push(l);
                            if (typeof h === "number" && isFinite(h)) highs.push(h);
                          }
                          if (lows.length > 0 && highs.length > 0) {
                            return [Math.min(...lows) * 0.98, Math.max(...highs) * 1.02] as [number, number];
                          }
                        }
                        return ["dataMin * 0.98", "dataMax * 1.02"] as [string, string];
                      })()}
                    />
                    <Tooltip
                      cursor={{ stroke: "#a78bfa", strokeWidth: 1, strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as {
                          ts: number;
                          close?: number;
                          price?: number;
                          type?: "BUY" | "SELL";
                          qty?: number;
                          pricePerUnit?: number;
                          totalEur?: number;
                        };
                        return (
                          <div className="surface-2 px-3 py-2 text-xs shadow-xl">
                            <div className="text-[var(--fg-muted)]">
                              {new Date(p.ts).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            {p.close != null && (
                              <div className="text-base font-semibold mt-0.5">
                                {formatEUR(p.close)}
                              </div>
                            )}
                            {p.type && (
                              <div
                                className={cn(
                                  "mt-1 text-[11px] font-medium",
                                  p.type === "BUY" ? "text-emerald-400" : "text-rose-400",
                                )}
                              >
                                {p.type} {p.qty?.toFixed(4)} @ {formatEUR(p.pricePerUnit ?? 0)} (
                                {formatEUR(p.totalEur ?? 0)})
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {/* Area sempre presente: in candle mode invisibile, ma serve a
                        registrare l'asse Y (i hook useXAxisScale/useYAxisScale richiedono
                        almeno un layer dati). */}
                    <Area
                      type="monotone"
                      data={seriesNum}
                      dataKey="close"
                      stroke={chartType === "line" ? "#a78bfa" : "transparent"}
                      strokeWidth={chartType === "line" ? 2 : 0}
                      fill={chartType === "line" ? "url(#assetGradient)" : "transparent"}
                      isAnimationActive={false}
                    />
                    {chartType === "candle" && (
                      <CandleLayer
                        data={seriesNum.filter(
                          (c): c is Candle =>
                            c.open != null && c.high != null && c.low != null,
                        )}
                      />
                    )}
                    {showTrades && buysNum.length > 0 && (
                      <Scatter
                        data={buysNum}
                        dataKey="price"
                        legendType="none"
                        isAnimationActive={false}
                        shape={(props: { cx?: number; cy?: number }) => {
                          const cx = props.cx ?? 0;
                          const cy = props.cy ?? 0;
                          const fill = chartType === "candle" ? "#ffffff" : "#10b981";
                          const stroke = chartType === "candle" ? "#0f172a" : "#10b981";
                          return (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={fill}
                              stroke={stroke}
                              strokeWidth={1.5}
                            />
                          );
                        }}
                      />
                    )}
                    {showTrades && sellsNum.length > 0 && (
                      <Scatter
                        data={sellsNum}
                        dataKey="price"
                        legendType="none"
                        isAnimationActive={false}
                        shape={(props: { cx?: number; cy?: number }) => {
                          const cx = props.cx ?? 0;
                          const cy = props.cy ?? 0;
                          const fill = chartType === "candle" ? "#0f172a" : "#f43f5e";
                          const stroke = chartType === "candle" ? "#ffffff" : "#f43f5e";
                          return (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={fill}
                              stroke={stroke}
                              strokeWidth={1.5}
                            />
                          );
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
                );
              })()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(dialog, document.body);
}
