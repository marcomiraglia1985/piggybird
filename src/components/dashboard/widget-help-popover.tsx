"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

/**
 * Trigger + popover per la spiegazione "newbie-friendly" di un widget.
 * Il `children` è il contenuto della guida (cos'è, come leggerlo, come usarlo).
 *
 * Si auto-chiude al click outside / Escape. Stesso pattern del settings popover
 * ma in colore violet (azione informativa) invece che grigio.
 */
export function WidgetHelpPopover({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="size-7 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
        title={`Cos'è ${title}?`}
        aria-label={`Cos'è ${title}?`}
        aria-expanded={open}
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-xl border border-violet-500/30 bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-30">
          <div className="px-3 py-2 border-b border-violet-500/20 bg-violet-500/[0.05]">
            <span className="text-[11px] uppercase tracking-widest font-medium text-violet-300 inline-flex items-center gap-1.5">
              <HelpCircle className="size-3" />
              {title}
            </span>
          </div>
          <div className="p-3 text-xs text-[var(--fg-muted)] leading-relaxed space-y-2.5">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
