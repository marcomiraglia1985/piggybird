"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitMerge, AlertTriangle } from "lucide-react";

type Cat = {
  id: string;
  emoji: string;
  name: string;
  type: string;
  group: string;
  active: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  income: "Entrate",
  expense: "Spese",
  investment: "Investimenti",
  transfer: "Trasferimenti",
};

export function MergeCategoryDialog({
  open,
  onClose,
  source,
  allCategories,
  txCount,
}: {
  open: boolean;
  onClose: () => void;
  source: Cat | null;
  allCategories: Cat[];
  txCount: number;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  // Possibili target: tutte le altre categorie (active o archiviate), grouped by type.
  // Suggeriamo per primo lo stesso type del source (più logico).
  const targets = useMemo(() => {
    if (!source) return [] as Cat[];
    return allCategories.filter((c) => c.id !== source.id);
  }, [allCategories, source]);

  const groupedTargets = useMemo(() => {
    if (!source) return new Map<string, Cat[]>();
    const map = new Map<string, Cat[]>();
    // Stesso type prima
    const same = targets.filter((c) => c.type === source.type);
    const other = targets.filter((c) => c.type !== source.type);
    if (same.length) map.set(`Stesso tipo · ${TYPE_LABEL[source.type] ?? source.type}`, same);
    for (const c of other) {
      const k = TYPE_LABEL[c.type] ?? c.type;
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return map;
  }, [targets, source]);

  const target = targets.find((c) => c.id === targetId) ?? null;
  const typesMismatch = !!source && !!target && source.type !== target.type;

  function reset() {
    setTargetId("");
    setError(null);
    setMerging(false);
    setConfirmed(false);
  }

  function close() {
    if (merging) return;
    reset();
    onClose();
  }

  async function submit() {
    if (!source || !target) return;
    setMerging(true);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${source.id}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Errore");
      }
      reset();
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setMerging(false);
    }
  }

  return (
    <AnimatePresence>
      {open && source && (
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
            className="w-full max-w-lg surface p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                <GitMerge className="size-5 text-violet-400" />
                Unisci categoria
              </h2>
              <button
                onClick={close}
                disabled={merging}
                className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] mb-1">
                Sorgente (verrà cancellata)
              </div>
              <div className="flex items-center gap-2">
                <span className="size-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-lg">
                  {source.emoji}
                </span>
                <div>
                  <div className="text-sm font-medium">{source.name}</div>
                  <div className="text-[11px] text-[var(--color-fg-subtle)]">
                    {txCount} movimenti collegati
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)] font-medium block mb-1.5">
                Unisci dentro a
              </label>
              <select
                value={targetId}
                onChange={(e) => {
                  setTargetId(e.target.value);
                  setConfirmed(false);
                }}
                disabled={merging}
                className="w-full h-10 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-violet-500/50"
              >
                <option value="">— Scegli categoria target —</option>
                {[...groupedTargets.entries()].map(([groupName, cats]) => (
                  <optgroup key={groupName} label={groupName}>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                        {!c.active ? " (archiviata)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {target && typesMismatch && (
              <div
                className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs flex items-start gap-2"
                style={{ color: "var(--color-amber-text)" }}
              >
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Tipi diversi</div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--color-amber-text-soft)" }}
                  >
                    Sorgente è {TYPE_LABEL[source.type] ?? source.type}, target è{" "}
                    {TYPE_LABEL[target.type] ?? target.type}. La merge funziona ma
                    cambia la classificazione delle {txCount} transazioni storiche.
                  </div>
                </div>
              </div>
            )}

            {target && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 space-y-2">
                <div
                  className="flex items-start gap-2 text-xs"
                  style={{ color: "var(--color-rose-text)" }}
                >
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-medium">Operazione irreversibile</div>
                    <ul
                      className="list-disc list-inside text-[11px] space-y-0.5"
                      style={{ color: "var(--color-rose-text-soft)" }}
                    >
                      <li>
                        {txCount} movimenti spostati da{" "}
                        <strong>{source.emoji} {source.name}</strong> a{" "}
                        <strong>{target.emoji} {target.name}</strong>
                      </li>
                      <li>
                        Categoria <strong>{source.name}</strong> cancellata definitivamente
                      </li>
                      <li>
                        Saldi conto e importi <strong>NON</strong> cambiano
                      </li>
                    </ul>
                  </div>
                </div>
                <label
                  className="flex items-center gap-2 text-xs cursor-pointer pt-1 border-t border-rose-500/20"
                  style={{ color: "var(--color-rose-text)" }}
                >
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="size-3.5 accent-rose-500"
                  />
                  Confermo, procedi con la merge
                </label>
              </div>
            )}

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                onClick={close}
                disabled={merging}
                className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
              >
                Annulla
              </button>
              <button
                onClick={submit}
                disabled={merging || !target || !confirmed}
                className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
              >
                <GitMerge className="size-4" />
                {merging ? "Unisco…" : "Unisci"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
