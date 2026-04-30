"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { useFormatDate, usePreferences } from "@/lib/preferences";

type Weather = { tempC: number; emoji: string; description: string };

const WMO_CODE_TO_EMOJI: Record<number, [string, string]> = {
  0: ["☀️", "Sereno"],
  1: ["🌤️", "Per lo più sereno"],
  2: ["⛅", "Parz. nuvoloso"],
  3: ["☁️", "Nuvoloso"],
  45: ["🌫️", "Nebbia"],
  48: ["🌫️", "Nebbia ghiacciata"],
  51: ["🌦️", "Pioviggine leggera"],
  53: ["🌦️", "Pioviggine"],
  55: ["🌧️", "Pioviggine fitta"],
  61: ["🌧️", "Pioggia leggera"],
  63: ["🌧️", "Pioggia"],
  65: ["🌧️", "Pioggia forte"],
  71: ["🌨️", "Neve leggera"],
  73: ["🌨️", "Neve"],
  75: ["❄️", "Neve forte"],
  77: ["🌨️", "Granuli di neve"],
  80: ["🌧️", "Rovesci leggeri"],
  81: ["🌧️", "Rovesci"],
  82: ["⛈️", "Rovesci forti"],
  85: ["🌨️", "Rovesci di neve"],
  86: ["🌨️", "Rovesci di neve forti"],
  95: ["⛈️", "Temporale"],
  96: ["⛈️", "Temporale + grandine"],
  99: ["⛈️", "Temporale forte"],
};

export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherErr, setWeatherErr] = useState(false);
  const { resolvedTimezone } = usePreferences();
  const formatDate = useFormatDate();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadWeather(lat: number, lon: number) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const j = await res.json();
        const tempC = Math.round(j.current?.temperature_2m ?? 0);
        const code = j.current?.weather_code ?? 0;
        const [emoji, description] = WMO_CODE_TO_EMOJI[code] ?? ["🌡️", "—"];
        if (!cancelled) setWeather({ tempC, emoji, description });
      } catch {
        if (!cancelled) setWeatherErr(true);
      }
    }
    function fallbackMilano() {
      // Fallback su Milano se la geolocation è negata o non disponibile
      loadWeather(45.4642, 9.19);
    }
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude),
        () => fallbackMilano(),
        { timeout: 5000, maximumAge: 30 * 60 * 1000 },
      );
    } else {
      fallbackMilano();
    }
    // Refresh meteo ogni 15 min
    const interval = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude),
          () => fallbackMilano(),
          { timeout: 5000, maximumAge: 30 * 60 * 1000 },
        );
      }
    }, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!now) return null;

  const time = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: resolvedTimezone,
  }).format(now);
  const date = formatDate(now);

  return (
    <div className="hidden md:inline-flex items-center gap-3 text-xs text-[var(--fg-muted)] tabular-nums">
      <div className="flex flex-col items-end leading-tight">
        <span className="font-medium text-[var(--fg)] text-sm">{time}</span>
        <span className="text-[10px] text-[var(--fg-subtle)]">{date}</span>
      </div>
      {weather ? (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
          title={weather.description}
        >
          <span className="text-base leading-none">{weather.emoji}</span>
          <span className="font-medium text-sm text-[var(--fg)]">{weather.tempC}°</span>
        </div>
      ) : weatherErr ? (
        <div className="size-7 inline-flex items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)]">
          <CloudOff className="size-3.5 text-[var(--fg-subtle)]" />
        </div>
      ) : (
        <div className="size-7 inline-flex items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)]">
          <span className="size-2 rounded-full bg-[var(--fg-subtle)] animate-pulse" />
        </div>
      )}
    </div>
  );
}
