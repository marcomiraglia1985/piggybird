import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendingUp, AlertCircle } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import type { LiveAnomaly } from "@/lib/insights/anomalies-live";

/**
 * Widget Live Anomalies — alert real-time su categorie con spesa anomala
 * rispetto al comportamento storico dell'utente. Server component, niente
 * AI, niente budget: pura statistica (z-score vs 12 mesi precedenti).
 *
 * Si aggiorna ad ogni page render (no cache long).
 */
export function LiveAnomaliesWidget({ anomalies }: { anomalies: LiveAnomaly[] }) {
  return (
    <Card className="p-6">
      <CardHeader className="mb-5">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <TrendingUp className="size-4 text-amber-400" />
            Anomalie del mese
          </span>
        </CardTitle>
        <WidgetHelpPopover title="Anomalie del mese">
          <p>
            Categorie di spesa che si discostano dal tuo comportamento storico
            degli ultimi 12 mesi. Niente budget pre-impostato: il confronto è
            statistico (z-score sulla spesa giornaliera).
          </p>
          <p className="mt-2">
            Mostriamo solo anomalie significative (z-score &gt; 1.5), ordinate
            per impatto. Si aggiornano ad ogni caricamento della dashboard.
          </p>
        </WidgetHelpPopover>
      </CardHeader>
      <CardContent>
        {anomalies.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-4 text-center">
            Nessuna anomalia rilevata. Ritmo di spesa nella media degli ultimi
            12 mesi.
          </p>
        ) : (
          <div className="space-y-2.5">
            {anomalies.map((a) => (
              <AnomalyRow key={a.categoryId} a={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnomalyRow({ a }: { a: LiveAnomaly }) {
  const intensity = a.zScore >= 3 ? "high" : a.zScore >= 2 ? "med" : "low";
  const colorRing =
    intensity === "high"
      ? "border-rose-500/40 bg-rose-500/[0.06]"
      : intensity === "med"
        ? "border-amber-500/40 bg-amber-500/[0.06]"
        : "border-amber-500/25 bg-amber-500/[0.03]";
  const colorText =
    intensity === "high"
      ? "text-rose-400"
      : "text-amber-400";

  return (
    <div className={cn("rounded-lg border p-3", colorRing)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium inline-flex items-center gap-1.5">
            <span className="text-base">{a.categoryEmoji}</span>
            <span className="truncate">{a.categoryName}</span>
          </div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-0.5 tabular-nums">
            {formatEUR(a.currentMonthEur)} questo mese
            <span className="opacity-60"> · proiezione </span>
            {formatEUR(a.projectedMonthEur)}
            <span className="opacity-60"> · media </span>
            {formatEUR(a.avgMonthlyEur)}
          </div>
          {a.topContributor && (
            <div className="text-[11px] text-[var(--fg-subtle)] mt-1 truncate">
              <AlertCircle className="size-3 inline-block opacity-60 mr-1 -mt-0.5" />
              {a.topContributor.beneficiary} · {formatEUR(a.topContributor.amountEur)} il{" "}
              {a.topContributor.date.slice(8, 10)}/{a.topContributor.date.slice(5, 7)}
            </div>
          )}
        </div>
        <div className={cn("text-right shrink-0", colorText)}>
          <div className="text-sm font-semibold tabular-nums">
            +{a.pctVsAvg}%
          </div>
          <div className="text-[10px] opacity-70 tabular-nums">
            z={a.zScore.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
}
