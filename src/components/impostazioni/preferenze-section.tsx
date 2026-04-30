"use client";

import { useMemo, useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { usePreferences, type Preferences } from "@/lib/preferences";

const LANGS: { value: Preferences["lang"]; label: string }[] = [
  { value: "it", label: "🇮🇹 Italiano" },
  { value: "en", label: "🇬🇧 English" },
  { value: "fr", label: "🇫🇷 Français" },
];
const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "ALL", "JPY"];
const DATE_FORMATS: { value: Preferences["dateFormat"]; label: string }[] = [
  { value: "dd-mmm-yy", label: "26 apr 26" },
  { value: "dd-mmm-yyyy", label: "26 apr 2026" },
  { value: "dd/mm/yyyy", label: "26/04/2026" },
  { value: "yyyy-mm-dd", label: "2026-04-26 (ISO)" },
  { value: "long-it", label: "26 aprile 2026" },
  { value: "long-en", label: "26 April 2026" },
];
const NUM_FORMATS: { value: Preferences["numFormat"]; label: string }[] = [
  { value: "it", label: "1.234,56 (IT/EU)" },
  { value: "us", label: "1,234.56 (US/UK)" },
];

function getAllTimezones(): string[] {
  try {
    const tz = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (Array.isArray(tz)) return tz;
  } catch {}
  return ["Europe/Rome", "Europe/Paris", "Europe/London", "Europe/Tirane", "America/New_York", "Asia/Tokyo"];
}

const SELECT_CLS =
  "w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50";

export function PreferenzeSection() {
  const { prefs, resolvedTimezone, setPref } = usePreferences();
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const allTimezones = useMemo(() => getAllTimezones(), []);

  async function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setSavingKey(key);
    await setPref(key, value);
    setSavingKey(null);
    setSavedKey(key);
    setTimeout(() => setSavedKey((c) => (c === key ? null : c)), 1500);
  }

  function Indicator({ k }: { k: string }) {
    if (savingKey === k) return <span className="text-[10px] text-[var(--fg-subtle)]">salvo…</span>;
    if (savedKey === k)
      return (
        <span className="text-[10px] inline-flex items-center gap-0.5 text-emerald-400">
          <Check className="size-3" /> salvato
        </span>
      );
    return null;
  }

  const browserTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "Europe/Rome";
    }
  }, []);

  return (
    <div className="surface p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Lingua"
          indicator={<Indicator k="lang" />}
          warning="Localizzazione UI in arrivo. Per ora cambia solo nomi mesi nelle date."
        >
          <select
            value={prefs.lang}
            onChange={(e) => update("lang", e.target.value as Preferences["lang"])}
            className={SELECT_CLS}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Valuta default"
          indicator={<Indicator k="currency" />}
          warning="La conversione FX live degli importi storici è in arrivo. Cambia solo simbolo nei totali."
        >
          <select
            value={prefs.currency}
            onChange={(e) => update("currency", e.target.value)}
            className={SELECT_CLS}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Formato data" indicator={<Indicator k="dateFormat" />}>
          <select
            value={prefs.dateFormat}
            onChange={(e) => update("dateFormat", e.target.value as Preferences["dateFormat"])}
            className={SELECT_CLS}
          >
            {DATE_FORMATS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Formato numerico" indicator={<Indicator k="numFormat" />}>
          <select
            value={prefs.numFormat}
            onChange={(e) => update("numFormat", e.target.value as Preferences["numFormat"])}
            className={SELECT_CLS}
          >
            {NUM_FORMATS.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Timezone"
          indicator={<Indicator k="timezone" />}
          hint={`In uso: ${resolvedTimezone}${prefs.timezone === "auto" ? " (browser)" : ""}`}
        >
          <select
            value={prefs.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            className={SELECT_CLS}
          >
            <option value="auto">🌍 Automatica ({browserTz})</option>
            <optgroup label="Tutte le timezone">
              {allTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>

        <Field label="Tema" indicator={<Indicator k="themeMode" />}>
          <select
            value={prefs.themeMode}
            onChange={(e) => update("themeMode", e.target.value as Preferences["themeMode"])}
            className={SELECT_CLS}
          >
            <option value="dark">🌙 Sempre scuro</option>
            <option value="light">☀️ Sempre chiaro</option>
            <option value="schedule">⏱️ Auto in base all&apos;ora</option>
          </select>
        </Field>
      </div>

      {prefs.themeMode === "schedule" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-[var(--surface-2)]/40 border border-[var(--border)] p-4">
          <Field label="Tema scuro da" indicator={<Indicator k="themeDarkFrom" />}>
            <input
              type="time"
              value={prefs.themeDarkFrom}
              onChange={(e) => update("themeDarkFrom", e.target.value)}
              className={SELECT_CLS}
            />
          </Field>
          <Field label="Tema chiaro da" indicator={<Indicator k="themeDarkTo" />}>
            <input
              type="time"
              value={prefs.themeDarkTo}
              onChange={(e) => update("themeDarkTo", e.target.value)}
              className={SELECT_CLS}
            />
          </Field>
          <p className="text-[11px] text-[var(--fg-subtle)] sm:col-span-2">
            Es. dark dalle 20:00 alle 07:00 → app scura di sera, chiara di giorno. Cambio
            automatico ogni minuto. L&apos;icona nell&apos;header mostra un pallino con
            l&apos;orologio quando lo schedule è attivo.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  indicator,
  warning,
  hint,
  children,
}: {
  label: string;
  indicator?: React.ReactNode;
  warning?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
          {label}
        </label>
        {indicator}
      </div>
      {children}
      {warning && (
        <p className="text-[11px] text-amber-400/80 inline-flex items-start gap-1">
          <AlertTriangle className="size-3 mt-0.5 shrink-0" />
          {warning}
        </p>
      )}
      {hint && <p className="text-[11px] text-[var(--fg-subtle)]">{hint}</p>}
    </div>
  );
}
