"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, AlertTriangle } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";

/**
 * Editor inline a livello di Investment (platform totals).
 * Usato quando non c'è un breakdown per-asset disponibile (es. Revolut X
 * legacy con solo costo aggregato noto).
 */
export function InvestmentSummaryEditor({
  investmentId,
  currentValue,
  costEur,
}: {
  investmentId: string;
  currentValue: number;
  costEur: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<"value" | "cost" | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const value = parseFloat(draft);
      if (!isFinite(value)) throw new Error("Valore non valido");
      const body: Record<string, number> = {};
      if (editing === "value") body.currentValue = value;
      else if (editing === "cost") body.costEur = value;
      const res = await fetch(`/api/investments/${investmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      setEditing(null);
      setDraft("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  const gain = costEur != null ? currentValue - costEur : null;
  const gainPct = costEur != null && costEur > 0 ? (gain! / costEur) * 100 : null;

  return (
    <div className="surface p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
          Riepilogo aggregato
        </h3>
        <span className="text-[11px] text-[var(--fg-subtle)]">
          (sostituibile con breakdown per-asset)
        </span>
      </div>

      {error && (
        <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] mb-1">
            Valore corrente
          </div>
          {editing === "value" ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  else if (e.key === "Escape") {
                    setEditing(null);
                    setDraft("");
                  }
                }}
                className="flex-1 h-8 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-base tabular-nums focus:outline-none"
              />
              <button
                onClick={save}
                disabled={saving}
                className="size-7 inline-flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
              >
                <Check className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
                className="size-7 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatEUR(currentValue)}
              </span>
              <button
                onClick={() => {
                  setEditing("value");
                  setDraft(currentValue.toString());
                }}
                className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
                title="Modifica valore corrente"
              >
                <Pencil className="size-3" />
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] mb-1">
            Costo (entry)
          </div>
          {editing === "cost" ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  else if (e.key === "Escape") {
                    setEditing(null);
                    setDraft("");
                  }
                }}
                className="flex-1 h-8 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-base tabular-nums focus:outline-none"
              />
              <button
                onClick={save}
                disabled={saving}
                className="size-7 inline-flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
              >
                <Check className="size-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
                className="size-7 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-[var(--fg-muted)]">
                {costEur != null ? formatEUR(costEur) : "—"}
              </span>
              <button
                onClick={() => {
                  setEditing("cost");
                  setDraft(costEur?.toString() ?? "");
                }}
                className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
                title="Modifica costo"
              >
                <Pencil className="size-3" />
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] mb-1">
            Unrealized P/L
          </div>
          {gain != null ? (
            <div
              className={cn(
                "text-2xl font-semibold tabular-nums",
                gain >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {gain >= 0 ? "+" : ""}
              {formatEUR(gain)}
              {gainPct != null && (
                <span className="text-sm font-normal ml-2">
                  ({gainPct.toFixed(2)}%)
                </span>
              )}
            </div>
          ) : (
            <div className="text-2xl font-semibold tabular-nums text-[var(--fg-subtle)]">—</div>
          )}
        </div>
      </div>
    </div>
  );
}
