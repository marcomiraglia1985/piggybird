"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";

type NWPoint = { month: string; total: number; isFuture: boolean };

type Tier = {
  amount: number;
  emoji: string;
  label: string;
};

type Row = {
  /** Soglia di NW da cui questa riga diventa "sbloccata" (visibile completa). */
  unlockAt: number;
  /** Tier nella riga. Una riga finale "endgame" ha un solo tier full-width. */
  tiers: Tier[];
  endgame?: boolean;
};

/**
 * Roadmap a righe progressive.
 * - Riga sempre visibile: 1K/5K/10K (con tutti i tier visibili anche se 0)
 * - Le righe successive sono "lockate" finché non superi la soglia precedente:
 *   sotto la soglia di unlock vedi un placeholder "????"
 * - Quando la riga precedente è completata, la nuova riga si "sblocca"
 *   e diventa cliccabile/leggibile.
 */
const ROWS: Row[] = [
  {
    unlockAt: 0,
    tiers: [
      { amount: 1_000, emoji: "🌱", label: "Seedling" },
      { amount: 5_000, emoji: "🌿", label: "Sprout" },
      { amount: 10_000, emoji: "🌳", label: "Sapling" },
    ],
  },
  {
    unlockAt: 10_000,
    tiers: [
      { amount: 25_000, emoji: "🥉", label: "Bronze" },
      { amount: 50_000, emoji: "🥈", label: "Silver" },
      { amount: 100_000, emoji: "🥇", label: "Gold" },
    ],
  },
  {
    unlockAt: 100_000,
    tiers: [
      { amount: 250_000, emoji: "🏆", label: "Trophy" },
      { amount: 500_000, emoji: "💎", label: "Diamond" },
      { amount: 1_000_000, emoji: "👑", label: "Crown" },
    ],
  },
  {
    unlockAt: 1_000_000,
    tiers: [
      { amount: 2_000_000, emoji: "🚀", label: "Rocket" },
      { amount: 5_000_000, emoji: "✨", label: "Stardust" },
      { amount: 10_000_000, emoji: "🪐", label: "Cosmos" },
    ],
  },
  {
    unlockAt: 10_000_000,
    endgame: true,
    tiers: [
      {
        amount: Number.POSITIVE_INFINITY,
        emoji: "🐉",
        label: "Endgame",
      },
    ],
  },
];

const ALL_TIERS: Tier[] = ROWS.flatMap((r) => r.tiers).filter(
  (t) => Number.isFinite(t.amount),
);

type Settings = { showOnChart: boolean };
const DEFAULTS: Settings = { showOnChart: false };

export function MilestonesWidget({ history }: { history: NWPoint[] }) {
  const [opts, setOpts, reset] = useWidgetSettings("milestones", DEFAULTS);
  const data = useMemo(() => {
    const real = history.filter((p) => !p.isFuture);
    if (real.length === 0) return null;
    const last = real[real.length - 1];
    // NW massimo MAI raggiunto: una milestone una volta sbloccata resta tale.
    // La barra di progresso usa `last`, ma lo stato "reached" usa il max storico.
    const maxNW = real.reduce((m, p) => (p.total > m ? p.total : m), real[0].total);

    // Per ogni tier finito, primo mese in cui NW lo ha superato (per badge data)
    const unlockedAt = new Map<number, string>();
    for (const t of ALL_TIERS) {
      const point = real.find((p) => p.total >= t.amount);
      if (point) unlockedAt.set(t.amount, point.month);
    }

    // Prossimo tier = primo tier MAI raggiunto (anche se NW ora è sotto)
    const nextTier = ALL_TIERS.find((t) => !unlockedAt.has(t.amount));
    // Progresso assoluto NW/target: se l'utente ha raggiunto e poi è tornato
    // sotto, vediamo comunque la sua posizione attuale verso il target,
    // partendo da 0 (non dal tier precedente).
    const pctToNext = nextTier
      ? Math.max(0, Math.min(100, (last.total / nextTier.amount) * 100))
      : 100;

    // ETA basato su CAGR storico
    let etaMonths: number | null = null;
    // ETA solo se il CAGR è considerato attendibile: ≥ 24 mesi di storico
    // (stessa soglia di Future you, evita estrapolazioni rumorose).
    const MIN_MONTHS_FOR_CAGR = 24;
    const monthsCovered = Math.max(0, real.length - 1);
    let cagrUsed: number | null = null;
    let cagrRaw: number | null = null;
    let cagrCapped = false;
    if (nextTier && monthsCovered >= MIN_MONTHS_FOR_CAGR) {
      const start = real[0];
      const years = monthsCovered / 12;
      const ratio = start.total > 0 ? last.total / start.total : 0;
      const raw = ratio > 0 && years > 0 ? Math.pow(ratio, 1 / years) - 1 : 0;
      cagrRaw = raw;
      let cagr = raw;
      if (cagr > 0.2) {
        cagr = 0.2;
        cagrCapped = true;
      }
      cagrUsed = cagr;
      if (cagr > 0 && last.total < nextTier.amount) {
        etaMonths = (Math.log(nextTier.amount / last.total) / Math.log(1 + cagr)) * 12;
      }
    }

    return {
      last: last.total,
      maxNW,
      nextTier,
      pctToNext,
      etaMonths,
      cagrUsed,
      cagrRaw,
      cagrCapped,
      unlockedAt,
    };
  }, [history]);

  function formatMonth(iso: string) {
    const d = new Date(iso);
    const labels = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
    return `${labels[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span
            className="inline-flex items-center gap-2"
            title="Soglie sul Liquid Net Worth (esclude immobili)"
          >
            <Trophy className="size-4 text-amber-400" />
            Milestones LNW
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
        <WidgetHelpPopover title="Milestones LNW">
          <p>
            <strong className="text-[var(--fg)]">
              Una roadmap progressiva del tuo LNW.
            </strong>
          </p>
          <p>
            La prima riga è sempre visibile. Le successive si sbloccano
            quando superi il tier più alto della precedente. Quando raggiungi
            un tier resta sbloccato per sempre, anche se il tuo Liquid Net
            Worth poi scende.
          </p>
          <p>
            La barra in cima mostra quanto manca al prossimo tier non ancora
            raggiunto, con una stima ETA basata sul tuo CAGR storico, se
            disponibile.
          </p>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
            💡 Usalo per fissare obiettivi tangibili. Non dimenticarti di
            goderti il viaggio!
          </p>
        </WidgetHelpPopover>
        <WidgetSettingsPopover title="Milestones LNW" onReset={reset}>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={opts.showOnChart}
              onChange={(e) => setOpts({ showOnChart: e.target.checked })}
              className="size-3.5 accent-amber-500"
            />
            <span>
              Mostra <strong>milestones</strong> raggiunte nel grafico{" "}
              <em>Andamento LNW</em>
            </span>
          </label>
        </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Nessuno snapshot di Liquid Net Worth.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Prossimo target — solo se non siamo a fine endgame */}
            {data.nextTier && Number.isFinite(data.nextTier.amount) && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">
                      Prossimo
                    </div>
                    <div className="text-lg font-semibold tabular-nums inline-flex items-center gap-1.5">
                      <span>{data.nextTier.emoji}</span>
                      {formatEUR(data.nextTier.amount, { compact: true })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums text-violet-400">
                      {data.pctToNext.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                      mancano {formatEUR(data.nextTier.amount - data.last, { compact: true })}
                    </div>
                  </div>
                </div>
                <div className="relative h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 transition-all"
                    style={{ width: `${data.pctToNext}%` }}
                  />
                </div>
                {data.etaMonths != null && data.cagrRaw != null && (
                  <div className="text-[10px] text-[var(--fg-subtle)] text-right">
                    ETA al ritmo attuale (CAGR {(data.cagrRaw * 100).toFixed(1)}%
                    {data.cagrCapped && (
                      <span className="text-amber-400">
                        {" "}· capped a 20%
                      </span>
                    )}
                    ):{" "}
                    {data.etaMonths < 12
                      ? `${Math.round(data.etaMonths)} mesi`
                      : `${(data.etaMonths / 12).toFixed(1)} anni`}
                  </div>
                )}
              </div>
            )}

            {/* Roadmap a righe — solo le righe sbloccate sono visibili.
                Le successive restano nascoste finché non completi la corrente
                (cioè raggiungi il tier più alto della riga). */}
            <div className="space-y-2">
              {ROWS.filter((row) => data.maxNW >= row.unlockAt).map((row, idx) => {
                if (row.endgame) {
                  const tier = row.tiers[0];
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-amber-500/5 to-rose-500/10 p-3 text-center"
                    >
                      <div className="text-3xl">{tier.emoji}</div>
                      <div className="text-xs font-medium mt-0.5">{tier.label}</div>
                    </div>
                  );
                }

                return (
                  <div key={idx} className="grid grid-cols-3 gap-2">
                    {row.tiers.map((tier) => {
                      const isReached = data.unlockedAt.has(tier.amount);
                      const date = data.unlockedAt.get(tier.amount);
                      return (
                        <div
                          key={tier.amount}
                          className={cn(
                            "rounded-lg border p-2 text-center transition-colors",
                            isReached
                              ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02]"
                              : "border-[var(--border)] bg-[var(--surface-2)]/40",
                          )}
                          title={
                            isReached && date
                              ? `${tier.label} sbloccato ${formatMonth(date)}`
                              : `${tier.label} — da raggiungere`
                          }
                        >
                          <div className={cn("text-2xl", !isReached && "grayscale opacity-50")}>
                            {tier.emoji}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] tabular-nums mt-0.5",
                              isReached ? "text-amber-300" : "text-[var(--fg-subtle)]",
                            )}
                          >
                            {formatEUR(tier.amount, { compact: true })}
                          </div>
                          {isReached && date && (
                            <div className="text-[9px] text-[var(--fg-subtle)] mt-0.5">
                              {formatMonth(date)}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
