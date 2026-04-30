"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Snowflake, Activity, Info, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function FreezeToggle({
  initialFrozen,
  initialFrozenAt,
}: {
  initialFrozen: boolean;
  initialFrozenAt: string | null;
}) {
  const router = useRouter();
  const [frozen, setFrozen] = useState(initialFrozen);
  const [frozenAt] = useState(initialFrozenAt);
  const [busy, setBusy] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [confirmingUnfreeze, setConfirmingUnfreeze] = useState(false);
  const [confirmingFreeze, setConfirmingFreeze] = useState(false);

  async function setFrozenServer(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/freeze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frozen: next }),
      });
      if (res.ok) {
        setFrozen(next);
        // Notifica gli altri client component (es. Topbar, Sidebar) del
        // cambio così aggiornano lo stato senza un refresh manuale.
        try {
          window.dispatchEvent(
            new CustomEvent("fp-freeze-changed", { detail: { frozen: next } }),
          );
        } catch {}
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function onToggle() {
    if (busy) return;
    if (frozen) {
      // congelato → scongelato: conferma + reminder cosa cambia
      setConfirmingUnfreeze(true);
    } else {
      // scongelato → congelato: conferma + reminder cosa cambia
      setConfirmingFreeze(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-wrap">
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
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-2 w-80 z-30 surface p-3 shadow-xl border-violet-500/30"
              onMouseEnter={() => setTooltipOpen(true)}
              onMouseLeave={() => setTooltipOpen(false)}
            >
              <div className="text-xs space-y-2">
                <div className="font-semibold text-[var(--color-fg)] inline-flex items-center gap-1.5">
                  <Info className="size-3.5 text-violet-400" />
                  Modalità saldi congelati
                </div>
                <div className="space-y-1.5 text-[var(--color-fg-muted)] leading-relaxed">
                  {(() => {
                    const frozenBlock = (
                      <p key="frozen">
                        <strong className="text-cyan-300 inline-flex items-center gap-1">
                          <Snowflake className="size-3" />
                          Congelati
                        </strong>{" "}
                        — i saldi sono fissi alle cifre che hai inserito tu. Le
                        transazioni vengono comunque registrate ma non toccano i
                        saldi mostrati. Utile per: setup iniziale, fine-tuning,
                        riallineamenti manuali quando il flusso live non quadra.
                      </p>
                    );
                    const liveBlock = (
                      <p key="live">
                        <strong className="text-emerald-300 inline-flex items-center gap-1">
                          <Activity className="size-3" />
                          Live
                        </strong>{" "}
                        — i saldi si aggiornano automaticamente ad ogni nuovo
                        movimento (entrate, uscite, giroconti). Le modifiche manuali
                        al saldo sono <strong>disabilitate</strong>: per riprendere
                        il controllo a mano serve tornare in Congelati.
                      </p>
                    );
                    return frozen ? [frozenBlock, liveBlock] : [liveBlock, frozenBlock];
                  })()}
                  <p className="pt-1 border-t border-[var(--color-border)]/50 text-[10px] text-[var(--color-fg-subtle)]">
                    Forzando un saldo a mano (in Congelati) lo snapshot diventa
                    il nuovo punto di partenza per il live successivo.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title={frozen ? "Scongela: passa al saldo live" : "Congela: blocca i saldi sulla cifra attuale"}
        className={cn(
          "group inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50",
          frozen
            ? "bg-gradient-to-br from-cyan-500/[0.12] to-sky-500/[0.06] border-cyan-500/40 text-cyan-300 hover:border-cyan-500/60"
            : "bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.04] border-emerald-500/40 text-emerald-300 hover:border-emerald-500/60",
        )}
      >
        {frozen ? <Snowflake className="size-3.5" /> : <Activity className="size-3.5" />}
        <span>{frozen ? "Conti congelati" : "Saldi live"}</span>
        {/* Mini-switch visuale */}
        <span
          className={cn(
            "relative w-8 h-4 rounded-full border transition-colors",
            frozen
              ? "bg-cyan-500/20 border-cyan-500/40"
              : "bg-emerald-500/30 border-emerald-500/50",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full transition-all",
              frozen ? "left-0.5 bg-cyan-300" : "left-[18px] bg-emerald-300",
            )}
          />
        </span>
      </button>
      </div>

      {frozenAt && (
        <span className="text-[10px] text-[var(--color-fg-subtle)] tabular-nums">
          {frozen ? "snapshot: " : "live da: "}
          {new Date(frozenAt).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}

      {/* Dialog conferma freeze (live → congelato) */}
      <AnimatePresence>
        {confirmingFreeze && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !busy && setConfirmingFreeze(false)}
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
                  <Snowflake className="size-5 text-cyan-400" />
                  Congelare i saldi?
                </h2>
                <button
                  onClick={() => setConfirmingFreeze(false)}
                  disabled={busy}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="text-sm text-[var(--color-fg-muted)] space-y-2">
                <p>
                  I saldi correnti diventano lo <strong>snapshot fisso</strong>.
                  Da quel momento le nuove tx vengono comunque registrate, ma{" "}
                  <strong>non aggiornano i saldi mostrati</strong> finché non
                  torni in modalità Live.
                </p>
                <div className="rounded-md bg-[var(--color-surface-2)]/50 border border-[var(--color-border)] p-3 space-y-2">
                  <div className="text-xs">
                    <strong className="text-emerald-300">Cosa puoi fare:</strong>
                    <ul className="list-disc list-inside ml-1 mt-1 space-y-0.5 text-[12px]">
                      <li>Modificare i saldi a mano (rettifica)</li>
                      <li>Modificare/correggere tx esistenti</li>
                      <li>Cancellare tx storiche errate</li>
                      <li>Sistemare categorie, beneficiary, note, date</li>
                    </ul>
                  </div>
                  <div className="text-xs pt-1 border-t border-[var(--color-border)]/50">
                    <strong className="text-rose-300">Cosa NON puoi fare:</strong>
                    <ul className="list-disc list-inside ml-1 mt-1 space-y-0.5 text-[12px]">
                      <li>Aggiungere nuovi movimenti dal &quot;+ Aggiungi&quot;</li>
                      <li>Aggiungere trade o trasferimenti</li>
                      <li>Importare nuovi CSV/Excel</li>
                    </ul>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">
                  Ideale per: setup iniziale, riallineamenti manuali, fase di
                  pulizia dati. Per riprendere ad aggiungere tx, sblocca da qui.
                </p>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setConfirmingFreeze(false)}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={() => {
                    setConfirmingFreeze(false);
                    setFrozenServer(true);
                  }}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-cyan-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Snowflake className="size-4" />
                  Sì, congela
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog conferma unfreeze */}
      <AnimatePresence>
        {confirmingUnfreeze && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !busy && setConfirmingUnfreeze(false)}
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
                  <Activity className="size-5 text-emerald-400" />
                  Passa a saldi live?
                </h2>
                <button
                  onClick={() => setConfirmingUnfreeze(false)}
                  disabled={busy}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="text-sm text-[var(--color-fg-muted)] space-y-2">
                <p>
                  Da ora in poi i saldi conto si aggiorneranno automaticamente
                  ad ogni nuovo movimento. Le modifiche manuali ai saldi
                  saranno <strong>disabilitate</strong>.
                </p>
                <p>
                  Per riprendere il controllo a mano (es. correggere un saldo)
                  ti basta tornare in <strong>Conti congelati</strong> con lo
                  switch.
                </p>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">
                  Le tx già registrate prima di adesso restano "storiche" e
                  non vengono ri-processate. Solo i nuovi movimenti aggiornano
                  i saldi.
                </p>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setConfirmingUnfreeze(false)}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={() => {
                    setConfirmingUnfreeze(false);
                    setFrozenServer(false);
                  }}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-emerald-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Activity className="size-4" />
                  Sì, passa a Live
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
