"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Repeat, X, Check, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { formatEUR, formatDate, cn } from "@/lib/utils";

type Candidate = {
  id: string;
  date: string;
  amount: number;
  beneficiary: string | null;
  categoryName: string | null;
  categoryEmoji: string | null;
};

export function RentRecurrenceCard({
  estateId,
  estateName,
  holding,
  hasRecurrence,
  recurrenceGroupId,
  nextPaymentDate,
  actualMonthlyRent,
  candidates,
}: {
  estateId: string;
  estateName: string;
  holding: string;
  hasRecurrence: boolean;
  recurrenceGroupId: string | null;
  nextPaymentDate: string | null;
  actualMonthlyRent: number | null;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRented = holding === "rented";
  const verbActor = isRented ? "paghi" : "incassi";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (selected.size < 2) {
      setError("Seleziona almeno 2 movimenti per individuare il pattern di ricorrenza");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/recurrence-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txIds: [...selected] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore");
      }
      setOpen(false);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setApplying(false);
    }
  }

  // === Caso 1: ricorrenza già attiva ===
  if (hasRecurrence) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-[var(--color-surface)] to-emerald-500/[0.02] p-4 flex items-center gap-3 flex-wrap">
        <span className="size-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <Repeat className="size-5 text-emerald-300" />
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-medium text-emerald-200 inline-flex items-center gap-1.5">
            <Check className="size-3.5" />
            Affitto ricorrente attivo
          </div>
          <div className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            {nextPaymentDate
              ? `Prossimo pagamento atteso: ${formatDate(new Date(nextPaymentDate), {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}`
              : "Nessuna occorrenza futura — la ricorrenza potrebbe essere scaduta"}
          </div>
        </div>
        <Link
          href="/movimenti/ricorrenze"
          className="text-xs text-emerald-300 hover:underline inline-flex items-center gap-1"
        >
          Gestisci ricorrenze
          <ChevronRight className="size-3" />
        </Link>
      </div>
    );
  }

  // === Caso 2: nessuna ricorrenza, ma ci sono candidati → CTA "Collega" ===
  if (candidates.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 flex items-start gap-3">
        <span className="size-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
          <Repeat className="size-5 text-[var(--color-fg-muted)]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Affitto ricorrente</div>
          <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            Non hai ancora movimenti di affitto collegati a questo immobile. Quando
            registrerai un pagamento ({verbActor} affitto), torna qui e potrai
            marcarlo come ricorrente per popolare il cashflow futuro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/[0.10] via-[var(--color-surface)] to-amber-500/[0.04] p-4 hover:border-amber-500/60 hover:from-amber-500/[0.15] transition-colors group flex items-center gap-3 flex-wrap"
      >
        <span className="size-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Repeat className="size-5 text-amber-300" />
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-medium text-amber-200 inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" />
            Affitto non marcato come ricorrente
          </div>
          <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
            Hai {candidates.length} pagament{candidates.length === 1 ? "o" : "i"} di affitto registrat{candidates.length === 1 ? "o" : "i"} ma non ricorrenti. Click per
            marcarli e popolare il cashflow futuro a {actualMonthlyRent
              ? formatEUR(actualMonthlyRent)
              : "—"}/mese (mediana reale).
          </p>
        </div>
        <span className="text-xs text-amber-300 inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
          Collega
          <ChevronRight className="size-3" />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !applying && setOpen(false)}
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
                  <Repeat className="size-5 text-violet-400" />
                  Marca affitto come ricorrente
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  disabled={applying}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Seleziona i pagamenti di affitto storici che formano il pattern
                  ricorrente per <strong>{estateName}</strong>. Servono almeno 2 occorrenze
                  per dedurre la frequenza (mensile / trimestrale / ecc.). Il sistema
                  genererà automaticamente 12 mesi di pagamenti futuri usando l'importo
                  mediano e la frequenza dedotta.
                </p>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">
                  Tip: salta i pagamenti irregolari (es. arretrati cumulati) e seleziona
                  solo quelli che rappresentano il pattern normale.
                </p>
              </div>

              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto -mx-2 px-2">
                {candidates.map((c) => {
                  const isSel = selected.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                        isSel
                          ? "bg-violet-500/[0.10] border-violet-500/40"
                          : "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(c.id)}
                        className="size-4 accent-violet-500"
                      />
                      <span className="size-8 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-base shrink-0">
                        {c.categoryEmoji ?? "🏠"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {c.beneficiary || c.categoryName || "—"}
                        </div>
                        <div className="text-[11px] text-[var(--color-fg-subtle)]">
                          {formatDate(new Date(c.date), {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums shrink-0",
                          c.amount > 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {c.amount > 0 ? "+" : ""}
                        {formatEUR(c.amount)}
                      </span>
                    </label>
                  );
                })}
              </div>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-between pt-2 gap-2">
                <span className="text-xs text-[var(--color-fg-muted)]">
                  {selected.size} selezionati
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={applying}
                    className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={apply}
                    disabled={applying || selected.size < 2}
                    className="h-9 px-4 rounded-lg bg-violet-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {applying ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Marco…
                      </>
                    ) : (
                      <>
                        <Repeat className="size-4" />
                        Marca come ricorrente
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
