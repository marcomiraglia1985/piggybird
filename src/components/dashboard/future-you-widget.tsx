"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, cn } from "@/lib/utils";
import { Telescope } from "lucide-react";
import { useWidgetSettings } from "@/lib/widget-settings";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { WidgetHelpPopover } from "./widget-help-popover";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
} from "recharts";

type NWPoint = { month: string; total: number; isFuture: boolean };

type RateMode = "auto" | "fixed";
type Settings = {
  /** "auto" usa CAGR storico. "fixed" usa rate manuale. */
  rateMode: RateMode;
  /** Tasso annuo composto se rateMode=fixed (es. 0.05 = 5%). */
  fixedRate: number;
  /** Anni di proiezione massimi nel grafico. */
  horizonYears: 5 | 10 | 15 | 20;
};
const DEFAULTS: Settings = { rateMode: "auto", fixedRate: 0.05, horizonYears: 10 };

/**
 * Tassi di crescita ANNUALE del Liquid Net Worth (non rendimento di un
 * portafoglio investito, ma ritmo aggregato di accumulo del patrimonio
 * liquido). Le descrizioni sono aspirazionali: "questo ritmo lo fa chi…".
 */
const RATE_INFO: Record<string, { label: string; desc: string }> = {
  "0.03": {
    label: "Sopravvivenza",
    desc: "Crescita appena sopra l'inflazione. Vivi senza accumulare granché — lo stipendio copre le spese, qualche risparmio finisce in conto deposito.",
  },
  "0.05": {
    label: "Costante",
    desc: "Ritmo solido, sostenibile. Risparmi una parte stabile del reddito + qualche investimento. È il \"sto facendo le cose giuste, senza stress\".",
  },
  "0.07": {
    label: "In gamba",
    desc: "Crescita robusta. Savings rate alto (20-30%), reddito che sale, investimenti che lavorano. Il NW raddoppia ogni 10 anni.",
  },
  "0.10": {
    label: "Ambizioso",
    desc: "Stai accelerando: promozioni, secondo reddito, scelte di investimento azzeccate. Mood \"fly higher\". Il NW raddoppia ogni 7 anni.",
  },
  "0.15": {
    label: "Sogno",
    desc: "Carriera in rampa, exit aziendale, immobili giusti, bull market crypto. Ritmo da fantascienza sul lungo termine — buono per sognare a occhi aperti.",
  },
};

/**
 * Future You: dove sarà il tuo Liquid Net Worth (cash + risparmi +
 * investimenti, esclusi gli immobili) tra 5/10/15/20 anni se continui al
 * ritmo attuale (CAGR storico) — oppure a un tasso fisso scelto da te.
 *
 * Math:
 *   LNW(y) = LNW_corrente × (1 + r)^y
 *   Se rateMode=auto, r = CAGR storico sui snapshot disponibili (clampato
 *   a [0, 0.20] per evitare iperestrapolazioni con pochi dati).
 */
export function FutureYouWidget({ history }: { history: NWPoint[] }) {
  const [opts, setOpts, reset] = useWidgetSettings("future-you", DEFAULTS);

  // Soglia minima di mesi di storia perché il CAGR sia affidabile.
  // Sotto questa soglia il bottone "Auto" è disabilitato e si forza il modo
  // "Fisso" — un CAGR su 6 mesi non rappresenta una tendenza, ma rumore.
  const MIN_MONTHS_FOR_AUTO = 24;

  const data = useMemo(() => {
    const real = history.filter((p) => !p.isFuture);
    if (real.length === 0) return null;
    const last = real[real.length - 1].total;
    const monthsCovered = Math.max(0, real.length - 1);
    const yearsCovered = monthsCovered / 12;
    let cagrRaw = 0; // CAGR storico reale, non cappato
    if (real.length >= 2) {
      const first = real[0];
      const ratio = first.total > 0 ? last / first.total : 0;
      if (ratio > 0 && yearsCovered > 0) {
        cagrRaw = Math.pow(ratio, 1 / yearsCovered) - 1;
      }
    }
    // Clamp del CAGR per proiezioni realistiche (un 30% YoY estrapolato a 20
    // anni genera numeri assurdi). 20% è una guardrail psicologica per il
    // forecast; il valore raw resta esposto per trasparenza nel popover.
    let cagr = cagrRaw;
    let cagrCapped = false;
    if (cagr > 0.20) {
      cagr = 0.20;
      cagrCapped = true;
    }
    if (cagr < -0.10) cagr = -0.10;

    // Auto è abilitato solo con abbastanza storia. Se non disponibile, fallback
    // a "fixed" silenziosamente (l'utente vede il warning nel popover).
    const autoAvailable = monthsCovered >= MIN_MONTHS_FOR_AUTO;
    const effectiveMode = opts.rateMode === "auto" && !autoAvailable ? "fixed" : opts.rateMode;
    const r = effectiveMode === "fixed" ? opts.fixedRate : cagr;

    // Curva di proiezione: 1 punto per anno fino a horizonYears
    const curve: Array<{ year: number; nw: number }> = [];
    for (let y = 0; y <= opts.horizonYears; y++) {
      curve.push({ year: y, nw: last * Math.pow(1 + r, y) });
    }

    // Spotlights: 3 punti chiave dell'orizzonte (inizio quartile, metà, fine).
    // Per orizzonti corti scegliamo i checkpoint più significativi.
    const horizonMap: Record<number, number[]> = {
      5: [1, 3, 5],
      10: [3, 5, 10],
      15: [5, 10, 15],
      20: [5, 10, 20],
    };
    const spotlights = horizonMap[opts.horizonYears] ?? [opts.horizonYears];

    return {
      now: last,
      cagr,
      cagrRaw,
      r,
      cagrCapped,
      curve,
      spotlights,
      monthsCovered,
      yearsCovered,
      autoAvailable,
      effectiveMode,
    };
  }, [history, opts.rateMode, opts.fixedRate, opts.horizonYears]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span
            className="inline-flex items-center gap-2"
            title="Proiezione del Liquid Net Worth (esclude immobili)"
          >
            <Telescope className="size-4 text-violet-400" />
            Future you
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
        <WidgetHelpPopover title="Future you">
          <p>
            <strong className="text-[var(--fg)]">
              Dove sarà il tuo LNW tra 5/10/15/20 anni se continui al ritmo
              attuale?
            </strong>
          </p>
          <p>
            <strong className="text-violet-300">Auto (CAGR)</strong> usa il
            tasso di crescita reale calcolato dai tuoi snapshot storici.
            Servono almeno 24 mesi di dati.
          </p>
          <p>
            <strong className="text-violet-300">Fisso</strong> ti permette
            di scegliere un tasso aspirazionale (3% conservativo → 15% sogno).
          </p>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
            💡 È una stima, non una predizione. Eventi straordinari (acquisto
            casa, exit, eredità, crisi) possono cambiare il tuo CAGR
            drasticamente. Utile sul lungo periodo.
          </p>
        </WidgetHelpPopover>
        <WidgetSettingsPopover title="Future you" onReset={reset}>
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
              Tasso di crescita
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => data?.autoAvailable && setOpts({ rateMode: "auto" })}
                disabled={!data?.autoAvailable}
                className={`flex-1 h-7 px-2.5 rounded border text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                  opts.rateMode === "auto" && data?.autoAvailable
                    ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                }`}
                title={
                  data?.autoAvailable
                    ? "Usa il CAGR storico calcolato dai tuoi snapshot"
                    : `Servono almeno ${MIN_MONTHS_FOR_AUTO} mesi di storia`
                }
              >
                Auto (CAGR)
              </button>
              <button
                type="button"
                onClick={() => setOpts({ rateMode: "fixed" })}
                className={`flex-1 h-7 px-2.5 rounded border text-xs ${
                  opts.rateMode === "fixed" || !data?.autoAvailable
                    ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                Fisso
              </button>
            </div>
            {/* Spiegazione & info storia */}
            <div className="text-[10px] text-[var(--fg-subtle)] leading-relaxed pt-1.5">
              <p>
                <span className="font-medium text-[var(--fg-muted)]">CAGR</span>{" "}
                = Compound Annual Growth Rate. Il tasso di crescita medio
                composto del tuo <strong>Liquid Net Worth</strong>, calcolato come{" "}
                <code className="text-[10px] text-violet-400">
                  (LNW_oggi / LNW_primo)^(1/anni) − 1
                </code>{" "}
                dai tuoi snapshot storici (esclude immobili).
              </p>
            </div>
            {data && (
              <div
                className={`mt-1.5 rounded-md p-2 text-[10px] leading-relaxed border ${
                  data.autoAvailable
                    ? "border-emerald-500/30 bg-emerald-500/[0.05]"
                    : "border-amber-500/30 bg-amber-500/[0.05]"
                }`}
              >
                {data.autoAvailable ? (
                  <>
                    <div className="text-[var(--color-emerald-text)] font-medium">
                      ✓ {data.yearsCovered.toFixed(1)} anni di storia ({data.monthsCovered} snapshot)
                    </div>
                    <div className="text-[var(--fg-muted)] mt-0.5">
                      CAGR reale:{" "}
                      <span className="font-medium tabular-nums text-[var(--fg)]">
                        {(data.cagrRaw * 100).toFixed(1)}%/y
                      </span>
                      {data.cagrCapped && (
                        <span className="block text-[var(--color-amber-text)] mt-0.5">
                          ⚠ Per realismo il forecast usa <strong>20%</strong> (cap):
                          estrapolare un CAGR così alto su molti anni dà numeri irrealistici.
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[var(--color-amber-text)] font-medium">
                      ⚠ Storia insufficiente
                    </div>
                    <div className="text-[var(--fg-muted)] mt-0.5">
                      Hai {data.monthsCovered} mesi di snapshot. Il CAGR diventa
                      attendibile da {MIN_MONTHS_FOR_AUTO} mesi (≥2 anni). Usa
                      il tasso fisso intanto.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {(opts.rateMode === "fixed" || !data?.autoAvailable) && (
            <div className="space-y-1 pt-2 border-t border-[var(--border)]">
              <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Tasso annuo
              </label>
              <div className="flex flex-wrap gap-1">
                {[0.03, 0.05, 0.07, 0.10, 0.15].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setOpts({ fixedRate: r })}
                    className={`h-7 px-2.5 rounded border text-xs ${
                      Math.abs(opts.fixedRate - r) < 0.001
                        ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {(r * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
              {/* Descrizione contestuale del tasso scelto */}
              {(() => {
                const key = opts.fixedRate.toFixed(2);
                const info = RATE_INFO[key];
                if (!info) return null;
                return (
                  <div className="mt-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 p-2 text-[10px] leading-relaxed">
                    <div className="font-medium text-violet-400">
                      {(opts.fixedRate * 100).toFixed(0)}% · {info.label}
                    </div>
                    <div className="text-[var(--fg-muted)] mt-0.5">{info.desc}</div>
                  </div>
                );
              })()}
            </div>
          )}
          <div className="space-y-1 pt-2 border-t border-[var(--border)]">
            <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
              Orizzonte
            </label>
            <div className="flex gap-1">
              {([5, 10, 15, 20] as const).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setOpts({ horizonYears: y })}
                  className={`flex-1 h-7 px-2.5 rounded border text-xs ${
                    opts.horizonYears === y
                      ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {y}y
                </button>
              ))}
            </div>
          </div>
        </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Servono snapshot di Liquid Net Worth per stimare la curva.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                  Tasso applicato
                </div>
                <div className="font-medium tabular-nums text-violet-300">
                  {(data.r * 100).toFixed(1)}% / anno
                </div>
              </div>
              {data.cagrCapped && opts.rateMode === "auto" && (
                <div className="text-[10px] text-amber-400 max-w-[55%] text-right leading-tight">
                  <div>
                    CAGR reale{" "}
                    <span className="tabular-nums font-medium">
                      {(data.cagrRaw * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>capped a 20% per realismo</div>
                </div>
              )}
            </div>

            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.curve} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient key="futureYouGrad" id="futureYouGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop key="0" offset="0%" stopColor="rgb(139 92 246)" stopOpacity={0.55} />
                      <stop key="100" offset="100%" stopColor="rgb(139 92 246)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 9, fill: "var(--fg-subtle)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `+${v}y`}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v: number) => formatEUR(v, { compact: true })}
                    labelFormatter={(y) => `Tra ${y} anni`}
                    labelStyle={{ color: "var(--fg-muted)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="nw"
                    stroke="rgb(139 92 246)"
                    strokeWidth={2}
                    fill="url(#futureYouGrad)"
                  />
                  {data.spotlights.map((y) => {
                    const point = data.curve[y];
                    if (!point) return null;
                    return (
                      <ReferenceDot
                        key={y}
                        x={y}
                        y={point.nw}
                        r={3}
                        fill="rgb(139 92 246)"
                        stroke="var(--bg)"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div
              className={cn(
                "grid gap-2 text-[11px]",
                data.spotlights.length === 1
                  ? "grid-cols-1"
                  : data.spotlights.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3",
              )}
            >
              {data.spotlights.map((y) => {
                const value = data.curve[y]?.nw ?? 0;
                const multiplier = data.now > 0 ? value / data.now : 0;
                return (
                  <div
                    key={y}
                    className="surface-2 rounded p-2.5 border border-[var(--border)]"
                  >
                    <div className="text-[10px] uppercase tracking-widest text-violet-400">
                      tra {y} anni
                    </div>
                    <div className="text-lg font-semibold tabular-nums mt-0.5">
                      {formatEUR(value, { compact: true })}
                    </div>
                    <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                      ×{multiplier.toFixed(1)} di oggi
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
