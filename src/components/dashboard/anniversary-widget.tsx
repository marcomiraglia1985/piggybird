"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Cake } from "lucide-react";
import { formatEUR } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";

type Props = {
  firstDate: string | null;
  startNetWorth: number | null;
  currentNetWorth: number | null;
  txCount: number;
};

function formatDuration(fromIso: string) {
  const from = new Date(fromIso);
  const now = new Date();
  let years = now.getUTCFullYear() - from.getUTCFullYear();
  let months = now.getUTCMonth() - from.getUTCMonth();
  let days = now.getUTCDate() - from.getUTCDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    days += prevMonth.getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function formatStartMonth(iso: string) {
  const d = new Date(iso);
  const labels = [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
  ];
  return `${labels[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function AnniversaryWidget({
  firstDate,
  startNetWorth,
  currentNetWorth,
  txCount,
}: Props) {
  const data = useMemo(() => {
    if (!firstDate) return null;
    const { years, months, days } = formatDuration(firstDate);
    const hasNw = startNetWorth != null && currentNetWorth != null;
    const delta = hasNw ? currentNetWorth! - startNetWorth! : null;
    // Crescita relativa: definita solo se NW iniziale è significativamente
    // diverso da 0 (evita divisione esplosiva con startNW ≈ 0).
    const pct =
      hasNw && Math.abs(startNetWorth!) > 100
        ? (delta! / Math.abs(startNetWorth!)) * 100
        : null;
    return { years, months, days, delta, pct };
  }, [firstDate, startNetWorth, currentNetWorth]);

  return (
    <Card className="p-6">
      <CardHeader className="mb-4">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Cake className="size-4 text-pink-400" />
            Anniversary
          </span>
        </CardTitle>
        <WidgetHelpPopover title="Anniversary">
          <p>
            <strong className="text-[var(--fg)]">Quanto a lungo stai
            trackando le tue finanze.</strong> Si parte dalla data più antica
            tra primo movimento e primo snapshot Net Worth — coerente con il
            grafico Net Worth.
          </p>
          <p>
            Δ Net Worth mostra di quanto è cresciuto (o calato) il patrimonio
            dal primo snapshot ad oggi. È un numero robusto: include capex
            (investimenti, immobili) e applica le quote dei conti cointestati.
          </p>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
            💡 Movimenti = transazioni confermate non-transfer. Δ% calcolato
            solo se il NW iniziale è ≠ 0.
          </p>
        </WidgetHelpPopover>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data || !firstDate ? (
          <p className="text-xs text-[var(--fg-subtle)] py-2 text-center">
            Nessun movimento tracciato.
          </p>
        ) : (
          <>
            <div className="text-center space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
                Stai trackando da
              </div>
              <div className="flex items-baseline justify-center gap-2 tabular-nums">
                <Big n={data.years} label={data.years === 1 ? "anno" : "anni"} />
                <Big n={data.months} label={data.months === 1 ? "mese" : "mesi"} />
                <Big n={data.days} label={data.days === 1 ? "giorno" : "giorni"} small />
              </div>
              <div className="text-[11px] text-[var(--fg-subtle)]">
                Dal {formatStartMonth(firstDate)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)]">
              <Stat
                label="NW iniziale"
                value={
                  startNetWorth != null
                    ? formatEUR(startNetWorth, { compact: true })
                    : "—"
                }
                color="violet"
              />
              <Stat
                label="NW attuale"
                value={
                  currentNetWorth != null
                    ? formatEUR(currentNetWorth, { compact: true })
                    : "—"
                }
                color="violet"
              />
              <Stat
                label="Δ Net Worth"
                value={
                  data.delta != null
                    ? `${data.delta >= 0 ? "+" : ""}${formatEUR(data.delta, { compact: true })}`
                    : "—"
                }
                hint={
                  data.pct != null
                    ? `${data.pct >= 0 ? "+" : ""}${data.pct.toFixed(1)}%`
                    : undefined
                }
                color={
                  data.delta == null
                    ? "violet"
                    : data.delta >= 0
                      ? "emerald"
                      : "rose"
                }
              />
              <Stat
                label="Movimenti"
                value={txCount.toLocaleString("it-IT")}
                color="violet"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Big({ n, label, small }: { n: number; label: string; small?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={small ? "text-xl font-semibold" : "text-3xl font-semibold"}>
        {n}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
        {label}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color: "emerald" | "rose" | "violet";
}) {
  const tone = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    violet: "text-violet-300",
  }[color];
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
        {label}
      </span>
      <span className={`text-base font-medium tabular-nums ${tone}`}>
        {value}
        {hint && (
          <span className="text-[10px] text-[var(--fg-subtle)] ml-1.5 font-normal">
            ({hint})
          </span>
        )}
      </span>
    </div>
  );
}
