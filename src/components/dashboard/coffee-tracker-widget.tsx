"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Coffee } from "lucide-react";
import { formatEUR } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import { CategoryPicker } from "@/components/movimenti/category-picker";

type Category = {
  id: string;
  emoji: string;
  name: string;
  type: string;
  group: string;
  estateId?: string | null;
  displayOrder?: number;
};
type Estate = { id: string; name: string; emoji: string | null };

type PeriodStat = { total: number; count: number; lastDate: string | null };
type CategoryMultiStat = {
  categoryId: string;
  currentYear: PeriodStat;
  prevYear: PeriodStat;
  lifetime: PeriodStat;
};

type Props = {
  year: number;
  categories: Category[];
  estates: Estate[];
  stats: CategoryMultiStat[];
};

type Period = "currentYear" | "prevYear" | "lifetime";
type Settings = {
  categoryId: string | null;
  costPerCoffee: number | null;
  period: Period;
};
const DEFAULTS: Settings = {
  categoryId: null,
  costPerCoffee: null,
  period: "currentYear",
};

const PERIOD_LABELS: Record<Period, string> = {
  currentYear: "Anno corrente",
  prevYear: "Anno precedente",
  lifetime: "Da sempre",
};

export function CoffeeTrackerWidget({ year, categories, estates, stats }: Props) {
  const [opts, setOpts, reset] = useWidgetSettings("coffee-tracker", DEFAULTS);

  const statByCat = useMemo(() => {
    const m = new Map<string, CategoryMultiStat>();
    for (const s of stats) m.set(s.categoryId, s);
    return m;
  }, [stats]);

  const selected = useMemo(() => {
    if (!opts.categoryId) return null;
    return categories.find((c) => c.id === opts.categoryId) ?? null;
  }, [opts.categoryId, categories]);

  const data = useMemo(() => {
    if (!selected) return null;
    const stat = statByCat.get(selected.id);
    if (!stat) return { total: 0, count: 0 };
    const periodStat = stat[opts.period];
    return {
      total: Math.abs(periodStat.total),
      count: periodStat.count,
    };
  }, [selected, statByCat, opts.period]);

  const cups =
    data && opts.costPerCoffee && opts.costPerCoffee > 0
      ? Math.round(data.total / opts.costPerCoffee)
      : null;

  const periodLabelShort: Record<Period, string> = {
    currentYear: String(year),
    prevYear: String(year - 1),
    lifetime: "lifetime",
  };

  return (
    <Card className="p-6">
      <CardHeader className="mb-4">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            {selected ? (
              <span className="text-base leading-none">{selected.emoji}</span>
            ) : (
              <Coffee className="size-4 text-amber-400" />
            )}
            Coffee tracker
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <WidgetHelpPopover title="Coffee tracker">
            <p>
              <strong className="text-[var(--fg)]">
                Quanto stai davvero spendendo per le colazioni e i caffè fuori
                casa.
              </strong>
            </p>
            <p>
              Un caffè da €1.50 al giorno fa ~€550 l&apos;anno, una colazione
              al bar da €5 fa ~€1.800. Sono numeri che fanno scalpore una
              volta che li vedi sommati.
            </p>
            <p>
              Tecnicamente è un widget generico: scegli categoria + periodo
              dalle opzioni — può essere &quot;Caffè&quot;, &quot;Bar&quot;,
              &quot;Colazioni&quot;, ma anche palestra, abbonamenti, viaggi.
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Imposta il costo del singolo caffè per vedere quanti caffè hai
              bevuto. Sono inclusi solo i movimenti confermati.
            </p>
          </WidgetHelpPopover>
          <WidgetSettingsPopover title="Coffee tracker" onReset={reset}>
            <div className="space-y-2">
              <label className="block text-[var(--fg-muted)]">
                Categoria da tracciare
              </label>
              <CategoryPicker
                variant="input"
                value={opts.categoryId}
                categories={categories}
                estates={estates}
                onChange={(catId) => setOpts({ categoryId: catId })}
              />
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--border)]/50">
              <label className="block text-[var(--fg-muted)]">Periodo</label>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setOpts({ period: p })}
                    className={`h-8 rounded-lg text-[11px] font-medium transition-colors ${
                      opts.period === p
                        ? "bg-violet-500/15 border border-violet-500/40 text-violet-200"
                        : "bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--fg-muted)]"
                    }`}
                  >
                    {p === "currentYear"
                      ? year
                      : p === "prevYear"
                        ? year - 1
                        : "Sempre"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-[var(--border)]/50">
              <label className="block text-[var(--fg-muted)]">
                Costo del singolo (€)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.10"
                min="0"
                placeholder="es. 1.50"
                value={opts.costPerCoffee ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setOpts({ costPerCoffee: null });
                    return;
                  }
                  const n = Number(raw);
                  setOpts({
                    costPerCoffee: Number.isFinite(n) && n > 0 ? n : null,
                  });
                }}
                className="w-full h-9 rounded-lg px-3 text-sm bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] focus:outline-none focus:border-violet-500/50 tabular-nums"
              />
              <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
                Se imposti un costo, il widget calcola anche quante unità
                avresti pagato a quel prezzo (es. 320 caffè da €1.50).
              </p>
            </div>
          </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selected ? (
          <div className="text-center py-2 space-y-1">
            <p className="text-2xl">☕</p>
            <p className="text-xs text-[var(--fg-subtle)]">
              Scegli la tua categoria per le &quot;colazioni&quot; dalle{" "}
              <span className="text-[var(--fg-muted)]">opzioni ⚙</span>.
            </p>
          </div>
        ) : !data || data.count === 0 ? (
          <div className="text-center py-2 space-y-1">
            <p className="text-2xl">{selected.emoji}</p>
            <p className="text-xs text-[var(--fg-subtle)]">
              Nessun movimento in <strong>{selected.name}</strong> ·{" "}
              {PERIOD_LABELS[opts.period].toLowerCase()}.
            </p>
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] text-center">
              {selected.name} · {periodLabelShort[opts.period]}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center">
                <div className="text-xl font-semibold tabular-nums leading-none">
                  {formatEUR(data.total, { compact: true })}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)] mt-1.5">
                  Totale speso
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                <div className="text-xl font-semibold tabular-nums leading-none">
                  {cups != null ? cups.toLocaleString("it-IT") : "—"}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mt-1.5">
                  {cups != null ? "caffè bevuti" : "imposta costo ⚙"}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs">
              <span className="text-[var(--fg-muted)]">
                {data.count.toLocaleString("it-IT")}{" "}
                {data.count === 1 ? "movimento" : "movimenti"}
              </span>
              <span className="text-[var(--fg-muted)] tabular-nums">
                media {formatEUR(data.total / Math.max(1, data.count))}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

