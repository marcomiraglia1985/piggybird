"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  X,
  FileText,
} from "lucide-react";

type SupportedBroker = { name: string; platform: string };
type Summary = {
  platform: string;
  total: number;
  inserted: number;
  skipped: number;
};
type DbStat = { platform: string; count: number };

/**
 * Pulsante + dialog popup per importare trade stock via CSV.
 * Universal: lista i broker supportati dal backend, mostra le piattaforme
 * già importate con conteggio eventi, permette upload + delete-by-platform.
 *
 * Nessun broker hardcodato — il backend (`/api/integrations/stock-trades/import`)
 * espone la lista `supported` via GET. Per supportare un nuovo broker basta
 * aggiungere il parser server-side e l'utente lo vedrà qui automaticamente.
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
  const [supported, setSupported] = useState<SupportedBroker[]>([]);
  const [stats, setStats] = useState<DbStat[]>([]);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  async function loadStatus() {
    try {
      const sup = await fetch("/api/integrations/stock-trades/import").then(
        (r) => r.json(),
      );
      setSupported(sup.supported ?? []);
      const s = await fetch("/api/integrations/stock-trades/stats").then((r) =>
        r.json(),
      );
      setStats(s.byPlatform ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (open) loadStatus();
  }, [open]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setLastResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/integrations/stock-trades/import", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import fallito");
      } else {
        setLastResult(data);
        await loadStatus();
        router.refresh();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePlatform(platform: string) {
    const count = stats.find((s) => s.platform === platform)?.count ?? 0;
    const ok = confirm(
      `Cancellare TUTTI i ${count} trade della platform "${platform}"? Re-importabile dal CSV.`,
    );
    if (!ok) return;
    await fetch(
      `/api/integrations/stock-trades/import?platform=${encodeURIComponent(platform)}`,
      { method: "DELETE" },
    );
    await loadStatus();
    router.refresh();
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
                    Per i broker stock senza API (Revolut, Trade212, ecc.) i
                    BUY/SELL si aggiornano via CSV export. Trascina il file qui
                    sotto: il broker viene riconosciuto automaticamente dal
                    formato.
                  </p>

                  {/* Broker supportati */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
                      Broker riconosciuti automaticamente
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {supported.length === 0 ? (
                        <span className="text-[11px] text-[var(--fg-subtle)] italic">
                          Caricamento…
                        </span>
                      ) : (
                        supported.map((b) => (
                          <span
                            key={b.platform}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px]"
                          >
                            {b.name}
                          </span>
                        ))
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--fg-subtle)] italic">
                      Altri broker si aggiungono dal backend (parser dedicato).
                    </p>
                  </div>

                  {/* Upload */}
                  <label
                    className={`flex items-center justify-center gap-2 h-12 rounded-lg text-sm font-medium border-2 border-dashed cursor-pointer transition-colors ${
                      uploading
                        ? "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-subtle)] cursor-wait"
                        : "bg-violet-500/[0.06] border-violet-500/40 text-violet-300 hover:bg-violet-500/[0.12] hover:border-violet-500/70"
                    }`}
                  >
                    <Upload className="size-4" />
                    {uploading ? "Importazione…" : "Trascina o seleziona CSV"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={onUpload}
                      disabled={uploading}
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

                  {/* Stats per broker già importato */}
                  {stats.length > 0 && (
                    <div className="space-y-1.5 border-t border-[var(--border)]/60 pt-4">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
                        Già importati
                      </p>
                      {stats.map((s) => (
                        <div
                          key={s.platform}
                          className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 px-3 py-2 text-xs"
                        >
                          <span>
                            <strong>{s.platform}</strong>{" "}
                            <span className="text-[var(--fg-subtle)] tabular-nums">
                              · {s.count} eventi
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => deletePlatform(s.platform)}
                            className="size-7 inline-flex items-center justify-center rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10"
                            title={`Cancella tutti i trade ${s.platform}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))}
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
