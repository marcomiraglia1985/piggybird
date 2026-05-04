"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Waves } from "lucide-react";
import {
  sankey as d3sankey,
  sankeyLinkHorizontal,
  sankeyLeft,
} from "d3-sankey";
import { formatEUR, cn } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import type { SankeyData, SankeyNode } from "@/lib/queries/cashflow-sankey";

type Settings = {
  period: "currentMonth" | "currentYear" | "trailing12Months";
  includeCapex: boolean;
};
const DEFAULTS: Settings = {
  period: "currentMonth",
  // Capex (acquisti investimenti) ON di default: gli investimenti SONO dove
  // vanno i soldi. Marco può escluderli se vuole una vista "spese vere".
  includeCapex: true,
};

const PERIOD_LABEL: Record<Settings["period"], string> = {
  currentMonth: "Mese corrente",
  currentYear: "Anno corrente",
  trailing12Months: "Ultimi 12 mesi",
};

/** Palette per i macro-gruppi expense — distinti, riconoscibili.
 *  Il mapping è data-driven: hash del nome gruppo → indice palette, così
 *  funziona con qualsiasi gruppo esista (universal-app). */
const GROUP_PALETTE = [
  "#fb923c", // orange-400 (food/casa)
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
  "#60a5fa", // sky-400
  "#2dd4bf", // teal-400
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
  "#facc15", // yellow-400
  "#22d3ee", // cyan-400
  "#c084fc", // purple-400
  "#a3e635", // lime-400
  "#e879f9", // fuchsia-400
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function groupColor(groupId: string): string {
  return GROUP_PALETTE[hashString(groupId) % GROUP_PALETTE.length];
}

/** Color per nodo Sankey. Per group/category derivato dal nome del gruppo
 *  (consistente parent ↔ children); income/savings/deficit fissi. */
function nodeColor(node: { id: string; kind: SankeyNode["kind"] }): string {
  switch (node.kind) {
    case "income":
      return "#34d399"; // emerald-400
    case "savings":
      return "#a78bfa"; // violet-400
    case "deficit":
      return "#fb7185"; // rose-400
    case "group":
      // node.id = "group:<name>"
      return groupColor(node.id.replace(/^group:/, ""));
    case "category":
      // node.id = "cat:<group>:<name>" → eredita il colore del parent group
      return groupColor(node.id.split(":")[1] ?? "");
  }
}

export function CashflowSankeyWidget() {
  const [opts, setOpts, reset] = useWidgetSettings("cashflow-sankey", DEFAULTS);
  const [data, setData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  // Resize observer per width responsive (Sankey vuole pixel concreti).
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 800;
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch data quando opts cambia.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      period: opts.period,
      // Sempre detailed: 3-stadi (Entrate → Gruppi → Categorie)
      viewMode: "detailed",
      includeCapex: String(opts.includeCapex),
      // Transfer interni sempre esclusi: si annullano (uscita su un conto =
      // entrata su un altro), distorcono il flusso.
      includeTransfers: "false",
    });
    fetch(`/api/cashflow-sankey?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [opts]);

  const layout = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    // Altezza dinamica: 3-stadi può avere 30+ nodi nel terzo stadio
    const height = Math.max(420, data.nodes.length * 16);
    const sankeyGen = d3sankey<
      { id: string; label: string; emoji?: string; kind: SankeyNode["kind"]; value: number },
      { source: string; target: string; value: number }
    >()
      .nodeId((n) => n.id)
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(6)
      .extent([
        [10, 10],
        [Math.max(width - 10, 200), height - 10],
      ]);

    const nodesCopy = data.nodes.map((n) => ({ ...n }));
    const linksCopy = data.links.map((l) => ({ ...l }));
    const result = sankeyGen({ nodes: nodesCopy, links: linksCopy });
    // d3-sankey ritorna oggetti con coordinate calcolate; cast a LayoutResult
    // per consumer che usa solo i campi visivi (x0/x1/y0/y1, width).
    return { ...(result as unknown as LayoutResult), height };
  }, [data, width]);

  return (
    <div ref={containerRef}>
      <Card className="p-6">
        <CardHeader className="mb-4">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Waves className="size-4 text-sky-400" />
              Dove vanno i soldi
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <WidgetHelpPopover title="Cashflow Sankey">
              <p>
                <strong className="text-[var(--fg)]">
                  Visualizza il flusso dei tuoi soldi
                </strong>{" "}
                dalle entrate alle uscite. Più larga è la banda, più alta è la
                cifra. A colpo d&apos;occhio capisci dove si concentrano i costi.
              </p>
              <p>
                Il nodo <span style={{ color: "#a78bfa" }}>Risparmi</span> è la
                differenza Entrate − Uscite. Se diventa{" "}
                <span style={{ color: "#fb7185" }}>Deficit</span>, stai
                intaccando il patrimonio.
              </p>
              <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
                💡 Per default: niente capex (acquisti investimenti), niente
                transfer interni, niente rettifiche. Tutto attivabile dalle
                opzioni ⚙.
              </p>
            </WidgetHelpPopover>
            <WidgetSettingsPopover title="Cashflow" onReset={reset}>
              <div className="space-y-2">
                <label className="block text-[var(--fg-muted)]">Periodo</label>
                <div className="grid grid-cols-1 gap-1">
                  {(Object.keys(PERIOD_LABEL) as Settings["period"][]).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setOpts({ period: p })}
                        className={cn(
                          "h-8 rounded-lg text-[11px] font-medium text-left px-2.5 transition-colors",
                          opts.period === p
                            ? "bg-violet-500/15 border border-violet-500/40 text-violet-200"
                            : "bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--fg-muted)]",
                        )}
                      >
                        {PERIOD_LABEL[p]}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-[var(--border)]/50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opts.includeCapex}
                    onChange={(e) => setOpts({ includeCapex: e.target.checked })}
                    className="size-3.5 accent-violet-500"
                  />
                  <span>Includi acquisti investimenti (capex)</span>
                </label>
                <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
                  Default ON: gli investimenti sono dove vanno i soldi.
                  Disattiva se vuoi vedere solo le spese di consumo.
                </p>
              </div>
            </WidgetSettingsPopover>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !data ? (
            <div className="h-[420px] flex items-center justify-center text-xs text-[var(--fg-subtle)]">
              Caricamento…
            </div>
          ) : error ? (
            <div className="h-[420px] flex items-center justify-center text-xs text-rose-400">
              {error}
            </div>
          ) : !data || data.nodes.length === 0 || data.meta.txCount === 0 ? (
            <div className="h-[420px] flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-3xl">💸</p>
              <p className="text-xs text-[var(--fg-subtle)] max-w-md">
                Nessun movimento nel periodo {data?.meta.periodLabel.toLowerCase()}.
                Aggiungi tx o cambia periodo dalle opzioni ⚙.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="text-[var(--fg-subtle)]">
                  {data.meta.periodLabel} ·{" "}
                  {data.meta.txCount.toLocaleString("it-IT")} movimenti
                </span>
                <span className="tabular-nums">
                  Entrate{" "}
                  <strong className="text-emerald-400">
                    {formatEUR(data.meta.totalIncome, { compact: true })}
                  </strong>
                  {" · "}
                  Uscite{" "}
                  <strong className="text-rose-400">
                    {formatEUR(data.meta.totalExpense, { compact: true })}
                  </strong>
                  {" · "}
                  {data.meta.netSavings >= 0 ? (
                    <>
                      Risparmi{" "}
                      <strong className="text-violet-300">
                        {formatEUR(data.meta.netSavings, { compact: true })}
                      </strong>
                    </>
                  ) : (
                    <>
                      Deficit{" "}
                      <strong className="text-rose-400">
                        {formatEUR(-data.meta.netSavings, { compact: true })}
                      </strong>
                    </>
                  )}
                </span>
              </div>
              {layout && <SankeyChart layout={layout} width={width} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type LayoutResult = {
  nodes: Array<
    SankeyNode & {
      x0: number;
      x1: number;
      y0: number;
      y1: number;
    }
  >;
  links: Array<{
    source: { id: string; x1: number; y0: number; y1: number };
    target: { id: string; x0: number; y0: number; y1: number };
    value: number;
    width: number;
    y0: number;
    y1: number;
  }>;
  height: number;
};

function SankeyChart({
  layout,
  width,
}: {
  layout: LayoutResult;
  width: number;
}) {
  const linkPath = sankeyLinkHorizontal();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <svg
      width={width}
      height={layout.height}
      className="overflow-visible"
    >
      {/* Links */}
      <g>
        {layout.links.map((link, i) => {
          const sourceNode = layout.nodes.find((n) => n.id === link.source.id);
          const sourceColor = nodeColor({
            id: sourceNode?.id ?? "",
            kind: (sourceNode?.kind ?? "group") as SankeyNode["kind"],
          });
          const isHovered =
            hoveredId === link.source.id || hoveredId === link.target.id;
          return (
            <g key={i}>
              <title>{`${link.source.id} → ${link.target.id}: ${formatEUR(link.value)}`}</title>
              <path
                // @ts-expect-error sankey link type
                d={linkPath(link)}
                fill="none"
                stroke={sourceColor}
                strokeOpacity={isHovered ? 0.55 : hoveredId ? 0.1 : 0.28}
                strokeWidth={Math.max(1, link.width)}
                style={{ transition: "stroke-opacity 150ms" }}
              />
            </g>
          );
        })}
      </g>
      {/* Nodes */}
      <g>
        {layout.nodes.map((node) => {
          const color = nodeColor(node);
          const isHovered = hoveredId === node.id;
          const labelOnRight = node.x0 < width / 2;
          return (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: "pointer" }}
            >
              <title>
                {node.label} · {formatEUR(node.value)}
              </title>
              <rect
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={Math.max(1, node.y1 - node.y0)}
                fill={color}
                opacity={isHovered ? 1 : 0.85}
                rx={2}
              />
              <text
                x={labelOnRight ? node.x1 + 6 : node.x0 - 6}
                y={(node.y0 + node.y1) / 2}
                dy="0.35em"
                textAnchor={labelOnRight ? "start" : "end"}
                fontSize={11}
                fill="var(--fg)"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  pointerEvents: "none",
                }}
              >
                {node.emoji ? `${node.emoji} ` : ""}
                {node.label}
                <tspan fill="var(--fg-subtle)" fontSize={10}>
                  {" "}
                  {formatEUR(node.value, { compact: true })}
                </tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
