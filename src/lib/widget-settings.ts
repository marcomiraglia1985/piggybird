"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook generico per persistere le opzioni di un widget dashboard.
 *
 * **Storage: DB (Setting key-value)**, key=`widget.<widgetId>`, value=JSON
 * dell'oggetto opzioni. Migrazione da localStorage al DB serve a:
 *   - Condividere preferenze tra dev (browser localhost) e Tauri webview
 *     (WebKit isolato, ha localStorage separato)
 *   - Sopravvivere a reinstall .app
 *   - Finire negli snapshot di debug se utente li manda
 *
 * Performance:
 *   - Module-scoped cache: TUTTE le settings sono fetched una sola volta al
 *     primo widget mount (multiplexed via promise in-flight). N widget = 1
 *     fetch totale.
 *   - Initial state = defaults (sync). Hydration async aggiorna stato dopo
 *     ~50-100ms al primo render. Per render successivi (cache hit), zero
 *     latenza.
 *
 * Cross-component sync (toggle in widget A → riflesso in widget B che legge
 * stesso widgetId): mantenuto via CustomEvent come prima.
 *
 * Esempio:
 *   const [opts, setOpts] = useWidgetSettings("recent-tx", { limit: 5 });
 */

const KEY_PREFIX = "widget.";
const EVENT_PREFIX = "fp-widget-update:";

type SettingsMap = Record<string, string>;

// Cache module-scoped per evitare N fetch quando N widget si montano insieme
let allSettingsCache: SettingsMap | null = null;
let allSettingsInflight: Promise<SettingsMap> | null = null;

async function getAllSettings(): Promise<SettingsMap> {
  if (allSettingsCache) return allSettingsCache;
  if (allSettingsInflight) return allSettingsInflight;
  allSettingsInflight = fetch("/api/settings")
    .then((r) => r.json())
    .then((d): SettingsMap => {
      allSettingsCache = d.settings ?? {};
      return allSettingsCache!;
    })
    .catch((): SettingsMap => {
      allSettingsCache = {};
      return allSettingsCache;
    })
    .finally(() => {
      allSettingsInflight = null;
    });
  return allSettingsInflight;
}

function persistSetting(key: string, value: string): void {
  // Update local cache eagerly (next reads vedono il nuovo valore)
  if (allSettingsCache) allSettingsCache[key] = value;
  // Fire-and-forget POST. Errori loggati ma non bloccanti — UX optimistic.
  fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  }).catch((e) => {
    console.warn(`[widget-settings] save failed for ${key}:`, e);
  });
}

function deleteSetting(key: string): void {
  if (allSettingsCache) delete allSettingsCache[key];
  // /api/settings non ha DELETE → POST con valore vuoto. Backward-compat:
  // valore "" interpretato come "default" alla prossima lettura.
  fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value: "" }),
  }).catch(() => {});
}

export function useWidgetSettings<T extends Record<string, unknown>>(
  widgetId: string,
  defaults: T,
): [T, (patch: Partial<T> | ((prev: T) => Partial<T>)) => void, () => void] {
  // Lock alla reference iniziale di defaults: i widget passano una const
  // top-level, quindi non cambia mai.
  const defaultsRef = useRef(defaults);
  const fullKey = KEY_PREFIX + widgetId;

  // Initial state: cache hit immediato, oppure defaults in attesa di hydration
  const [settings, setSettings] = useState<T>(() => {
    if (allSettingsCache) {
      const raw = allSettingsCache[fullKey];
      if (raw) {
        try {
          return { ...defaultsRef.current, ...JSON.parse(raw) };
        } catch {}
      }
    }
    return defaultsRef.current;
  });

  // Hydration: fetch async al mount se cache miss
  useEffect(() => {
    let cancelled = false;
    if (allSettingsCache) {
      // già hydrated, nothing to do
      return;
    }
    getAllSettings().then((all) => {
      if (cancelled) return;
      const raw = all[fullKey];
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setSettings({ ...defaultsRef.current, ...parsed });
        } catch {}
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => Partial<T>)) => {
      setSettings((prev) => {
        const delta = typeof patch === "function" ? patch(prev) : patch;
        const next = { ...prev, ...delta };
        persistSetting(fullKey, JSON.stringify(next));
        // Async dispatch così altri hook con stessa widgetId si sincronizzano
        queueMicrotask(() =>
          window.dispatchEvent(
            new CustomEvent(EVENT_PREFIX + widgetId, { detail: next }),
          ),
        );
        return next;
      });
    },
    [widgetId, fullKey],
  );

  const reset = useCallback(() => {
    setSettings(defaultsRef.current);
    deleteSetting(fullKey);
    queueMicrotask(() =>
      window.dispatchEvent(
        new CustomEvent(EVENT_PREFIX + widgetId, { detail: defaultsRef.current }),
      ),
    );
  }, [widgetId, fullKey]);

  // Cross-component sync: ascolta update da altri hook con stessa widgetId
  useEffect(() => {
    function onUpdate(e: Event) {
      const ce = e as CustomEvent<T>;
      if (ce.detail) setSettings(ce.detail);
    }
    window.addEventListener(EVENT_PREFIX + widgetId, onUpdate);
    return () => window.removeEventListener(EVENT_PREFIX + widgetId, onUpdate);
  }, [widgetId]);

  return [settings, update, reset];
}
