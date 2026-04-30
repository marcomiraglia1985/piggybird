"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bug, Loader2, ExternalLink, X, Check, AlertTriangle } from "lucide-react";

/**
 * Sezione "Manda snapshot di debug" in /impostazioni → Sistema.
 *
 * Flusso:
 *   1. User clicca "Mandami uno snapshot" → modal di conferma
 *   2. Modal: privacy disclosure forte + textarea opzionale per descrivere
 *      il problema
 *   3. Submit → POST /api/debug-snapshot → upload DB.gz + crea Issue
 *   4. Modal mostra success con link all'issue (per condividerlo se servono
 *      ulteriori dettagli via Slack/email)
 */
export function DebugSnapshotSection() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ issueUrl: string; issueNumber: number; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/debug-snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Errore");
      setResult({
        issueUrl: j.issueUrl,
        issueNumber: j.issueNumber,
        sizeBytes: j.sizeBytes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    // Reset state quando si chiude (così la prossima apertura è pulita)
    setTimeout(() => {
      setMessage("");
      setResult(null);
      setError(null);
    }, 300);
  }

  return (
    <>
      <div className="surface p-4 space-y-3 max-w-md">
        <div className="flex items-center gap-2">
          <Bug className="size-4 text-rose-400" />
          <h3 className="text-sm font-medium">Snapshot di debug</h3>
        </div>
        <p className="text-[11px] text-[var(--fg-subtle)] leading-relaxed">
          Hai trovato un bug? Manda uno snapshot del tuo database al developer per
          aiutare a riprodurlo. Include una copia compressa del tuo DB e il tuo
          profilo. <strong>Niente viene inviato senza il tuo click.</strong>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-8 px-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200 hover:bg-rose-500/25 inline-flex items-center gap-1.5 font-medium"
        >
          <Bug className="size-3.5" />
          Mandami uno snapshot
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => !submitting && close()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight inline-flex items-center gap-2">
                  <Bug className="size-5 text-rose-400" />
                  Manda snapshot di debug
                </h2>
                <button
                  onClick={close}
                  disabled={submitting}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              {!result ? (
                <>
                  <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 leading-relaxed inline-flex items-start gap-2">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <div>
                      <strong>Cosa viene inviato:</strong> una copia compressa del tuo
                      database (movimenti, conti, ecc.) + le info del tuo profilo
                      (nome, email, paesi, demografica). I tuoi dati finanziari saranno
                      visibili al developer per riprodurre il bug.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
                      Descrivi il problema (opzionale)
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      placeholder="Es. Quando clicco 'Auto-categorize' la app si freeza. Provato 3 volte stesso risultato."
                      className="w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-violet-500/50 resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center gap-2 justify-end pt-2">
                    <button
                      onClick={close}
                      disabled={submitting}
                      className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={submit}
                      disabled={submitting}
                      className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Invio in corso…
                        </>
                      ) : (
                        <>
                          <Bug className="size-4" />
                          Conferma e invia
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // === SUCCESS ===
                <div className="space-y-3">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 inline-flex items-start gap-2">
                    <Check className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-200">
                        Snapshot inviato!
                      </p>
                      <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                        Issue #{result.issueNumber} creato sul repo del developer (
                        {(result.sizeBytes / 1024).toFixed(0)} KB compressi).
                      </p>
                    </div>
                  </div>

                  <a
                    href={result.issueUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full h-10 rounded-lg bg-violet-500 text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-violet-600 transition-colors"
                  >
                    Vedi l&apos;issue su GitHub
                    <ExternalLink className="size-4" />
                  </a>

                  <button
                    onClick={close}
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                  >
                    Chiudi
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
