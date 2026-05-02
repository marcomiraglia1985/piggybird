"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
} from "lucide-react";

type Summary = {
  platform: string;
  total: number;
  inserted: number;
  skipped: number;
};

type InvestmentAccount = {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
};

/**
 * Pulsante + dialog popup per importare trade stock via CSV.
 *
 * Flow utente:
 *   1. Sceglie a quale conto investimento si riferisce il CSV
 *   2. Trascina/seleziona il file
 *   3. Backend rileva il formato del broker e fa upsert deduplicato
 *
 * Niente auto-detection visibile né lista "Già importati" nel UI: l'idea è
 * che sia l'utente a dire dove va il CSV, in modo prevedibile.
 */
export function StockTradesImportDialog({
  triggerLabel = "↗ Trade stock senza API: importa CSV",
  triggerClassName,
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  async function loadAccounts() {
    try {
      const r = await fetch("/api/accounts");
      const j = await r.json();
      const all: InvestmentAccount[] = j.accounts ?? [];
      const list = all.filter((a) => a.type === "investment");
      setAccounts(list);
      if (list.length === 1) setSelectedAccountId(list[0].id);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (open) loadAccounts();
  }, [open]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedAccountId) {
      setError("Seleziona prima il conto investimento di destinazione.");
      return;
    }
    setUploading(true);
    setError(null);
    setLastResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("accountId", selectedAccountId);
      const res = await fetch("/api/integrations/stock-trades/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import fallito");
      } else {
        setLastResult(data);
        router.refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function close() {
    if (uploading) return;
    setOpen(false);
    setError(null);
    setLastResult(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "text-[10px] text-[var(--fg-subtle)] hover:text-violet-400 transition-colors"
        }
        title="Importa trade da CSV per i broker stock senza API (Revolut, Trade212, ecc.)"
      >
        {triggerLabel}
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
                  className="w-full max-w-lg surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                      <FileText className="size-5 text-emerald-400" />
                      Import trade da CSV
                    </h2>
                    <button
                      onClick={close}
                      disabled={uploading}
                      className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
                    Per i broker stock senza API i BUY/SELL si aggiornano via
                    CSV export. Trascina il file qui sotto:
                  </p>

                  {/* Selettore conto investimento di destinazione */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium block">
                      Conto investimento di destinazione
                    </label>
                    {accounts.length === 0 ? (
                      <p className="text-[11px] text-[var(--fg-subtle)] italic">
                        Nessun conto investimento attivo. Creane uno da Conti →
                        Aggiungi → Investimento.
                      </p>
                    ) : (
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        disabled={uploading}
                        className="w-full h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                      >
                        <option value="">Scegli un conto…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.emoji ? `${a.emoji} ` : ""}
                            {a.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Upload */}
                  <label
                    className={`flex items-center justify-center gap-2 h-12 rounded-lg text-sm font-medium border-2 border-dashed transition-colors ${
                      !selectedAccountId || uploading
                        ? "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-subtle)] cursor-not-allowed"
                        : "bg-violet-500/[0.06] border-violet-500/40 text-violet-300 hover:bg-violet-500/[0.12] hover:border-violet-500/70 cursor-pointer"
                    }`}
                  >
                    <Upload className="size-4" />
                    {uploading
                      ? "Importazione…"
                      : selectedAccountId
                        ? "Trascina o seleziona CSV"
                        : "Seleziona prima il conto"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={onUpload}
                      disabled={uploading || !selectedAccountId}
                      className="hidden"
                    />
                  </label>

                  {lastResult && (
                    <div className="inline-flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-xs w-full">
                      <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium text-emerald-300">
                          Import {lastResult.platform} completato
                        </div>
                        <div className="text-[var(--fg-muted)] mt-0.5">
                          {lastResult.total} eventi totali ·{" "}
                          <strong>{lastResult.inserted}</strong> nuovi ·{" "}
                          {lastResult.skipped} già presenti (deduplicati)
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="inline-flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/[0.08] p-3 text-xs w-full">
                      <AlertTriangle className="size-3.5 text-rose-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium text-rose-300">
                          Import fallito
                        </div>
                        <div className="text-[var(--fg-muted)] mt-0.5">{error}</div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
