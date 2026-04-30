"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Unlock, Snowflake, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardGrid, type DashboardCard } from "./dashboard-grid";

const LOCKED_KEY = "fp-dashboard-locked";

export function DashboardShell({
  kpiHero,
  cards,
  accountsFrozen = false,
}: {
  kpiHero: React.ReactNode;
  cards: DashboardCard[];
  /** Quando true, mostra il promemoria "Conti congelati" accanto al bottone Edit celle. */
  accountsFrozen?: boolean;
}) {
  const [locked, setLocked] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const v = localStorage.getItem(LOCKED_KEY);
      if (v === "0") setLocked(false);
    } catch {}
  }, []);

  function toggle() {
    setLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LOCKED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Una panoramica delle tue finanze in tempo reale.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accountsFrozen && (
            <div className="inline-flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setTooltipOpen(true)}
                  onMouseLeave={() => setTooltipOpen(false)}
                  onClick={() => setTooltipOpen((v) => !v)}
                  className="size-7 inline-flex items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
                  title="Cosa significa?"
                >
                  <Info className="size-3.5" />
                </button>
                <AnimatePresence>
                  {tooltipOpen && (
                    <motion.div
                      key="tooltip"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      onMouseEnter={() => setTooltipOpen(true)}
                      onMouseLeave={() => setTooltipOpen(false)}
                      className="absolute right-0 top-full mt-2 w-72 z-30 surface p-3 shadow-xl border-cyan-500/30"
                    >
                      <div className="text-xs space-y-1.5">
                        <div className="font-semibold text-[var(--color-fg)] inline-flex items-center gap-1.5">
                          <Snowflake className="size-3.5 text-cyan-300" />
                          Conti congelati
                        </div>
                        <p className="text-[var(--color-fg-muted)] leading-relaxed">
                          Modalità che ti permette di sistemare i saldi dei
                          conti a bocce ferme: utile dopo l&apos;importazione
                          dello storico, per riconciliare il valore reale di
                          ogni conto senza che i nuovi movimenti lo modifichino
                          mentre lavori.
                        </p>
                        <p className="text-[11px] text-[var(--color-fg-subtle)] pt-1 border-t border-[var(--color-border)]/50">
                          I saldi dei tuoi conti sono ora fissi alle cifre che
                          hai impostato manualmente. I nuovi movimenti vengono
                          registrati ma non aggiornano i saldi mostrati, che
                          riprenderanno ad aggiornarsi solo a conti scongelati.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Link
                href="/conti"
                title="I conti sono in modalità congelata. Vai su /conti per scongelarli."
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-gradient-to-br from-cyan-500/[0.12] to-sky-500/[0.06] border border-cyan-500/40 text-xs font-medium text-cyan-300 hover:border-cyan-500/60 hover:from-cyan-500/[0.18] transition-colors"
              >
                <Snowflake className="size-3.5" />
                Conti congelati
              </Link>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            disabled={!mounted}
            className={cn(
              "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium border transition-colors",
              !locked
                ? "bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/25"
                : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
            )}
            title={locked ? "Modifica disposizione celle" : "Blocca disposizione"}
          >
            {locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
            {locked ? "Edit celle" : "Blocca celle"}
          </button>
        </div>
      </header>

      {kpiHero}

      <DashboardGrid cards={cards} locked={locked} />
    </div>
  );
}
