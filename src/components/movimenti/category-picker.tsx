"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCategoryGroups } from "@/lib/category-groups";

type Category = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  estateId?: string | null;
  displayOrder?: number;
};

type EstateInfo = { id: string; name: string; emoji?: string | null };

export function CategoryPicker({
  value,
  categories,
  estates,
  disabled,
  onChange,
  variant = "compact",
}: {
  value: string | null;
  categories: Category[];
  /** Mappa estate per raggruppare le cat linkate a un immobile sotto il nome estate. */
  estates?: EstateInfo[];
  disabled?: boolean;
  onChange: (categoryId: string | null) => void;
  /** "compact" (default, table rows) | "input" (form-like, h-9 full-width) */
  variant?: "compact" | "input";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? categories.find((c) => c.id === value) : null;

  // Raggruppa secondo l'ordine personalizzato dell'utente da /categorie.
  const allGroups = useCategoryGroups(categories, estates);
  // Filtra in base alla query mantenendo la struttura dei gruppi e gli header macro.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allGroups;
    // Filtra cats nei gruppi normali
    const filtered = allGroups.map((g) => {
      if (g.isMacroHeader) return g;
      return {
        ...g,
        cats: g.cats.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.emoji.includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      };
    });
    // Tieni macro header solo se c'è almeno un estate sub-section con cat;
    // tieni macro footer solo se è preceduto da almeno un estate visibile.
    const result: typeof allGroups = [];
    for (let i = 0; i < filtered.length; i++) {
      const g = filtered[i];
      if (g.isMacroHeader) {
        const hasFollowingEstate = filtered
          .slice(i + 1)
          .some((next) => {
            if (next.isMacroHeader || next.isMacroFooter) return false;
            if (!next.key.startsWith("estate:")) return false;
            return next.cats.length > 0;
          });
        if (hasFollowingEstate) result.push(g);
      } else if (g.isMacroFooter) {
        const hasPrecedingEstate = result.some(
          (prev) => prev.key.startsWith("estate:") && prev.cats.length > 0,
        );
        if (hasPrecedingEstate) result.push(g);
      } else if (g.cats.length > 0) {
        result.push(g);
      }
    }
    return result;
  }, [allGroups, query]);
  const totalFiltered = filteredGroups.reduce(
    (s, g) => s + (g.isMacroHeader || g.isMacroFooter ? 0 : g.cats.length),
    0,
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Posiziona il popover in viewport-fixed, leggendo bbox del trigger.
  // Aggiorna su scroll/resize per non lasciarlo "fluttuare" via dal trigger.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);


  // Popover deve uscire dal contenitore (la tabella ha overflow-hidden):
  // lo renderizziamo via portal su document.body con position fixed,
  // ancorato al bottom-left del trigger. Width = max(288, trigger-width)
  // così in form-input variant il popover occupa la cella del form.
  const popoverStyle: React.CSSProperties | undefined = rect
    ? (() => {
        const margin = 8;
        const popoverW = Math.max(288, rect.width);
        const popoverMaxH = 480; // matches max-h del dropdown sotto
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        // Auto-flip: se sotto il trigger non c'è abbastanza spazio, ancoriamo
        // il BOTTOM del popover al top del trigger (così cresce verso l'alto
        // adattandosi all'altezza reale, niente gap).
        const flipUp = spaceBelow < popoverMaxH && spaceAbove > spaceBelow;
        const wantedLeft = rect.left;
        const maxLeft = window.innerWidth - popoverW - margin;
        const left = Math.max(margin, Math.min(wantedLeft, maxLeft));
        const maxHeight = flipUp
          ? Math.min(popoverMaxH, spaceAbove)
          : Math.min(popoverMaxH, spaceBelow);
        if (flipUp) {
          // bottom-anchored: il popover sale dal punto (rect.top - 4) verso l'alto
          return {
            position: "fixed",
            bottom: window.innerHeight - rect.top + 4,
            left,
            width: popoverW,
            maxHeight,
          };
        }
        return {
          position: "fixed",
          top: rect.bottom + 4,
          left,
          width: popoverW,
          maxHeight,
        };
      })()
    : undefined;

  const isInput = variant === "input";
  return (
    <div ref={ref} className={isInput ? "relative" : "relative inline-block"}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-between gap-1 cursor-pointer transition-colors",
          isInput
            ? // Stile da form: full-width, h-9, padding generoso, bordo come input
              "w-full h-9 rounded-lg px-3 text-sm bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] focus:outline-none"
            : // Stile compatto da tabella: piccolo, max-w. Quando vuoto mostra
              // CTA prominente (border tratteggiato + colore violet) per indicare
              // che è cliccabile per scegliere una categoria.
              selected
              ? "h-7 rounded px-1.5 text-xs max-w-[160px] truncate border border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
              : "h-7 rounded px-2 text-xs border border-dashed border-violet-500/40 bg-violet-500/5 text-violet-300 hover:border-violet-500/70 hover:bg-violet-500/10",
          open && (isInput
            ? "border-violet-500/50"
            : "border-violet-500/50 bg-[var(--surface-2)]"),
          disabled && "opacity-50 cursor-not-allowed",
        )}
        title={selected?.name ?? "Scegli una categoria"}
      >
        {selected ? (
          <span
            className={cn(
              "truncate",
              isInput ? "text-[var(--fg)]" : "text-[var(--fg-muted)]",
            )}
          >
            {isInput ? `${selected.emoji} ${selected.name}` : selected.name}
            {(() => {
              const est = selected.estateId
                ? estates?.find((e) => e.id === selected.estateId)
                : null;
              if (!est) return null;
              return (
                <span className="text-[var(--fg-subtle)] ml-1">
                  · {est.emoji ?? "🏠"} {est.name}
                </span>
              );
            })()}
          </span>
        ) : isInput ? (
          <span className="truncate text-[var(--fg-subtle)]">— Nessuna —</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium">
            <Plus className="size-3" />
            Scegli categoria
          </span>
        )}
        <ChevronDown className={cn("shrink-0 opacity-50", isInput ? "size-4" : "size-3")} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                style={popoverStyle}
                className="z-[110] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
              >
            <div className="relative border-b border-[var(--border)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--fg-subtle)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cerca categoria…"
                className="w-full h-9 pl-9 pr-3 bg-transparent text-sm placeholder:text-[var(--fg-subtle)] focus:outline-none"
              />
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)]",
                  value === null && "text-violet-400",
                )}
              >
                <span className="size-5 inline-flex items-center justify-center text-[var(--fg-subtle)]">∅</span>
                <span>nessuna</span>
              </button>

              {filteredGroups.map((g) => {
                if (g.isMacroHeader) {
                  return (
                    <div
                      key={g.key}
                      className="sticky top-0 z-20 px-3 pt-3 pb-1 text-[11px] uppercase tracking-widest font-bold text-violet-300 bg-[var(--bg-elevated)]/95 backdrop-blur-sm border-b border-violet-500/20"
                    >
                      {g.label}
                    </div>
                  );
                }
                if (g.isMacroFooter) {
                  return (
                    <div
                      key={g.key}
                      className="border-b border-violet-500/20 mt-1"
                      aria-hidden
                    />
                  );
                }
                return (
                <div key={g.key}>
                  <div
                    className={cn(
                      "sticky top-0 z-10 px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider font-medium bg-[var(--bg-elevated)]/95 backdrop-blur-sm",
                      g.key.startsWith("estate:")
                        ? "pl-5 text-violet-400"
                        : g.key === "uncategorized"
                          ? "text-amber-400"
                          : "text-[var(--fg-subtle)]",
                    )}
                  >
                    {g.label}
                  </div>
                  {g.cats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-[var(--surface-2)]",
                        value === c.id && "bg-violet-500/10 text-violet-300",
                      )}
                    >
                      <span className="size-5 inline-flex items-center justify-center">{c.emoji}</span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
                );
              })}

              {totalFiltered === 0 && (
                <div className="py-6 text-center text-xs text-[var(--fg-subtle)]">
                  Nessuna categoria trovata
                </div>
              )}
            </div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
