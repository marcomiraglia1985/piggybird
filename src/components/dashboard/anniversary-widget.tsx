"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Cake } from "lucide-react";
import { formatEUR } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";

type Props = {
  firstDate: string | null;
  income: number;
  expense: number; // valore negativo
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

export function AnniversaryWidget({ firstDate, income, expense, txCount }: Props) {
  const data = useMemo(() => {
    if (!firstDate) return null;
    const { years, months, days } = formatDuration(firstDate);
    return {
      years,
      months,
      days,
      saved: income + expense, // expense è già negativo
      grossThroughput: income + Math.abs(expense),
    };
  }, [firstDate, income, expense]);

  return (
    <Card className="p-6 h-[420px] flex flex-col">
      <CardHeader className="mb-6 shrink-0">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Cake className="size-4 text-pink-400" />
            Anniversary
          </span>
        </CardTitle>
        <WidgetHelpPopover title="Anniversary">
          <p>
            <strong className="text-[var(--fg)]">Quanto a lungo stai
            trackando le tue finanze</strong>, dal primo movimento confermato
            in DB ad oggi.
          </p>
          <p>
            Le statistiche aggregate mostrano l&apos;ammontare totale di
            entrate e uscite — utili per avere il colpo d&apos;occhio sul
            volume di soldi che è passato dai tuoi conti negli anni.
          </p>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
            💡 Mostra solo i movimenti confermati e non-transfer interni.
          </p>
        </WidgetHelpPopover>
      </CardHeader>
      <CardContent className="space-y-0 flex-1 flex flex-col min-h-0">
        {!data || !firstDate ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Nessun movimento tracciato.
          </p>
        ) : (
          <div className="flex flex-col flex-1 justify-between min-h-0">
            <div className="text-center space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
                Stai trackando da
              </div>
              <div className="flex items-baseline justify-center gap-2 tabular-nums">
                <Big n={data.years} label={data.years === 1 ? "anno" : "anni"} />
                <Big n={data.months} label={data.months === 1 ? "mese" : "mesi"} />
                <Big n={data.days} label={data.days === 1 ? "giorno" : "giorni"} small />
              </div>
              <div className="text-[11px] text-[var(--fg-subtle)] pt-1">
                Dal {formatStartMonth(firstDate)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--border)]">
              <Stat
                label="Entrate"
                value={formatEUR(income, { compact: true })}
                color="emerald"
              />
              <Stat
                label="Uscite"
                value={formatEUR(expense, { compact: true })}
                color="rose"
              />
              <Stat
                label="Saldo netto"
                value={`${data.saved >= 0 ? "+" : ""}${formatEUR(data.saved, { compact: true })}`}
                color={data.saved >= 0 ? "emerald" : "rose"}
              />
              <Stat
                label="Movimenti"
                value={txCount.toLocaleString("it-IT")}
                color="violet"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Big({ n, label, small }: { n: number; label: string; small?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={small ? "text-2xl font-semibold" : "text-4xl font-semibold"}>
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
  color,
}: {
  label: string;
  value: string;
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
      <span className={`text-base font-medium tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}
