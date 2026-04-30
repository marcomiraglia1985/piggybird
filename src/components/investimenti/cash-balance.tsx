"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Plus, Pencil, Trash2, Check, X, AlertTriangle } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Cash = {
  id: string;
  currency: string;
  amount: number;
  fxToEur: number;
  lastUpdated: string;
};

export function CashBalance({ cash }: { cash: Cash[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null); // currency being edited
  const [newAmount, setNewAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [newCurrency, setNewCurrency] = useState("EUR");
  const [newCurrencyAmount, setNewCurrencyAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalEur = cash.reduce((s, c) => s + c.amount * c.fxToEur, 0);

  async function save(currency: string, amount: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/stocks/cash", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currency, amount }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      setEditing(null);
      setNewAmount("");
      setNewCurrencyAmount("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function remove(currency: string) {
    if (!(await confirm({ title: `Rimuovere il saldo ${currency}?`, confirmLabel: "Rimuovi", variant: "danger" }))) return;
    await fetch(`/api/integrations/stocks/cash?currency=${currency}`, { method: "DELETE" });
    router.refresh();
  }

  const usedCurrencies = new Set(cash.map((c) => c.currency));
  const availableCurrencies = ["EUR", "USD", "GBP", "CHF"].filter((c) => !usedCurrencies.has(c));

  return (
    <div className="surface p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] inline-flex items-center gap-2">
          <Wallet className="size-4" />
          Saldo disponibile (cash nel conto trading)
        </h2>
        <span className="text-sm tabular-nums text-[var(--fg-muted)]">
          {totalEur > 0 ? formatEUR(totalEur) : "—"}
        </span>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3" /> {error}
        </div>
      )}

      <div className="space-y-2">
        {cash.length === 0 && !adding && (
          <p className="text-xs text-[var(--fg-subtle)] py-2">
            Nessun saldo cash. I proventi delle vendite restano nel conto trading finché non li
            ritrasferisci a Revolut.
          </p>
        )}

        {cash.map((c) => {
          const isEditing = editing === c.currency;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--surface-2)]/50 border border-[var(--border)]/60"
            >
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--fg-muted)] w-12">
                {c.currency}
              </span>
              {isEditing ? (
                <input
                  type="number"
                  step="any"
                  value={newAmount}
                  autoFocus
                  onChange={(e) => setNewAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save(c.currency, parseFloat(newAmount));
                    else if (e.key === "Escape") {
                      setEditing(null);
                      setNewAmount("");
                    }
                  }}
                  className="flex-1 h-7 rounded bg-[var(--surface)] border border-violet-500/50 px-2 text-sm tabular-nums focus:outline-none"
                />
              ) : (
                <div className="flex-1 tabular-nums text-sm">
                  {c.amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {c.currency}
                  {c.currency !== "EUR" && (
                    <span className="text-[var(--fg-subtle)] text-xs ml-2">
                      = {formatEUR(c.amount * c.fxToEur)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex gap-1 shrink-0">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => save(c.currency, parseFloat(newAmount))}
                      disabled={saving}
                      className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setNewAmount("");
                      }}
                      className="size-6 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
                    >
                      <X className="size-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditing(c.currency);
                        setNewAmount(c.amount.toString());
                      }}
                      className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] opacity-60 hover:opacity-100"
                      title="Modifica"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={() => remove(c.currency)}
                      className="size-6 inline-flex items-center justify-center rounded hover:bg-rose-500/10 text-rose-400 opacity-60 hover:opacity-100"
                      title="Rimuovi"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <div className="flex items-center gap-2">
              <select
                value={newCurrency}
                onChange={(e) => setNewCurrency(e.target.value)}
                className="h-9 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 text-sm font-mono"
              >
                {availableCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                value={newCurrencyAmount}
                onChange={(e) => setNewCurrencyAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="flex-1 h-9 rounded bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums"
              />
              <button
                onClick={() => save(newCurrency, parseFloat(newCurrencyAmount))}
                disabled={!newCurrencyAmount || saving}
                className="h-9 px-3 rounded bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
              >
                Aggiungi
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setNewCurrencyAmount("");
                }}
                className="size-9 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!adding && availableCurrencies.length > 0 && (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <Plus className="size-3" /> Aggiungi valuta
        </button>
      )}
    </div>
  );
}
