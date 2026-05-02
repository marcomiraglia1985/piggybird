"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";

/**
 * Trigger + popover per le opzioni di un widget dashboard.
 * Il `children` è il pannello opzioni (controlli del widget). `onReset`
 * opzionale aggiunge un bottone "Ripristina default" in fondo.
 *
 * Si auto-chiude al click outside / Escape.
 */
export function WidgetSettingsPopover({
  title = "Opzioni",
  children,
  onReset,
}: {
  title?: string;
  children: ReactNode;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Element | null;
      if (ref.current && target && !ref.current.contains(target)) {
        // Ignora click su portali figli (es. CategoryPicker dropdown renderizzato
        // su document.body): altrimenti si chiude prima che il click handler
        // interno al portal possa registrarsi → selezione persa.
        if (target.closest?.("[data-widget-popover-portal]")) return;
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Usiamo "click" invece di "mousedown" così, anche senza data-attr,
    // l'onClick del child fires prima del nostro close (i sotto-componenti
    // si comportano come previsto).
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="size-7 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors"
        title="Opzioni del widget"
        aria-label="Opzioni del widget"
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-3.5" />
      </button>
      {open && (
          <div
            className="absolute right-0 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-30"
          >
            <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest font-medium text-[var(--fg-muted)]">
                {title}
              </span>
              {onReset && (
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    setOpen(false);
                  }}
                  className="text-[11px] inline-flex items-center gap-1 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
                  title="Ripristina default"
                >
                  <RotateCcw className="size-3" />
                  Reset
                </button>
              )}
            </div>
            <div className="p-3 space-y-3 text-xs">{children}</div>
          </div>
        )}
    </div>
  );
}
