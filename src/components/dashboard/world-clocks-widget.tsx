"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import {
  ALL_EXCHANGES,
  DEFAULT_FAVORITE_EXCHANGES,
  getLocalTime,
  isMarketOpen,
  isWeekend,
  type Exchange,
} from "@/lib/exchanges";

/**
 * Settings condivise con il widget Live Markets World Map: stessa key
 * "market-favorites" → modificare in un widget aggiorna anche l'altro.
 */
type Settings = { exchanges: string[] };
const DEFAULTS: Settings = { exchanges: DEFAULT_FAVORITE_EXCHANGES };

export function WorldClocksWidget() {
  const [opts, setOpts, reset] = useWidgetSettings("market-favorites", DEFAULTS);
  const [now, setNow] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Limite orologi visibili in base alla larghezza:
  //   width < 500px (1 col) → max 4 orologi
  //   width < 900px (2 col) → max 8 orologi
  //   altrimenti (non dovrebbe accadere — maxSpan=2): tutti
  const [maxClocks, setMaxClocks] = useState(8);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w === 0) return;
      if (w < 500) setMaxClocks(4);
      else if (w < 900) setMaxClocks(8);
      else setMaxClocks(99); // wide: nessun limite (in pratica non avviene perché maxSpan=2)
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () =>
      ALL_EXCHANGES.filter((ex) => opts.exchanges.includes(ex.id)).slice(0, maxClocks),
    [opts.exchanges, maxClocks],
  );
  const hiddenCount = Math.max(
    0,
    ALL_EXCHANGES.filter((ex) => opts.exchanges.includes(ex.id)).length - visible.length,
  );

  const clocks = useMemo(() => {
    if (!now) return null;
    return visible.map((ex) => {
      const t = getLocalTime(ex.timezone, now);
      return {
        ex,
        time: t,
        open: isMarketOpen(now, ex),
        weekend: isWeekend(t.weekday),
      };
    });
  }, [now, visible]);

  const openCount = clocks?.filter((c) => c.open).length ?? 0;

  function toggleExchange(id: string) {
    const next = opts.exchanges.includes(id)
      ? opts.exchanges.filter((x) => x !== id)
      : [...opts.exchanges, id];
    setOpts({ exchanges: next });
  }

  return (
    <div ref={containerRef}>
    <Card className="p-6 @container">
      <CardHeader className="mb-4">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Globe2 className="size-4 text-sky-400" />
            Borse mondiali
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <WidgetHelpPopover title="Borse mondiali">
            <p>
              <strong className="text-[var(--fg)]">
                Stato live delle principali borse mondiali
              </strong>{" "}
              con orologio analogico in ora locale di ciascun exchange. Pallino{" "}
              <span className="text-emerald-400">verde</span> = mercato aperto.
            </p>
            <p>
              Dalle <em>opzioni ⚙</em> scegli quali borse seguire — la lista è
              condivisa con il widget <em>Live Markets World Map</em>.
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Pause pranzo (Tokyo/HKEX/SSE) gestite via sessions multiple.
              Festività locali non tracciate.
            </p>
          </WidgetHelpPopover>
          <WidgetSettingsPopover title="Borse da seguire" onReset={reset}>
            <ExchangeFavoritesSelector
              selected={opts.exchanges}
              onToggle={toggleExchange}
            />
          </WidgetSettingsPopover>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-6 text-center">
            Nessuna borsa selezionata. Scegli i tuoi preferiti dalle{" "}
            <span className="text-[var(--fg-muted)]">opzioni ⚙</span>.
          </p>
        ) : !clocks ? (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-4 py-2">
            {visible.map((ex) => (
              <div
                key={ex.id}
                className="flex flex-col items-center gap-1.5 opacity-50 w-[110px] @[480px]:w-[140px] @[900px]:w-[180px]"
              >
                <ClockFace hour={0} minute={0} open={false} />
                <span className="text-[10px] font-medium tabular-nums">
                  {ex.flag} {ex.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)] tabular-nums mb-3">
              {openCount > 0
                ? `${openCount} ${openCount === 1 ? "borsa aperta" : "borse aperte"} ora`
                : "Tutte le borse sono chiuse"}
            </p>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-4">
              {clocks.map(({ ex, time, open, weekend }) => (
                <div
                  key={ex.id}
                  className="flex flex-col items-center gap-1.5 w-[110px] @[480px]:w-[140px] @[900px]:w-[180px]"
                  title={
                    weekend
                      ? `${ex.city} · weekend, mercati chiusi`
                      : open
                        ? `${ex.city} · aperto`
                        : `${ex.city} · chiuso`
                  }
                >
                  <ClockFace
                    hour={time.hour}
                    minute={time.minute}
                    open={open}
                  />
                  <div className="text-center leading-tight">
                    <div className="text-[10px] font-medium">
                      {ex.flag} {ex.label}
                    </div>
                    <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                      {String(time.hour).padStart(2, "0")}:
                      {String(time.minute).padStart(2, "0")}
                    </div>
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] font-medium",
                        open ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          open ? "bg-emerald-400" : "bg-rose-500",
                        )}
                      />
                      {open ? "Aperto" : weekend ? "Weekend" : "Chiuso"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {hiddenCount > 0 && (
          <p className="text-[10px] text-[var(--fg-subtle)] text-center pt-3 border-t border-[var(--border)]/50 mt-3">
            +{hiddenCount} {hiddenCount === 1 ? "borsa nascosta" : "borse nascoste"} —
            allarga il widget per vederle tutte.
          </p>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

export function ExchangeFavoritesSelector({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[var(--fg-muted)]">Borse da seguire</p>
      <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
        {ALL_EXCHANGES.map((ex) => (
          <label
            key={ex.id}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selected.includes(ex.id)}
              onChange={() => onToggle(ex.id)}
              className="size-3.5 accent-violet-500"
            />
            <span className="flex-1">
              {ex.flag} <strong>{ex.label}</strong>{" "}
              <span className="text-[var(--fg-subtle)]">{ex.city}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]/50">
        Scelta condivisa con &quot;Live Markets World Map&quot;.
      </p>
    </div>
  );
}

function ClockFace({
  hour,
  minute,
  open,
}: {
  hour: number;
  minute: number;
  open: boolean;
}) {
  const minuteAngle = minute * 6 - 90;
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90;
  const minuteRad = (minuteAngle * Math.PI) / 180;
  const hourRad = (hourAngle * Math.PI) / 180;
  const minuteX = 50 + 30 * Math.cos(minuteRad);
  const minuteY = 50 + 30 * Math.sin(minuteRad);
  const hourX = 50 + 20 * Math.cos(hourRad);
  const hourY = 50 + 20 * Math.sin(hourRad);
  const faceColor = open ? "rgba(16,185,129,0.06)" : "var(--surface-2)";
  const strokeColor = open ? "#34d399" : "var(--fg-subtle)";
  const handColor = open ? "#34d399" : "var(--fg)";
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-[68px] @[480px]:size-[100px] @[900px]:size-[136px] shrink-0"
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill={faceColor}
        stroke={strokeColor}
        strokeWidth="2"
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 - 90) * (Math.PI / 180);
        const x = 50 + 40 * Math.cos(a);
        const y = 50 + 40 * Math.sin(a);
        const isCardinal = i % 3 === 0;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isCardinal ? 1.8 : 0.9}
            fill={strokeColor}
          />
        );
      })}
      <line
        x1="50"
        y1="50"
        x2={hourX}
        y2={hourY}
        stroke={handColor}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="50"
        y1="50"
        x2={minuteX}
        y2={minuteY}
        stroke={handColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="2" fill={handColor} />
    </svg>
  );
}

// Re-export per usare il tipo Exchange dove serve
export type { Exchange };
