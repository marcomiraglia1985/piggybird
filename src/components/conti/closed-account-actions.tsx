"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArchiveRestore, Trash2, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function ClosedAccountActions({
  accountId,
  accountName,
  txCount,
}: {
  accountId: string;
  accountName: string;
  txCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function reopen() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (res.ok) {
        toast({ title: "Conto riaperto", variant: "success" });
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: "Errore riapertura",
          description: j?.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Errore riapertura",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteForever() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteOpen(false);
        toast({ title: "Conto cancellato", variant: "success" });
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: "Errore cancellazione",
          description: j?.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Errore cancellazione",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={reopen}
        disabled={busy}
        title="Riapri conto: torna tra gli attivi e tornerà visibile nei picker"
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
      >
        <ArchiveRestore className="size-3" />
        Riapri
      </button>
      {txCount === 0 && (
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={busy}
          title="Cancella definitivamente (solo per conti con 0 movimenti)"
          className="inline-flex items-center justify-center size-7 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="size-3" />
        </button>
      )}

      {mounted &&
        createPortal(
          <AnimatePresence>
            {deleteOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => !busy && setDeleteOpen(false)}
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
                  <Trash2 className="size-5 text-rose-400" />
                  Cancellare definitivamente?
                </h2>
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={busy}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
                <div className="text-sm font-medium">{accountName}</div>
                <div className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">
                  0 movimenti collegati
                </div>
              </div>
              <div
                className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs"
                style={{ color: "var(--color-rose-text)" }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Operazione irreversibile</div>
                    <div
                      className="text-[11px] mt-1"
                      style={{ color: "var(--color-rose-text-soft)" }}
                    >
                      Il conto sparisce dal database. Sicuro? È disponibile solo per
                      conti senza movimenti collegati.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={deleteForever}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {busy ? "Cancello…" : "Cancella"}
                </button>
              </div>
            </motion.div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
