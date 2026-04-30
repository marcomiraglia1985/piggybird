"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, TrendingUp, TrendingDown } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";

type EstateRow = {
  id: string;
  name: string;
  emoji: string;
  /** Valore stimato attuale (con fallback purchasePrice già applicato in page.tsx) */
  currentValue: number;
  /** True se currentValue è un fallback dal purchasePrice. */
  isFallback: boolean;
  purchasePrice: number;
  purchaseDateIso: string;
  ownershipShare: number;
};

type Props = {
  estates: EstateRow[];
};

function yearsBetween(fromIso: string, to: Date) {
  const from = new Date(fromIso);
  const ms = to.getTime() - from.getTime();
  return ms / (365.25 * 86_400_000);
}

function computeRoi(row: EstateRow) {
  const now = new Date();
  // Applichiamo ownershipShare a entrambi (purchase + current) per coerenza:
  // il rendimento % è invariante alla quota, ma in valore assoluto vediamo
  // SOLO la quota dell'utente.
  const cost = row.purchasePrice * row.ownershipShare;
  const value = row.currentValue * row.ownershipShare;
  const gainAbs = value - cost;
  const gainPct = cost > 0 ? (value - cost) / cost : 0;
  const years = yearsBetween(row.purchaseDateIso, now);
  // CAGR = (1 + total return)^(1/years) − 1, definito solo se years > 0 e cost > 0
  const cagr =
    cost > 0 && years > 0 ? Math.pow(value / cost, 1 / years) - 1 : 0;
  return { cost, value, gainAbs, gainPct, years, cagr };
}

export function EstateRoiWidget({ estates }: Props) {
  const rows = useMemo(() => {
    return estates
      .map((e) => ({ row: e, roi: computeRoi(e) }))
      .sort((a, b) => b.roi.gainAbs - a.roi.gainAbs);
  }, [estates]);

  const aggregate = useMemo(() => {
    let cost = 0;
    let value = 0;
    for (const { roi } of rows) {
      cost += roi.cost;
      value += roi.value;
    }
    const gainAbs = value - cost;
    const gainPct = cost > 0 ? (value - cost) / cost : 0;
    return { cost, value, gainAbs, gainPct };
  }, [rows]);

  return (
    <Card className="p-6">
      <CardHeader className="mb-6">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Building2 className="size-4 text-slate-400" />
            Estate ROI
          </span>
        </CardTitle>
        <WidgetHelpPopover title="Estate ROI">
          <p>
            <strong className="text-[var(--fg)]">
              Quanto rende il tuo patrimonio immobiliare
            </strong>{" "}
            in valore assoluto e annualizzato (CAGR), per ogni proprietà.
          </p>
          <p>
            Se non hai aggiornato di recente il valore stimato attuale, viene
            usato il prezzo di acquisto (rendimento 0%). Aggiorna i valori in{" "}
            <em>Estates</em> per una stima più realistica.
          </p>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
            💡 CAGR = tasso di crescita annuo composto. Un 5% l&apos;anno
            raddoppia il capitale in ~14 anni.
          </p>
        </WidgetHelpPopover>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Nessun immobile di proprietà attivo.
          </p>
        ) : (
          <div className="space-y-3">
            <AggregateBlock {...aggregate} />
            <div className="space-y-2">
              {rows.map(({ row, roi }) => (
                <EstateRow key={row.id} row={row} roi={roi} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AggregateBlock({
  cost,
  value,
  gainAbs,
  gainPct,
}: {
  cost: number;
  value: number;
  gainAbs: number;
  gainPct: number;
}) {
  const positive = gainAbs >= 0;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-gradient-to-br from-slate-500/[0.08] to-slate-500/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
            Totale immobili
          </div>
          <div className="text-xl font-semibold tabular-nums">
            {formatEUR(value, { compact: true })}
          </div>
          <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
            costo {formatEUR(cost, { compact: true })}
          </div>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
            positive
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20",
          )}
        >
          {positive ? (
            <TrendingUp className="size-3.5" />
          ) : (
            <TrendingDown className="size-3.5" />
          )}
          {positive ? "+" : ""}
          {formatEUR(gainAbs, { compact: true })} ({(gainPct * 100).toFixed(1)}%)
        </div>
      </div>
    </div>
  );
}

function EstateRow({
  row,
  roi,
}: {
  row: EstateRow;
  roi: ReturnType<typeof computeRoi>;
}) {
  const positive = roi.gainAbs >= 0;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{row.emoji}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{row.name}</div>
            <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
              {roi.years.toFixed(1)} anni
              {row.ownershipShare < 1 && (
                <span> · quota {Math.round(row.ownershipShare * 100)}%</span>
              )}
              {row.isFallback && (
                <span
                  className="ml-1 text-amber-400/80"
                  title="Valore non aggiornato — uso il prezzo d'acquisto come stima"
                >
                  · stima
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "text-xs font-medium tabular-nums shrink-0",
            positive ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {positive ? "+" : ""}
          {(roi.gainPct * 100).toFixed(1)}%
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <Mini label="Acquisto" value={formatEUR(roi.cost, { compact: true })} />
        <Mini label="Oggi" value={formatEUR(roi.value, { compact: true })} />
        <Mini
          label="CAGR"
          value={`${(roi.cagr * 100).toFixed(1)}%`}
          color={positive ? "emerald" : "rose"}
        />
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "emerald" | "rose";
}) {
  const tone = !color
    ? "text-[var(--fg)]"
    : color === "emerald"
    ? "text-emerald-400"
    : "text-rose-400";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[var(--fg-muted)]">{label}</span>
      <span className={`tabular-nums font-medium ${tone}`}>{value}</span>
    </div>
  );
}
