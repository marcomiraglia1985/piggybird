"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Save } from "lucide-react";

type Account = { id: string; name: string; emoji: string | null };

export function EditEntrataDialog({
  open,
  onClose,
  tx,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  tx: {
    id: string;
    date: Date;
    amount: number;
    beneficiary: string | null;
    confirmed: boolean;
    accountId?: string;
    account: { id: string; name: string };
  } | null;
  accounts: Account[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [confirmed, setConfirmed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inizializza dai valori della tx quando si apre
  if (open && tx && date === "" && amount === "") {
    const d = new Date(tx.date);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDate(iso);
    setAmount(tx.amount.toString());
    setAccountId(tx.account.id);
    setBeneficiary(tx.beneficiary ?? "");
    setConfirmed(tx.confirmed);
  }

  function close() {
    setDate("");
    setAmount("");
    setAccountId("");
    setBeneficiary("");
    setConfirmed(true);
    setError(null);
    onClose();
  }

  async function save() {
    if (!tx) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          accountId,
          beneficiary: beneficiary.trim() || null,
          confirmed,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      router.refresh();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && tx && (
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
            className="w-full max-w-md surface p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Modifica entrata</h2>
              <button
                onClick={close}
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                  Importo (EUR)
                </label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">Conto</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji ?? "💳"} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                  Beneficiario / mittente
                </label>
                <input
                  type="text"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  placeholder="Es. Stipendio Courage"
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="size-4 accent-violet-500"
                />
                <span className="text-sm">
                  Già incassato
                  <span className="text-[var(--fg-subtle)] ml-1.5 text-xs">
                    (deselezionare se la entrata è programmata ma non ancora arrivata)
                  </span>
                </span>
              </label>
            </div>

            {error && (
              <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
              >
                <Save className="size-4" />
                {saving ? "Salvo…" : "Salva"}
              </button>
              <button
                onClick={close}
                className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
              >
                Annulla
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
