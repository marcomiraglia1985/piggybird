import { Loader2 } from "lucide-react";
import { getInvestmentsHistoryV2 } from "@/lib/investments-history";
import { InvestmentsChart } from "@/components/charts/investments-chart";

/**
 * Server component async che fetcha la history del portfolio (slow:
 * 5-10s al primo caricamento per via dei fetch live Yahoo + Binance) e
 * renderizza il chart. Wrappata in <Suspense> dalla page principale così
 * il resto del contenuto (valore totale, posizioni) appare subito.
 */
export async function InvestmentsChartAsync({
  hasStocks,
  hasCrypto,
  binanceConnected,
}: {
  hasStocks: boolean;
  hasCrypto: boolean;
  binanceConnected: boolean;
}) {
  const history = await getInvestmentsHistoryV2();
  return (
    <InvestmentsChart
      data={history}
      hasStocks={hasStocks}
      hasCrypto={hasCrypto}
      binanceConnected={binanceConnected}
    />
  );
}

/** Skeleton durante il fetch della history (Suspense fallback) */
export function InvestmentsChartSkeleton() {
  return (
    <div className="surface p-6 h-[420px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-[var(--color-fg-muted)]">
        <Loader2 className="size-7 animate-spin text-violet-400" />
        <p className="text-sm">Calcolo storico portfolio…</p>
        <p className="text-[11px] text-[var(--color-fg-subtle)]">
          Fetch prezzi storici da Yahoo + Binance — può richiedere 5-10 secondi.
        </p>
      </div>
    </div>
  );
}
