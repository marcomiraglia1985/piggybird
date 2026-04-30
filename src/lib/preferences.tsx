"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "dark" | "light";
export type ThemeMode = "dark" | "light" | "schedule";
export type DateFormat =
  | "dd-mmm-yy"
  | "dd-mmm-yyyy"
  | "dd/mm/yyyy"
  | "yyyy-mm-dd"
  | "long-it"
  | "long-en";
export type NumFormat = "it" | "us";
export type Lang = "it" | "en" | "fr";

export type Preferences = {
  lang: Lang;
  currency: string;
  dateFormat: DateFormat;
  numFormat: NumFormat;
  timezone: string; // "auto" | IANA tz
  themeMode: ThemeMode;
  themeDarkFrom: string; // HH:MM
  themeDarkTo: string;
};

const DEFAULTS: Preferences = {
  lang: "it",
  currency: "EUR",
  dateFormat: "dd-mmm-yy",
  numFormat: "it",
  timezone: "auto",
  themeMode: "dark",
  themeDarkFrom: "20:00",
  themeDarkTo: "07:00",
};

type Ctx = {
  prefs: Preferences;
  /** Tema concretamente applicato (risolto da themeMode + schedule) */
  appliedTheme: Theme;
  /** Timezone risolta (auto → IANA del browser) */
  resolvedTimezone: string;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>;
};

const PreferencesContext = createContext<Ctx | null>(null);

function computeScheduledTheme(from: string, to: string): Theme {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const fromMin = fh * 60 + fm;
  const toMin = th * 60 + tm;
  const isDark = fromMin > toMin ? cur >= fromMin || cur < toMin : cur >= fromMin && cur < toMin;
  return isDark ? "dark" : "light";
}

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Partial<Preferences>;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = useState<Preferences>(() => ({ ...DEFAULTS, ...initial }));
  const [tick, setTick] = useState(0);

  // Re-compute scheduled theme every minute
  useEffect(() => {
    if (prefs.themeMode !== "schedule") return;
    const handle = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(handle);
  }, [prefs.themeMode]);

  const appliedTheme: Theme = useMemo(() => {
    if (prefs.themeMode === "dark") return "dark";
    if (prefs.themeMode === "light") return "light";
    return computeScheduledTheme(prefs.themeDarkFrom, prefs.themeDarkTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.themeMode, prefs.themeDarkFrom, prefs.themeDarkTo, tick]);

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appliedTheme);
    try {
      localStorage.setItem("fp-theme", appliedTheme);
    } catch {}
  }, [appliedTheme]);

  const resolvedTimezone = useMemo(() => {
    if (prefs.timezone === "auto") {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return "Europe/Rome";
      }
    }
    return prefs.timezone;
  }, [prefs.timezone]);

  const setPref = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPrefs((p) => ({ ...p, [key]: value }));
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, value: String(value) }),
        });
      } catch {
        // resta nel client; reload la riprende
      }
    },
    [],
  );

  return (
    <PreferencesContext.Provider value={{ prefs, appliedTheme, resolvedTimezone, setPref }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): Ctx {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}

// ============================================================================
// Reactive formatters (locale-aware)
// ============================================================================

const MONTHS_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function useFormatDate() {
  const { prefs, resolvedTimezone } = usePreferences();
  return (input: Date | string | number) => {
    const d = input instanceof Date ? input : new Date(input);
    if (!isFinite(d.getTime())) return "—";
    // Convert via timezone
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: resolvedTimezone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    };
    const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(d);
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const yy = year.slice(-2);
    const monthIdx = parseInt(month, 10) - 1;
    const months = prefs.lang === "fr" ? MONTHS_FR : prefs.lang === "en" ? MONTHS_EN : MONTHS_IT;
    const monthStr = months[monthIdx] ?? month;
    switch (prefs.dateFormat) {
      case "dd-mmm-yy":
        return `${day} ${monthStr} ${yy}`;
      case "dd-mmm-yyyy":
        return `${day} ${monthStr} ${year}`;
      case "dd/mm/yyyy":
        return `${day}/${month}/${year}`;
      case "yyyy-mm-dd":
        return `${year}-${month}-${day}`;
      case "long-it":
        return new Intl.DateTimeFormat("it-IT", { ...opts, month: "long" }).format(d);
      case "long-en":
        return new Intl.DateTimeFormat("en-GB", { ...opts, month: "long" }).format(d);
      default:
        return `${day} ${monthStr} ${yy}`;
    }
    void pad;
  };
}

export function useFormatNumber() {
  const { prefs } = usePreferences();
  const locale = prefs.numFormat === "us" ? "en-US" : "it-IT";
  return (n: number, fractionDigits = 2) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
}

export function useFormatCurrency() {
  const { prefs } = usePreferences();
  const locale = prefs.numFormat === "us" ? "en-US" : "it-IT";
  return (amount: number, opts: { compact?: boolean } = {}) => {
    if (opts.compact && Math.abs(amount) >= 1000) {
      const fmt = new Intl.NumberFormat(locale, {
        notation: "compact",
        compactDisplay: "short",
        maximumFractionDigits: 1,
      });
      return `${prefs.currency === "EUR" ? "€" : prefs.currency + " "}${fmt.format(Math.abs(amount))}${amount < 0 ? "−" : ""}`;
    }
    const fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: prefs.currency,
      currencyDisplay: "symbol",
    });
    return fmt.format(amount).replace("-", "−");
  };
}
