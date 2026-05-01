"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";
import { useWidgetSettings } from "@/lib/widget-settings";
import {
  ALL_EXCHANGES,
  DEFAULT_FAVORITE_EXCHANGES,
  isMarketOpen,
} from "@/lib/exchanges";
import { ExchangeFavoritesSelector } from "./world-clocks-widget";

const DEG = Math.PI / 180;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

function solarDeclination(date: Date): number {
  const n = dayOfYear(date);
  return 23.45 * Math.sin(((360 / 365) * (n - 81)) * DEG);
}

function subsolarLongitude(date: Date): number {
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lng = -(utcHours - 12) * 15;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
}

function computeNightPath(declDeg: number, lambdaSDeg: number): string {
  const decl = Math.abs(declDeg) < 0.5 ? Math.sign(declDeg || 1) * 0.5 : declDeg;
  const tanDecl = Math.tan(decl * DEG);
  const overshoot = 30;
  const startLng = -180 - overshoot;
  const endLng = 180 + overshoot;
  const samples = 360;
  const points: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const lng = startLng + ((endLng - startLng) * i) / samples;
    const dlng = lng - lambdaSDeg;
    const lat = Math.atan2(-Math.cos(dlng * DEG), tanDecl) * (180 / Math.PI);
    points.push([lng, -lat]);
  }
  const closeY = declDeg >= 0 ? 90 + overshoot : -90 - overshoot;
  const last = points[points.length - 1];
  const first = points[0];
  return [
    `M ${first[0]} ${first[1]}`,
    ...points.slice(1).map(([x, y]) => `L ${x} ${y}`),
    `L ${last[0]} ${closeY}`,
    `L ${first[0]} ${closeY}`,
    "Z",
  ].join(" ");
}

type Settings = { exchanges: string[] };
const DEFAULTS: Settings = { exchanges: DEFAULT_FAVORITE_EXCHANGES };

type Props = {
  landPath?: string | null;
};

export function WorldDayNightWidget({ landPath = null }: Props = {}) {
  const [opts, setOpts, reset] = useWidgetSettings("market-favorites", DEFAULTS);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visibleExchanges = useMemo(
    () => ALL_EXCHANGES.filter((ex) => opts.exchanges.includes(ex.id)),
    [opts.exchanges],
  );

  const data = useMemo(() => {
    if (!now) return null;
    const decl = solarDeclination(now);
    const lambdaS = subsolarLongitude(now);
    const nightPath = computeNightPath(decl, lambdaS);
    const sunY = -decl;
    const openCount = visibleExchanges.filter((ex) => isMarketOpen(now, ex)).length;
    return { decl, lambdaS, nightPath, sunY, openCount };
  }, [now, visibleExchanges]);

  function toggleExchange(id: string) {
    const next = opts.exchanges.includes(id)
      ? opts.exchanges.filter((x) => x !== id)
      : [...opts.exchanges, id];
    setOpts({ exchanges: next });
  }

  return (
    <Card className="p-6">
      <CardHeader className="mb-4">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Sun className="size-4 text-amber-400" />
            Live Markets World Map
          </span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <WidgetHelpPopover title="Live Markets World Map">
            <p>
              <strong className="text-[var(--fg)]">
                Mappa giorno/notte della Terra in tempo reale
              </strong>{" "}
              con marker delle borse seguite. La curva (terminator) divide la
              zona illuminata dal sole da quella in ombra. Si aggiorna ogni minuto.
            </p>
            <p>
              Pallino <span className="text-emerald-400">verde</span> = mercato
              aperto. Pulse animation sui mercati attivi.
            </p>
            <p>
              Dalle <em>opzioni ⚙</em> scegli quali borse seguire — la lista è
              condivisa con il widget <em>Borse mondiali</em>.
            </p>
            <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]">
              💡 Il sole &quot;si muove&quot; verso ovest perché la Terra ruota
              verso est. La curva del terminator cambia con le stagioni
              (declinazione solare).
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
        {!data ? (
          <div className="aspect-[2/1] rounded-lg bg-[var(--surface-2)] animate-pulse" />
        ) : (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)] tabular-nums mb-2">
              {data.openCount} {data.openCount === 1 ? "borsa aperta" : "borse aperte"}
              {" · "}
              UTC{" "}
              {String(now!.getUTCHours()).padStart(2, "0")}:
              {String(now!.getUTCMinutes()).padStart(2, "0")}
            </p>
            <div className="relative rounded-lg overflow-hidden bg-[var(--surface-2)]">
              <svg
                viewBox="-180 -90 360 180"
                preserveAspectRatio="none"
                className="w-full aspect-[2/1] block overflow-hidden"
              >
                <defs>
                  <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                    {/* Sun glow in violet, sottile */}
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                  </radialGradient>
                  <filter
                    id="terminatorBlur"
                    x="-10%"
                    y="-10%"
                    width="120%"
                    height="120%"
                  >
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
                  </filter>
                </defs>

                {/* Sun glow leggera, accenta il sub-solar point */}
                <ellipse
                  cx={data.lambdaS}
                  cy={data.sunY}
                  rx="78"
                  ry="46"
                  fill="url(#sunGlow)"
                />

                {landPath && (
                  <path
                    d={landPath}
                    fill="none"
                    stroke="rgba(139, 92, 246, 0.45)"
                    strokeWidth="0.35"
                  />
                )}

                {/* Night overlay: scuro ma sottile, evidenzia solo il lato notte */}
                <path
                  d={data.nightPath}
                  fill="rgba(0, 0, 0, 0.35)"
                  filter="url(#terminatorBlur)"
                />

                <line
                  x1="-180"
                  y1="0"
                  x2="180"
                  y2="0"
                  stroke="rgba(139, 92, 246, 0.20)"
                  strokeWidth="0.25"
                />
                {[23.5, -23.5].map((lat) => (
                  <line
                    key={lat}
                    x1="-180"
                    y1={-lat}
                    x2="180"
                    y2={-lat}
                    stroke="rgba(139, 92, 246, 0.10)"
                    strokeWidth="0.25"
                    strokeDasharray="2 2"
                  />
                ))}
                {[-180, -90, 0, 90, 180].map((lng) => (
                  <line
                    key={lng}
                    x1={lng}
                    y1="-90"
                    x2={lng}
                    y2="90"
                    stroke="rgba(139, 92, 246, 0.08)"
                    strokeWidth="0.25"
                  />
                ))}

                {/* Niente marker giallo del sole — solo glow */}

                {/* Exchange markers + labels */}
                {visibleExchanges.map((ex) => {
                  const open = isMarketOpen(now!, ex);
                  const cx = ex.lng;
                  const cy = -ex.lat;
                  const labelAbove = ex.labelPosition === "above";
                  const labelY = labelAbove ? cy - 6 : cy + 9;
                  return (
                    <g key={ex.id}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="1.5"
                        fill={open ? "#34d399" : "#f43f5e"}
                        stroke="white"
                        strokeWidth="0.4"
                        opacity={open ? 1 : 0.9}
                      />
                      {open && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r="3"
                          fill="none"
                          stroke="#34d399"
                          strokeWidth="0.3"
                          opacity="0.6"
                        >
                          <animate
                            attributeName="r"
                            from="1.5"
                            to="5.5"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            from="0.6"
                            to="0"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      <text
                        x={cx}
                        y={labelY}
                        textAnchor="middle"
                        fontSize="5"
                        fontWeight="600"
                        fill="white"
                        paintOrder="stroke"
                        stroke="rgba(0,0,0,0.7)"
                        strokeWidth="0.6"
                        strokeLinejoin="round"
                      >
                        {ex.label}
                      </text>
                      <title>
                        {ex.flag} {ex.label} {ex.city} —{" "}
                        {open ? "Aperto" : "Chiuso"}
                      </title>
                    </g>
                  );
                })}
              </svg>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
