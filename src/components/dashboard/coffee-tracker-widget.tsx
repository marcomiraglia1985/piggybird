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

type CategoryStat = {
  categoryId: string;
  total: number;
  count: number;
  lastDate: string | null;
};

type Props = {
  year: number;
  categories: Category[];
  estates: Estate[];
  stats: CategoryStat[];
};

type Settings = { categoryId: string | null };
const DEFAULTS: Settings = { categoryId: null };

function formatShortDate(iso: string) {
  const d = new Date(iso);
  const labels = [
    "gen",
    "feb",
    "mar",
    "apr",
    "mag",
    "giu",
    "lug",
    "ago",
    "set",
    "ott",
    "nov",
    "dic",
  ];
  return `${d.getUTCDate()} ${labels[d.getUTCMonth()]}`;
}

export function CoffeeTrackerWidget({ year, categories, estates, stats }: Props) {
  const [opts, setOpts, reset] = useWidgetSettings("coffee-tracker", DEFAULTS);

  const statByCat = useMemo(() => {
    const m = new Map<string, CategoryStat>();
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
    if (!stat || stat.count === 0) {
      return { count: 0, total: 0, average: 0, lastDate: null as string | null };
    }
    return {
      count: stat.count,
      total: Math.abs(stat.total),
      average: Math.abs(stat.total) / stat.count,
      lastDate: stat.lastDate,
    };
  }, [selected, statByCat]);

  return (
    <Card className="p-6 h-[420px] flex flex-col">
      <CardHeader className="mb-6 shrink-0">
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
                casa nell&apos;anno corrente.
              </strong>
            </p>
            <p>
              Un caffè da €1.50 al giorno fa ~€550 l&apos;anno, una colazione
              al bar da €5 fa ~€1.800. Sono numeri che fanno scalpore una volta
              che li vedi sommati.
            </p>
            <p>
              Tecnicamente è un widget generico: scegli la categoria dalle
              opzioni — può essere &quot;Colazioni&quot;, &quot;Bar&quot;,
              &quot;Caffè&quot;, ma anche palestra, abbonamenti, viaggi.
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Sono inclusi solo i movimenti già confermati. Un widget un po&apos;
              divertente, ma che può far risparmiare parecchio.
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
          </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 flex-1 flex flex-col min-h-0">
        {!selected ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-3xl">☕</p>
            <p className="text-xs text-[var(--fg-subtle)]">
              Scegli la tua categoria per le &quot;colazioni&quot; dalle{" "}
              <span className="text-[var(--fg-muted)]">opzioni ⚙</span>.
            </p>
          </div>
        ) : !data || data.count === 0 ? (
          <div className="text-center py-6 space-y-1">
            <p className="text-3xl">{selected.emoji}</p>
            <p className="text-xs text-[var(--fg-subtle)]">
              Nessun movimento in <strong>{selected.name}</strong> nel {year}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 justify-between min-h-0">
            <div className="text-center space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
                {selected.name} {year}
              </div>
              <div className="text-5xl font-semibold tabular-nums">
                {formatEUR(data.total, { compact: true })}
              </div>
              <div className="text-[11px] text-[var(--fg-subtle)] tabular-nums">
                {data.count}{" "}
                {data.count === 1 ? "movimento" : "movimenti"}
                {data.lastDate && (
                  <> · ultimo {formatShortDate(data.lastDate)}</>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--border)]">
              <Stat
                label="Media per volta"
                value={formatEUR(data.average)}
              />
              <Stat
                label="Frequenza"
                value={frequencyLabel(data.count)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function frequencyLabel(count: number) {
  if (count >= 200) return "quasi giornaliera";
  if (count >= 100) return "~bisettimanale";
  if (count >= 40) return "~settimanale";
  if (count >= 20) return "~bimensile";
  if (count >= 10) return "~mensile";
  if (count >= 4) return "trimestrale";
  return "occasionale";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
        {label}
      </span>
      <span className="text-base font-medium tabular-nums">{value}</span>
    </div>
  );
}
