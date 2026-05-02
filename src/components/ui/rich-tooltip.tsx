"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";

/**
 * Tooltip ricco riusabile, stile identico a `FreezeToggle` in
 * `src/components/conti/freeze-toggle.tsx`.
 *
 * Caratteristiche:
 *   - Bottone trigger ⓘ in box rounded-md con hover bg (no naked icon)
 *   - Card flottante via React Portal a document.body — non viene clippata
 *     da parent con `overflow-hidden` (es. hero gradient cards)
 *   - Posizione calcolata dal bbox del trigger, riposizionata su scroll/resize
 *   - Resta aperta finché mouse è su trigger O card
 *
 * Uso (icona trigger A SINISTRA del testo a cui si riferisce):
 *
 *   <span className="inline-flex items-center gap-1">
 *     <RichTooltip title="Unrealized P/L" icon={<Layers className="size-3.5 text-violet-400" />}>
 *       <p>Spiegazione…</p>
 *     </RichTooltip>
 *     Unrealized P/L
 *   </span>
 */
export function RichTooltip({
  title,
  icon,
  children,
  align = "right",
  width = 320,
}: {
  title: string;
  /** Icona accanto al titolo nella card */
  icon?: ReactNode;
  children: ReactNode;
  /** Allineamento orizzontale della card rispetto al trigger */
  align?: "right" | "left" | "center";
  /** Larghezza fissa della card in px */
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Posiziona la card rispetto al bbox del trigger (viewport coords + scroll).
  function recompute() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;
    const top = rect.bottom + scrollY + 8; // mt-2
    let left: number;
    if (align === "left") left = rect.left + scrollX;
    else if (align === "right") left = rect.right + scrollX - width;
    else left = rect.left + scrollX + rect.width / 2 - width / 2;
    // Clamp dentro al viewport (margine 8px)
    const minLeft = scrollX + 8;
    const maxLeft = scrollX + window.innerWidth - width - 8;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    setPos({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    recompute();
    const onScrollOrResize = () => recompute();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="size-7 inline-flex items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
        title="Cosa significa?"
        aria-label={title}
      >
        <Info className="size-3.5" />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                style={{
                  position: "absolute",
                  top: pos.top,
                  left: pos.left,
                  width,
                }}
                className="z-[1000] surface p-3 shadow-xl border-violet-500/30"
              >
                <div className="text-xs space-y-2">
                  <div className="font-semibold text-[var(--color-fg)] inline-flex items-center gap-1.5">
                    {icon ?? <Info className="size-3.5 text-violet-400" />}
                    {title}
                  </div>
                  <div className="space-y-1.5 text-[var(--color-fg-muted)] leading-relaxed">
                    {children}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
