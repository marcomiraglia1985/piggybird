"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: Array<{
  value: "expense" | "income" | "investment" | "transfer";
  label: string;
  emoji: string;
  color: string;
}> = [
  { value: "expense", label: "Spesa", emoji: "💸", color: "rose" },
  { value: "income", label: "Entrata", emoji: "💰", color: "emerald" },
  { value: "investment", label: "Investimento", emoji: "📈", color: "violet" },
  { value: "transfer", label: "Trasferimento", emoji: "↔️", color: "cyan" },
];

const TYPE_STYLES: Record<string, { active: string; idle: string }> = {
  rose: {
    active: "bg-rose-500/15 border-rose-500/40 text-rose-300",
    idle: "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
  },
  emerald: {
    active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    idle: "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
  },
  violet: {
    active: "bg-violet-500/15 border-violet-500/40 text-violet-300",
    idle: "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
  },
  cyan: {
    active: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300",
    idle: "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
  },
};

export function NewCategoryButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [type, setType] = useState<"expense" | "income" | "investment" | "transfer">(
    "expense",
  );

  function reset() {
    setName("");
    setEmoji("📁");
    setType("expense");
    setError(null);
  }

  function close() {
    if (creating) return;
    reset();
    setOpen(false);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          emoji: emoji.trim() || "📁",
          name: name.trim(),
          group: "uncategorized",
          type,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore creazione");
      }
      const json = await res.json();
      const newId = json?.category?.id as string | undefined;
      reset();
      setOpen(false);
      router.refresh();
      if (newId) {
        const tryScroll = (attempts: number) => {
          const el = document.getElementById(`cat-${newId}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add(
              "ring-2",
              "ring-violet-400",
              "ring-offset-2",
              "ring-offset-[var(--color-bg)]",
            );
            setTimeout(() => {
              el.classList.remove(
                "ring-2",
                "ring-violet-400",
                "ring-offset-2",
                "ring-offset-[var(--color-bg)]",
              );
            }, 2000);
          } else if (attempts > 0) {
            setTimeout(() => tryScroll(attempts - 1), 100);
          }
        };
        setTimeout(() => tryScroll(10), 200);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        title={
          disabled
            ? "Non puoi creare categorie nella vista archiviate"
            : "Crea una nuova categoria"
        }
        className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="size-4" />
        Nuova categoria
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Tag className="size-5 text-violet-400" />
                  Nuova categoria
                </h2>
                <button
                  onClick={close}
                  disabled={creating}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-[80px_1fr] gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={4}
                    className="w-full h-9 px-3 text-center text-lg rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submit();
                    }}
                    autoFocus
                    placeholder="Es. Palestra, Bollette luce…"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium">
                  Tipo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPE_OPTIONS.map((t) => {
                    const active = type === t.value;
                    const styles = TYPE_STYLES[t.color];
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setType(t.value)}
                        className={cn(
                          "h-10 px-3 rounded-lg text-xs font-medium border transition-colors inline-flex items-center justify-center gap-1.5",
                          active ? styles.active : styles.idle,
                        )}
                      >
                        <span>{t.emoji}</span>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-[var(--color-fg-subtle)] bg-[var(--color-surface-2)]/50 border border-[var(--color-border)]/50 rounded-lg p-2">
                Verrà creata nella sezione <strong>🆕 Da categorizzare</strong> in cima
                alla pagina. Trascinala poi nella macro-area giusta (Casa, Lifestyle,
                Estates, ecc.) per categorizzarla correttamente.
              </p>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={close}
                  disabled={creating}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={submit}
                  disabled={creating || !name.trim()}
                  className="h-9 px-4 rounded-lg bg-violet-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  {creating ? "Creo…" : "Crea"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
