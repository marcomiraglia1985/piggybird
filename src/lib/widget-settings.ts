"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook generico per persistere le opzioni di un widget dashboard in
 * localStorage, indicizzate per `widgetId`. Il default fornito viene
 * usato come merge base: chiavi mancanti nello storage prendono il default.
 *
 * Lazy initializer + sync cross-component:
 * - Initial state letto da localStorage al primo render (no useEffect).
 * - Quando `update` modifica una chiave, viene dispatchato un CustomEvent
 *   `fp-widget-update:<id>` che altri hook con stessa id ascoltano per
 *   sincronizzare il proprio state in tempo reale (es. toggle in Milestones
 *   → riflesso immediato in NetWorthChart che legge la stessa chiave).
 *
 * Esempio:
 *   const [opts, setOpts] = useWidgetSettings("recent-tx", { limit: 5 });
 */

const KEY_PREFIX = "fp-widget:";
const EVENT_PREFIX = "fp-widget-update:";

export function useWidgetSettings<T extends Record<string, unknown>>(
  widgetId: string,
  defaults: T,
): [T, (patch: Partial<T> | ((prev: T) => Partial<T>)) => void, () => void] {
  // Lock alla reference iniziale di defaults: i widget passano una const
  // top-level, quindi non cambia mai. Anche se cambiasse, vogliamo
  // comportamento stabile rispetto alla prima call.
  const defaultsRef = useRef(defaults);

  const [settings, setSettings] = useState<T>(() => {
    if (typeof window === "undefined") return defaultsRef.current;
    try {
      const raw = window.localStorage.getItem(KEY_PREFIX + widgetId);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultsRef.current, ...parsed };
      }
    } catch {}
    return defaultsRef.current;
  });

  const update = useCallback(
    (patch: Partial<T> | ((prev: T) => Partial<T>)) => {
      setSettings((prev) => {
        const delta = typeof patch === "function" ? patch(prev) : patch;
        const next = { ...prev, ...delta };
        try {
          window.localStorage.setItem(KEY_PREFIX + widgetId, JSON.stringify(next));
          // Dispatch async per uscire dal render cycle corrente: senza
          // questo il listener nello stesso componente verrebbe chiamato
          // mentre l'updater di setSettings sta già aggiornando lo state.
          queueMicrotask(() =>
            window.dispatchEvent(
              new CustomEvent(EVENT_PREFIX + widgetId, { detail: next }),
            ),
          );
        } catch {}
        return next;
      });
    },
    [widgetId],
  );

  const reset = useCallback(() => {
    setSettings(defaultsRef.current);
    try {
      window.localStorage.removeItem(KEY_PREFIX + widgetId);
      window.dispatchEvent(
        new CustomEvent(EVENT_PREFIX + widgetId, { detail: defaultsRef.current }),
      );
    } catch {}
  }, [widgetId]);

  // Ascolta update da altri hook con la stessa widgetId (es. da un altro
  // widget che muta lo stesso settings store) per sync in tempo reale.
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
