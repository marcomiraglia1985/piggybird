"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X, TrendingUp } from "lucide-react";

export function EditSavingsButton({
  account,
}: {
  account: {
    id: string;
    name: string;
    emoji: string | null;
    interestRateAnnual: number | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(account.name);
  const [emoji, setEmoji] = useState(account.emoji ?? "🐷");
  const [rate, setRate] = useState(
    account.interestRateAnnual != null ? String(account.interestRateAnnual) : "",
  );
  const [notes, setNotes] = useState(account.notes ?? "");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function reset() {
    setName(account.name);
    setEmoji(account.emoji ?? "🐷");
    setRate(account.interestRateAnnual != null ? String(account.interestRateAnnual) : "");
    setNotes(account.notes ?? "");
    setError(null);
  }

  function close() {
    if (saving) return;
    reset();
    setOpen(false);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        emoji: emoji.trim() || null,
        interestRateAnnual: rate ? parseFloat(rate.replace(",", ".")) : null,
        notes: notes.trim() || null,
      };
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Modifica conto risparmio"
        className="size-7 inline-flex items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        <Pencil className="size-3.5" />
      </button>

      {mounted &&
        createPortal(
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
                  className="w-full max-w-md surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                      <Pencil className="size-5 text-amber-400" />
                      Modifica conto risparmio
                    </h2>
                    <button
                      onClick={close}
                      disabled={saving}
                      className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-[80px_1fr] gap-2">
                    <Field label="Emoji">
                      <input
                        type="text"
                        value={emoji}
                        onChange={(e) => setEmoji(e.target.value)}
                        maxLength={4}
                        className="w-full h-9 px-3 text-center text-lg rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:outline-none focus:border-amber-500/50"
                      />
                    </Field>
                    <Field label="Nome *">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-amber-500/50"
                      />
                      <p className="text-[10px] text-[var(--color-fg-subtle)] mt-1">
                        Cambia anche su /conti, dashboard, /movimenti, ecc.
                      </p>
                    </Field>
                  </div>

                  <Field
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <TrendingUp className="size-3 text-emerald-400" />
                        Tasso annuo nominale (%)
                      </span>
                    }
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="Es. 1.50"
                      className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-emerald-500/50"
                    />
                    <p className="text-[10px] text-[var(--color-fg-subtle)] mt-1">
                      Solo cosmetico. Il rendimento reale è calcolato dai movimenti con cat
                      "💰 Interessi".
                    </p>
                  </Field>

                  <Field label="Note">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Banca, IBAN, vincolo, condizioni…"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-amber-500/50 resize-none"
                    />
                  </Field>

                  {error && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center gap-2 justify-end pt-2">
                    <button
                      onClick={close}
                      disabled={saving}
                      className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={submit}
                      disabled={saving || !name.trim()}
                      className="h-9 px-4 rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {saving ? "Salvo…" : "Salva"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium block">
        {label}
      </label>
      {children}
    </div>
  );
}
