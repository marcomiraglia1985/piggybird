"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ExternalLink, Sparkles, X } from "lucide-react";
import { openExternal } from "@/lib/open-external";

/**
 * Badge versione + notifica di update. Posizionato nella sidebar accanto al
 * nome app. Mostra sempre "v{currentVersion}" e, se è disponibile una nuova
 * release su GitHub, aggiunge un pallino verde + on-click apre dialog con
 * release notes e bottone "Scarica".
 *
 * Polling: fetcha /api/check-update on mount + ogni 6h (evita request
 * eccessive ma resta abbastanza fresco).
 *
 * Modale via React Portal a document.body: la sidebar ha `backdrop-blur-xl`
 * che crea un containing block per `position: fixed`, quindi senza il portal
 * il modale verrebbe clippato dentro la sidebar (w-60) invece di riempire
 * il viewport.
 */

type CheckUpdateResponse = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  downloadName?: string | null;
  downloadSize?: number | null;
  info?: string;
  error?: string;
};

const POLL_MS = 6 * 60 * 60 * 1000;

export function VersionBadge({ currentVersion }: { currentVersion: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [info, setInfo] = useState<CheckUpdateResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    const fetchOnce = async () => {
      try {
        const r = await fetch("/api/check-update");
        if (!r.ok) return;
        const j = (await r.json()) as CheckUpdateResponse;
        if (!stopped) setInfo(j);
      } catch {
        /* silent */
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  const updateAvailable = !!info?.updateAvailable;

  return (
    <>
      {updateAvailable ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Aggiornamento disponibile: v${info?.latest}`}
          className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-[10px] font-semibold tracking-normal text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.25)] animate-[pulse_2s_ease-in-out_infinite]"
        >
          <Sparkles className="size-3" />
          <span>Nuova v{info?.latest} disponibile</span>
        </button>
      ) : (
        <span
          className="text-[10px] font-normal tracking-normal mt-1.5 inline-flex items-center gap-1 text-[var(--fg-subtle)]"
          title="Versione installata"
        >
          v{currentVersion}
        </span>
      )}

      {mounted && createPortal(
      <AnimatePresence>
        {open && info && info.updateAvailable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
                  <Sparkles className="size-5 text-emerald-400" />
                  Nuova versione di Piggybird
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--fg-muted)]">Tu hai</span>
                  <span className="font-mono">v{info.current}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-200">Disponibile</span>
                  <span className="font-mono font-semibold text-emerald-200">v{info.latest}</span>
                </div>
                {info.publishedAt && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-500/20">
                    <span className="text-[var(--fg-subtle)]">Pubblicata</span>
                    <span className="text-[var(--fg-muted)]">
                      {new Date(info.publishedAt).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>

              {info.releaseNotes && (
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
                    Cosa c&apos;è di nuovo
                  </label>
                  <div className="text-xs text-[var(--fg-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {info.releaseNotes}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {info.downloadUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(info.downloadUrl!)}
                    className="flex-1 h-10 rounded-lg bg-emerald-500 text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                  >
                    <Download className="size-4" />
                    Scarica
                    {info.downloadSize && (
                      <span className="text-[11px] opacity-80">
                        ({(info.downloadSize / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    )}
                  </button>
                )}
                {info.releaseUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(info.releaseUrl!)}
                    className="h-10 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm inline-flex items-center gap-1.5"
                  >
                    GitHub
                    <ExternalLink className="size-3.5" />
                  </button>
                )}
              </div>

              <p className="text-[10px] text-[var(--fg-subtle)] text-center">
                Dopo lo scaricamento, sostituisci la app vecchia con quella nuova
                trascinandola in /Applicazioni. I tuoi dati restano intatti.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </>
  );
}
