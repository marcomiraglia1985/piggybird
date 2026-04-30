"use client";

import { Sun, Moon, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePreferences } from "@/lib/preferences";

export function ThemeToggle() {
  const { prefs, appliedTheme, setPref } = usePreferences();

  function toggle() {
    // Click sul bottone: cicla dark → light → dark.
    // Se l'utente è in modalità "schedule" lo forza a manuale del valore opposto.
    const next = appliedTheme === "dark" ? "light" : "dark";
    setPref("themeMode", next);
  }

  const Icon = appliedTheme === "dark" ? Moon : Sun;
  const isAuto = prefs.themeMode === "schedule";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Passa al tema ${appliedTheme === "dark" ? "chiaro" : "scuro"}`}
      title={
        isAuto
          ? `Auto-schedule (attuale ${appliedTheme}). Click per forzare manuale.`
          : `Passa al tema ${appliedTheme === "dark" ? "chiaro" : "scuro"}`
      }
      className="relative size-9 inline-flex items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-colors"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={appliedTheme + (isAuto ? "-a" : "")}
          initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
      {isAuto && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center"
          title="Tema automatico in base all'ora"
        >
          <Clock className="size-2 text-[var(--fg-subtle)]" />
        </span>
      )}
    </button>
  );
}
