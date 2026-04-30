"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, X, Percent, AlertTriangle, Archive } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function CointestatoEditButton({
  account,
}: {
  account: {
    id: string;
    name: string;
    ownershipShare: number;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(account.name);
  const [sharePct, setSharePct] = useState(
    Math.round(account.ownershipShare * 1000) / 10,
  );
  const [confirmClose, setConfirmClose] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const initialPct = Math.round(account.ownershipShare * 1000) / 10;
  const shareChanged = Math.abs(sharePct - initialPct) > 0.01;

  function reset() {
    setName(account.name);
    setSharePct(initialPct);
    setError(null);
    setConfirmClose(false);
  }

  function close() {
    if (saving || closing) return;
    reset();
    setOpen(false);
  }

  async function submit() {
    if (!name.trim()) {
      setError("Il nome è obbligatorio");
      return;
    }
    if (sharePct < 0 || sharePct > 100) {
      setError("La quota deve essere tra 0 e 100");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        ownershipShare: sharePct / 100,
      };
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Errore");
      const snap = j.snapshottedTxCount ?? 0;
      toast({
        title: "Cointestato aggiornato",
        description: shareChanged
          ? `Quota cambiata. ${snap} mov. storici tenuti alla vecchia quota.`
          : "Modifiche salvate.",
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function closeAccount() {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Errore");
      toast({
        title: "Conto chiuso",
        description: `${account.name} archiviato. I movimenti storici restano consultabili.`,
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setClosing(false);
      setConfirmClose(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Modifica cointestato"
        className="size-7 inline-flex items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
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
                className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
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
                      <Pencil className="size-5 text-violet-400" />
                      Modifica cointestato
                    </h2>
                    <button
                      onClick={close}
                      disabled={saving || closing}
                      className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <Field label="Nome">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
                    />
                  </Field>

                  <Field
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <Percent className="size-3 text-violet-400" />
                        Quota di proprietà
                      </span>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.1}
                        value={sharePct}
                        onChange={(e) => setSharePct(parseFloat(e.target.value) || 0)}
                        className="w-24 h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
                      />
                      <span className="text-sm text-[var(--color-fg-muted)]">%</span>
                      <div className="flex gap-1 ml-auto">
                        {[
                          { label: "1/2", v: 50 },
                          { label: "1/3", v: 33.3 },
                          { label: "2/3", v: 66.7 },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setSharePct(p.v)}
                            className="text-[11px] px-2 h-6 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-violet-500/40"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {shareChanged && (
                      <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-200 inline-flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>
                          La nuova quota vale solo per i movimenti{" "}
                          <strong>futuri</strong>. I movimenti storici restano
                          calcolati alla quota attuale ({initialPct}%).
                        </span>
                      </div>
                    )}
                  </Field>

                  <div className="border-t border-[var(--color-border)]/60 pt-4 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium">
                      Zona pericolosa
                    </div>
                    {!confirmClose ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClose(true)}
                        disabled={saving || closing}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-rose-500/30 text-rose-300 text-xs hover:bg-rose-500/10 transition-colors"
                      >
                        <Archive className="size-3.5" />
                        Chiudi conto cointestato
                      </button>
                    ) : (
                      <div className="rounded-md bg-rose-500/5 border border-rose-500/30 p-3 space-y-2">
                        <p className="text-xs text-[var(--color-fg-muted)]">
                          Il conto verrà archiviato (nascosto da liste e saldi).
                          I movimenti storici restano consultabili. Riapribile in
                          futuro.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmClose(false)}
                            disabled={closing}
                            className="h-8 px-3 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            onClick={closeAccount}
                            disabled={closing}
                            className="h-8 px-3 rounded-md bg-rose-500 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Archive className="size-3.5" />
                            {closing ? "Chiudo…" : "Sì, chiudi"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center gap-2 justify-end pt-2">
                    <button
                      onClick={close}
                      disabled={saving || closing}
                      className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={submit}
                      disabled={saving || closing || !name.trim()}
                      className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
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
