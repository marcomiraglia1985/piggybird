import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { FxStalenessReport } from "@/lib/fx-staleness";

/**
 * Alert mostrato in dashboard quando ci sono posizioni con FX rate vecchio
 * o mai impostato. Senza questo, il portfolio multi-currency può mostrare
 * valori silenziosamente sballati.
 *
 * Resa solo quando `report.staleCount > 0`.
 */
export function FxStaleAlert({ report }: { report: FxStalenessReport }) {
  if (report.staleCount === 0) return null;
  return (
    <div className="surface p-4 mb-4 border border-amber-500/40 bg-amber-500/[0.06] flex items-start gap-3">
      <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
          Cambi valuta da aggiornare ({report.staleCount}{" "}
          {report.staleCount === 1 ? "posizione" : "posizioni"})
        </p>
        <p className="text-xs text-[var(--fg-muted)] mt-1 leading-relaxed">
          Il valore in euro del tuo portfolio non è accurato finché non aggiorni
          i tassi di cambio. Posizioni interessate:{" "}
          <span className="text-[var(--fg-muted)]">
            {report.examples.join(", ")}
            {report.staleCount > report.examples.length && "…"}
          </span>
        </p>
        <Link
          href="/investimenti"
          className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 font-medium mt-2"
        >
          Vai agli investimenti per sincronizzare
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
