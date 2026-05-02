"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { AIButton, AIBadge } from "@/components/ui/ai-button";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { useToast } from "@/components/ui/toast";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { formatCostEur } from "@/lib/ai-pricing";
import { CategoryPicker } from "./category-picker";

type Category = {
  id: string;
  emoji: string;
  name: string;
  type: string;
  group: string;
  estateId?: string | null;
};

type Estate = { id: string; name: string; emoji: string | null };

type Suggestion = {
  txId: string;
  date: string;
  amount: number;
  beneficiary: string;
  notes: string;
  accountName: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryEmoji: string | null;
  suggestedCategoryName: string | null;
  suggestedEstateName: string | null;
  suggestedEstateEmoji: string | null;
  confidence: number;
  reasoning: string;
};

/** Builds full label "🔨 Manutenzione · 🏠 Paris" for estate-linked categories. */
function categoryLabel(c: Category, estates: Estate[]): string {
  const estate = c.estateId ? estates.find((e) => e.id === c.estateId) : null;
  if (estate) {
    return `${c.emoji} ${c.name} · ${estate.emoji ?? "🏠"} ${estate.name}`;
  }
  return `${c.emoji} ${c.name}`;
}

/**
 * Stima i secondi che Claude impiegherà a categorizzare `n` movimenti.
 * Empirico: Sonnet ~80 token/sec, ~50 token output/tx + ~5s overhead.
 */
function estimateSeconds(n: number): number {
  return Math.ceil(5 + n * 0.6);
}

function formatSeconds(s: number): string {
  if (s < 60) return `~${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `~${m}min`;
  return `~${m}m ${r}s`;
}

function formatAge(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "qualche secondo";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h < 24) return r === 0 ? `${h}h` : `${h}h ${r}m`;
  return `${Math.floor(h / 24)}g`;
}

/** Normalizza beneficiary per raggruppamento: lowercase + collassa spazi. */
function normalizeBeneficiary(b: string): string {
  return b.trim().toLowerCase().replace(/\s+/g, " ");
}

type EditableSuggestion = Suggestion & {
  selected: boolean;
  /** Se l'utente ha overridato la categoria suggerita */
  overrideCategoryId: string | null;
};

const STORAGE_KEY = "fp-autocategorize-pending";

type StoredSession = {
  suggestions: EditableSuggestion[];
  cost: number | null;
  info: string | null;
  savedAt: number;
};

export function AutoCategorizeButton({
  categories,
  estates = [],
}: {
  categories: Category[];
  estates?: Estate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"choose" | "loading" | "review">("choose");
  const [nullCount, setNullCount] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<EditableSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [pickedLimit, setPickedLimit] = useState<number | null>(null);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingStartRef = useRef<number | null>(null);

  // Tick ogni 500ms mentre stiamo caricando, per aggiornare counter + progress
  useEffect(() => {
    if (stage !== "loading") return;
    loadingStartRef.current = Date.now();
    setLoadingElapsed(0);
    const id = setInterval(() => {
      if (loadingStartRef.current) {
        setLoadingElapsed((Date.now() - loadingStartRef.current) / 1000);
      }
    }, 500);
    return () => clearInterval(id);
  }, [stage]);

  // Persisti i suggerimenti su ogni cambio così l'utente può chiudere il
  // modal e riaprirlo senza rilanciare l'AI. Cleared al successful apply.
  useEffect(() => {
    if (stage !== "review" || !suggestions || suggestions.length === 0) return;
    try {
      const data: StoredSession = {
        suggestions,
        cost,
        info,
        savedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [stage, suggestions, cost, info]);

  async function openModal() {
    setOpen(true);
    setError(null);

    // Restore: se c'è una sessione in review non ancora applicata, riprendila
    // così l'utente non perde le decisioni e non rilancia un'altra call AI.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredSession;
        const ageMs = Date.now() - stored.savedAt;
        const fresh = ageMs < 24 * 60 * 60 * 1000;
        if (fresh && stored.suggestions.length > 0) {
          setSuggestions(stored.suggestions);
          setCost(stored.cost);
          setInfo(`📥 Sessione precedente ripristinata · ${formatAge(ageMs)} fa`);
          setStage("review");
          return;
        }
        // Stale o vuota: pulisco
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}

    setStage("choose");
    setInfo(null);
    setSuggestions(null);
    // Quick count fetch (niente AI)
    try {
      const res = await fetch("/api/ai/categorize-transactions");
      const data = await res.json();
      setNullCount(data.count ?? 0);
    } catch {
      setNullCount(null);
    }
  }

  async function runWithLimit(limit: number) {
    setPickedLimit(limit);
    setStage("loading");
    setError(null);
    setInfo(null);
    setSuggestions(null);
    try {
      const res = await fetch("/api/ai/categorize-transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (
          typeof data.error === "string" &&
          data.error.includes("Nessuna API key")
        ) {
          setError("AI non configurata");
          setInfo(
            "Vai in Impostazioni → Funzioni AI per inserire la tua API key Anthropic.",
          );
          setStage("review");
          return;
        }
        setError(data.error ?? "Errore");
        setStage("review");
        return;
      }
      if (data.info) setInfo(data.info);
      setCost(data.cost ?? null);
      setSuggestions(
        (data.suggestions as Suggestion[]).map((s) => ({
          ...s,
          selected: s.suggestedCategoryId != null && s.confidence >= 0.6,
          overrideCategoryId: null,
        })),
      );
      setStage("review");
    } catch (e) {
      setError(String(e));
      setStage("review");
    }
  }

  /** Chiude solo l'overlay UI. NON cancella i suggerimenti dallo storage —
   *  così se l'utente riapre, riprende esattamente da dove aveva lasciato. */
  function close() {
    setOpen(false);
    setSuggestions(null);
    setError(null);
    setInfo(null);
    setCost(null);
    setStage("choose");
  }

  /** Click sul backdrop: in review NON chiudere (per non perdere il lavoro
   *  per sbaglio). In altre stage si comporta come prima. */
  function onBackdropClick() {
    if (stage === "review" && suggestions && suggestions.length > 0) return;
    close();
  }

  /** "Annulla" esplicito: in review chiede conferma e cancella la sessione.
   *  Negli altri stage chiude e basta. */
  function explicitCancel() {
    if (stage === "review" && suggestions && suggestions.length > 0) {
      if (
        !confirm(
          "Scartare i suggerimenti? Per ottenerli di nuovo dovrai rilanciare l'AI.",
        )
      )
        return;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    close();
  }

  function toggleRow(txId: string) {
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            s.txId === txId ? { ...s, selected: !s.selected } : s,
          )
        : prev,
    );
  }

  function setOverride(txId: string, categoryId: string | null) {
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            s.txId === txId
              ? {
                  ...s,
                  overrideCategoryId: categoryId,
                  selected: categoryId !== null || s.suggestedCategoryId !== null,
                }
              : s,
          )
        : prev,
    );
  }

  /** Override categoria per TUTTI i tx ID passati. Usato dal GroupHeader col
   *  bulk dropdown — riceve gli ID specifici, evitando mismatch di
   *  normalizzazione (es. "(beneficiary vuoto)" vs ""). */
  function setOverrideForTxIds(txIds: string[], categoryId: string | null) {
    const idSet = new Set(txIds);
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            idSet.has(s.txId)
              ? {
                  ...s,
                  overrideCategoryId: categoryId,
                  selected: categoryId !== null || s.suggestedCategoryId !== null,
                }
              : s,
          )
        : prev,
    );
  }

  /** Toggle selezione di tutti i tx ID passati. */
  function toggleSelectionForTxIds(txIds: string[], nextSelected: boolean) {
    const idSet = new Set(txIds);
    setSuggestions((prev) =>
      prev
        ? prev.map((s) =>
            idSet.has(s.txId) ? { ...s, selected: nextSelected } : s,
          )
        : prev,
    );
  }

  async function apply() {
    if (!suggestions) return;
    const toApply = suggestions
      .filter((s) => s.selected)
      .map((s) => ({
        txId: s.txId,
        categoryId: s.overrideCategoryId ?? s.suggestedCategoryId,
      }))
      .filter((s) => s.categoryId !== null);

    if (toApply.length === 0) {
      toast({
        title: "Nessuna categoria selezionata",
        variant: "info",
      });
      return;
    }

    // Warning collettivo: se l'utente sta applicando suggerimenti con
    // confidence < 0.5 (rischio match sbagliato), chiedo conferma una volta
    // sola invece di per riga. Niente warning per le tx con override
    // manuale (utente ha scelto esplicitamente la categoria).
    const lowConf = suggestions.filter(
      (s) =>
        s.selected &&
        s.overrideCategoryId === null &&
        s.suggestedCategoryId !== null &&
        s.confidence < 0.5,
    );
    if (lowConf.length > 0) {
      const ok = confirm(
        `Stai applicando ${lowConf.length} ${
          lowConf.length === 1
            ? "suggerimento con confidence bassa (<50%)"
            : "suggerimenti con confidence bassa (<50%)"
        }. Procedere?`,
      );
      if (!ok) return;
    }

    setApplying(true);
    try {
      // Group by categoryId (bulk endpoint accetta una categoria per call)
      const byCat = new Map<string, string[]>();
      for (const item of toApply) {
        const arr = byCat.get(item.categoryId!) ?? [];
        arr.push(item.txId);
        byCat.set(item.categoryId!, arr);
      }
      // Parallel PATCH con allSettled: anche se una batch fallisce, le altre
      // vanno avanti. Riportiamo successi + falliti all'utente.
      const settled = await Promise.allSettled(
        Array.from(byCat.entries()).map(([catId, ids]) =>
          fetch("/api/transactions/bulk", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids, data: { categoryId: catId } }),
          }).then(async (r) => {
            const json = await r.json().catch(() => ({}));
            if (!r.ok) {
              throw new Error(json.error ?? `HTTP ${r.status}`);
            }
            return json;
          }),
        ),
      );
      let totalUpdated = 0;
      const failures: string[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled") {
          totalUpdated += s.value.updated ?? 0;
        } else {
          failures.push(
            s.reason instanceof Error ? s.reason.message : String(s.reason),
          );
        }
      }
      if (failures.length > 0) {
        toast({
          title: `Applicato parziale: ${totalUpdated} ok, ${failures.length} falliti`,
          description: failures[0]?.slice(0, 120),
          variant: "error",
        });
      } else {
        toast({
          title: "Categorie applicate",
          description: `${totalUpdated} movimenti aggiornati.`,
          variant: "success",
        });
      }
      // Apply riuscito → la sessione è "chiusa", pulisco lo storage
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      close();
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  }

  const selectedCount = suggestions?.filter((s) => s.selected).length ?? 0;

  return (
    <>
      <AIButton onClick={openModal} variant="subtle" size="sm">
        Auto-categorize
      </AIButton>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onBackdropClick}
        >
          <div
            className="surface w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--border)]">
              <div>
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <AIBadge />
                  Auto-categorize
                </h2>
                <p className="text-xs text-[var(--fg-muted)] mt-1">
                  Suggerimenti generati da Piggybird basati sui tuoi pattern
                  storici. Rivedi e modifica prima di applicare.
                </p>
              </div>
              <button
                onClick={close}
                title={
                  stage === "review" && suggestions && suggestions.length > 0
                    ? "Chiudi senza perdere il lavoro — riapri quando vuoi"
                    : "Chiudi"
                }
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {stage === "choose" && (
                <ChooseStep
                  count={nullCount}
                  onPick={runWithLimit}
                />
              )}

              {stage === "loading" && (
                <LoadingStep
                  limit={pickedLimit ?? 0}
                  elapsed={loadingElapsed}
                />
              )}

              {stage === "review" && error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/[0.08] p-3 text-sm flex items-start gap-2">
                  <AlertCircle className="size-4 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-rose-300">{error}</div>
                    {info && (
                      <p className="text-xs text-[var(--fg-muted)] mt-1">
                        {info}{" "}
                        <a
                          href="/impostazioni"
                          className="text-orange-400 underline inline-flex items-center gap-0.5"
                        >
                          Apri impostazioni
                          <ExternalLink className="size-3" />
                        </a>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {stage === "review" && !error && suggestions && suggestions.length === 0 && (
                <div className="py-12 text-center space-y-2">
                  <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
                  <p className="text-sm font-medium">Tutto a posto!</p>
                  <p className="text-xs text-[var(--fg-muted)]">
                    {info ?? "Nessun movimento senza categoria da analizzare."}
                  </p>
                </div>
              )}

              {stage === "review" && suggestions && suggestions.length > 0 && (
                <>
                  <SuggestionsList
                    suggestions={suggestions}
                    categories={categories}
                    estates={estates}
                    onToggle={toggleRow}
                    onOverride={setOverride}
                    onGroupOverride={setOverrideForTxIds}
                    onGroupToggle={toggleSelectionForTxIds}
                  />
                  <AiDisclaimer className="mt-4" />
                </>
              )}
            </div>

            {stage === "review" && suggestions && suggestions.length > 0 && (
              <div className="p-4 border-t border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-[var(--fg-muted)] flex items-center gap-3">
                  <span>
                    <strong>{selectedCount}</strong> di {suggestions.length}{" "}
                    selezionati
                  </span>
                  {cost != null && (
                    <span className="text-[var(--fg-subtle)]">
                      · costo chiamata: {formatCostEur(cost)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={explicitCancel}
                    disabled={applying}
                    className="h-9 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm hover:border-[var(--border-strong)]"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={apply}
                    disabled={applying || selectedCount === 0}
                    className="h-9 px-4 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white text-sm font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 disabled:opacity-50 disabled:shadow-none"
                  >
                    {applying
                      ? "Applico…"
                      : `Applica ${selectedCount} categori${selectedCount === 1 ? "a" : "e"}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LoadingStep({ limit, elapsed }: { limit: number; elapsed: number }) {
  const estimated = estimateSeconds(limit);
  // Cap progress al 95% finché non arriva la response (poi il parent passa a "review")
  const ratio = estimated > 0 ? Math.min(elapsed / estimated, 0.95) : 0;
  const pct = Math.round(ratio * 100);
  const elapsedSec = Math.floor(elapsed);
  const remaining = Math.max(estimated - elapsedSec, 0);
  const overrun = elapsedSec > estimated;

  return (
    <div className="py-10 text-center space-y-5">
      <div className="size-10 mx-auto rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
      <div className="space-y-1">
        <p className="text-sm text-[var(--fg-muted)]">
          Piggybird sta analizzando {limit} movimenti…
        </p>
        <p className="text-[11px] text-[var(--fg-subtle)] tabular-nums">
          {formatSeconds(elapsedSec)} di {formatSeconds(estimated)}{" "}
          {overrun ? (
            <span className="text-amber-400">
              · stima superata, ancora un attimo
            </span>
          ) : (
            <span>· ~{formatSeconds(remaining).replace("~", "")} rimanenti</span>
          )}
        </p>
      </div>
      <div className="max-w-md mx-auto">
        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-[var(--fg-subtle)] mt-1.5 tabular-nums">
          {pct}%
        </p>
      </div>
    </div>
  );
}

function ChooseStep({
  count,
  onPick,
}: {
  count: number | null;
  onPick: (limit: number) => void;
}) {
  if (count === null) {
    return (
      <div className="py-12 text-center">
        <div className="size-8 mx-auto rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
        <p className="text-sm font-medium">Tutto a posto!</p>
        <p className="text-xs text-[var(--fg-muted)]">
          Nessun movimento senza categoria.
        </p>
      </div>
    );
  }

  // Costo stimato: 1500 token base + ~80/tx input + ~50/tx output, sonnet
  function estimateCost(n: number): string {
    const inTok = 1500 + n * 80;
    const outTok = n * 50;
    const usd = (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15;
    const eur = usd * 0.92;
    if (eur < 0.01) return "< €0.01";
    return `~€${eur.toFixed(eur < 1 ? 3 : 2)}`;
  }

  const options: Array<{ label: string; value: number; disabled?: boolean }> = [
    { label: "50", value: 50, disabled: count < 1 },
    { label: "100", value: 100, disabled: count < 1 },
    { label: "250", value: 250, disabled: count < 1 },
    { label: "500", value: 500, disabled: count < 1 },
  ];
  // "Tutti" appare solo se count è strettamente sotto 500 e diverso dalle opzioni
  const showAll =
    count > 0 &&
    count < 500 &&
    !options.some((o) => o.value === count);

  return (
    <div className="py-6 space-y-5">
      <div className="text-center space-y-1">
        <p className="text-3xl font-semibold tabular-nums">{count}</p>
        <p className="text-sm text-[var(--fg-muted)]">
          {count === 1 ? "movimento senza categoria" : "movimenti senza categoria"}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] text-center">
          Quanti analizzare adesso?
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {options.map((o) => {
            const effective = Math.min(o.value, count);
            const disabled = o.disabled || count === 0;
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                onClick={() => onPick(o.value)}
                className={cn(
                  "rounded-lg border p-3 text-center transition-colors",
                  "border-[var(--border)] bg-[var(--surface-2)]/40",
                  "hover:border-orange-500/50 hover:bg-orange-500/[0.06]",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                <div className="text-xl font-semibold">{Math.min(o.value, count)}</div>
                <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5 tabular-nums">
                  {estimateCost(effective)} · {formatSeconds(estimateSeconds(effective))}
                </div>
              </button>
            );
          })}
        </div>
        {showAll && (
          <button
            type="button"
            onClick={() => onPick(count)}
            className="w-full rounded-lg border border-orange-500/40 bg-gradient-to-br from-amber-500/[0.06] via-orange-500/[0.08] to-rose-500/[0.08] p-2.5 text-center hover:from-amber-500/[0.12] hover:via-orange-500/[0.14] hover:to-rose-500/[0.14] transition-colors mt-2"
          >
            <span className="text-sm font-semibold text-orange-300">
              Tutti ({count})
            </span>
            <span className="text-[10px] text-[var(--fg-subtle)] ml-2 tabular-nums">
              {estimateCost(count)} · {formatSeconds(estimateSeconds(count))}
            </span>
          </button>
        )}
        {count > 500 && (
          <p className="text-[10px] text-[var(--fg-subtle)] text-center pt-1">
            Hai più di 500 movimenti. Procedi a batch (500 → applica → ri-trigger
            per i prossimi).
          </p>
        )}
      </div>
    </div>
  );
}

function SuggestionsList({
  suggestions,
  categories,
  estates,
  onToggle,
  onOverride,
  onGroupOverride,
  onGroupToggle,
}: {
  suggestions: EditableSuggestion[];
  categories: Category[];
  estates: Estate[];
  onToggle: (txId: string) => void;
  onOverride: (txId: string, catId: string | null) => void;
  onGroupOverride: (txIds: string[], catId: string | null) => void;
  onGroupToggle: (txIds: string[], nextSelected: boolean) => void;
}) {
  // Raggruppa per beneficiary normalizzato. Group con >1 elem in cima
  // (sorted by count desc), singoletti in fondo (per data desc).
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; items: EditableSuggestion[] }
    >();
    for (const s of suggestions) {
      const label = s.beneficiary || "(beneficiary vuoto)";
      const key = normalizeBeneficiary(label);
      const g = map.get(key) ?? { key, label, items: [] };
      g.items.push(s);
      map.set(key, g);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.items.length !== b.items.length) {
        return b.items.length - a.items.length;
      }
      // Stesso count → per data più recente prima
      const da = a.items[0]?.date ?? "";
      const db = b.items[0]?.date ?? "";
      return db.localeCompare(da);
    });
    return arr;
  }, [suggestions]);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isMulti = g.items.length > 1;
        if (!isMulti) {
          const s = g.items[0];
          return (
            <SuggestionRow
              key={s.txId}
              sug={s}
              categories={categories}
              estates={estates}
              onToggle={() => onToggle(s.txId)}
              onOverride={(catId) => onOverride(s.txId, catId)}
            />
          );
        }
        return (
          <div
            key={g.key}
            className="rounded-md border border-orange-500/25 bg-orange-500/[0.03] overflow-hidden"
          >
            <GroupHeader
              label={g.label}
              items={g.items}
              categories={categories}
              estates={estates}
              onBulkOverride={(catId) =>
                onGroupOverride(g.items.map((i) => i.txId), catId)
              }
              onBulkToggle={(next) =>
                onGroupToggle(g.items.map((i) => i.txId), next)
              }
            />
            <div className="p-2 space-y-2 bg-[var(--bg)]">
              {g.items.map((s) => (
                <SuggestionRow
                  key={s.txId}
                  sug={s}
                  categories={categories}
                  estates={estates}
                  onToggle={() => onToggle(s.txId)}
                  onOverride={(catId) => onOverride(s.txId, catId)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupHeader({
  label,
  items,
  categories,
  estates,
  onBulkOverride,
  onBulkToggle,
}: {
  label: string;
  items: EditableSuggestion[];
  categories: Category[];
  estates: Estate[];
  onBulkOverride: (catId: string | null) => void;
  onBulkToggle: (next: boolean) => void;
}) {
  const selectedCount = items.filter((s) => s.selected).length;
  const allSelected = selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  // Se tutti i row hanno la stessa categoria effettiva, mostrala come default
  // del bulk dropdown. Altrimenti vuoto (utente sceglie per uniformare).
  const effectiveCats = items.map((s) => s.overrideCategoryId ?? s.suggestedCategoryId);
  const allSame = effectiveCats.every((c) => c === effectiveCats[0]);
  const bulkValue = allSame ? effectiveCats[0] ?? "" : "";

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-orange-500/[0.06] border-b border-orange-500/20">
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={allSelected}
        onChange={(e) => onBulkToggle(e.target.checked)}
        className="size-4 accent-orange-500"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        <div className="text-[10px] text-[var(--fg-subtle)]">
          {items.length} movimenti · {selectedCount} selezionati
        </div>
      </div>
      <div title="Applica questa categoria a TUTTI i movimenti del gruppo">
        <CategoryPicker
          value={bulkValue || null}
          categories={categories}
          estates={estates}
          onChange={onBulkOverride}
        />
      </div>
    </div>
  );
}

function SuggestionRow({
  sug,
  categories,
  estates,
  onToggle,
  onOverride,
}: {
  sug: EditableSuggestion;
  categories: Category[];
  estates: Estate[];
  onToggle: () => void;
  onOverride: (categoryId: string | null) => void;
}) {
  const effectiveCategoryId =
    sug.overrideCategoryId ?? sug.suggestedCategoryId;
  const effectiveCategory = effectiveCategoryId
    ? categories.find((c) => c.id === effectiveCategoryId)
    : null;
  const lowConfidence = sug.confidence < 0.6;
  const isIncome = sug.amount > 0;

  return (
    <div
      className={cn(
        "rounded-md border border-l-4 p-3 transition-colors",
        // Bordo sinistro colorato per riconoscere a colpo d'occhio
        // entrata (verde) vs uscita (rosa)
        isIncome ? "border-l-emerald-500/60" : "border-l-rose-500/60",
        sug.selected
          ? "border-y-[var(--border-strong)] border-r-[var(--border-strong)] bg-[var(--surface-2)]/40"
          : "border-y-[var(--border)] border-r-[var(--border)] bg-transparent opacity-50",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={sug.selected}
          onChange={onToggle}
          className="mt-1 size-4 accent-orange-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div className="text-sm font-medium truncate">
              {sug.beneficiary || "(beneficiary vuoto)"}
            </div>
            <div className="shrink-0 inline-flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
                  isIncome
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-rose-500/10 text-rose-400",
                )}
              >
                {isIncome ? "Entrata" : "Uscita"}
              </span>
              <span
                className={cn(
                  "text-base font-semibold tabular-nums",
                  isIncome ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {isIncome ? "+" : ""}
                {formatEUR(sug.amount)}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--fg-subtle)] mb-2 flex flex-wrap items-center gap-x-1.5">
            <span>
              {formatDate(sug.date, {
                day: "2-digit",
                month: "short",
                year: "2-digit",
              })}
            </span>
            {(() => {
              const hhmm = sug.date.slice(11, 16);
              return hhmm && hhmm !== "00:00" ? <span>· {hhmm}</span> : null;
            })()}
            {sug.accountName && (
              <span className="inline-flex items-center gap-1 text-[var(--fg-muted)]">
                · 💳 {sug.accountName}
              </span>
            )}
          </div>
          {sug.notes && (
            <div className="text-[11px] text-[var(--fg-muted)] mb-2 px-2 py-1 rounded bg-[var(--surface-2)]/60 border border-[var(--border)] italic">
              <span className="text-[10px] uppercase tracking-wider not-italic font-semibold text-[var(--fg-subtle)] mr-1.5">
                Causale:
              </span>
              {sug.notes}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryPicker
              value={effectiveCategoryId}
              categories={categories}
              estates={estates}
              onChange={onOverride}
            />
            {effectiveCategory && (
              <span className="text-[11px] text-[var(--fg-muted)] inline-flex items-center gap-1">
                {categoryLabel(effectiveCategory, estates)}
              </span>
            )}
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium tabular-nums",
                lowConfidence
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
              )}
              title="Confidenza del modello AI"
            >
              {Math.round(sug.confidence * 100)}%
            </span>
            {sug.reasoning && (
              <span className="text-[10px] text-[var(--fg-subtle)] italic">
                {sug.reasoning}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
