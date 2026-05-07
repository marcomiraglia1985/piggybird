"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";

/**
 * Riepilogo dei totali di un Investment platform-level.
 *
 * Modalità:
 *  - "api": il broker è collegato → currentValue e entry-cost sono auto
 *    (rispettivamente da sync e da backfill sui trade). L'utente può modificare
 *    solo il baseline pre-API (cost basis storico che la API non recupera).
 *  - "manual": nessun broker connesso → l'utente edita currentValue e baseline
 *    a mano. La sezione entry-cost è nascosta perché non c'è una source di trade.
 */
type Mode = "api" | "manual";

export function InvestmentSummaryEditor({
  investmentId,
  currentValue,
  baselineCost,
  entryFromTrades,
  tradesCount,
  mode,
}: {
  investmentId: string;
  currentValue: number;
  baselineCost: number | null;
  entryFromTrades: number;
  tradesCount: number;
  mode: Mode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<"value" | "baseline" | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  async function recalculateCostBasis() {
    setRecalculating(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/binance/backfill-cost-basis", {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore ricalcolo");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore ricalcolo");
    } finally {
      setRecalculating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const value = parseFloat(draft);
      if (!isFinite(value)) throw new Error("Valore non valido");
      const body: Record<string, number> = {};
      if (editing === "value") body.currentValue = value;
      else if (editing === "baseline") body.costEur = value;
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

  const baseline = baselineCost ?? 0;
  const totalCost = baseline + entryFromTrades;
  const gain = totalCost > 0 ? currentValue - totalCost : null;
  const gainPct = totalCost > 0 ? ((gain ?? 0) / totalCost) * 100 : null;
  const valueIsEditable = mode === "manual";

  return (
    <div className="surface p-5 space-y-5">
      {error && (
        <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Valore corrente">
          {valueIsEditable && editing === "value" ? (
            <InlineEditor
              draft={draft}
              setDraft={setDraft}
              save={save}
              cancel={() => {
                setEditing(null);
                setDraft("");
              }}
              saving={saving}
            />
          ) : (
            <ReadValue
              value={formatEUR(currentValue)}
              onEdit={
                valueIsEditable
                  ? () => {
                      setEditing("value");
                      setDraft(currentValue.toString());
                    }
                  : undefined
              }
              autoLabel={mode === "api" ? "auto · sync API" : undefined}
            />
          )}
        </Field>

        <Field label="Costo totale">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-[var(--fg-muted)]">
              {totalCost > 0 ? formatEUR(totalCost) : "—"}
            </span>
          </div>
        </Field>

        <Field label="Unrealized P/L">
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
        </Field>
      </div>

      {/* Breakdown del costo: entry from trades (read-only) + baseline (editable) */}
      <div className="border-t border-[var(--border)] pt-4 space-y-2.5">
        {mode === "api" && (
          <BreakdownRow
            label="Costo entry"
            hint={
              entryFromTrades > 0
                ? "dai trade Binance"
                : tradesCount > 0
                  ? `${tradesCount} trade importati ma cost basis non ancora calcolato`
                  : "importa lo storico trade Binance"
            }
            value={
              entryFromTrades > 0
                ? formatEUR(entryFromTrades)
                : tradesCount > 0
                  ? "—"
                  : "—"
            }
            locked={tradesCount === 0}
            action={
              tradesCount > 0
                ? {
                    label: recalculating ? "Calcolo…" : "Ricalcola dai trade",
                    icon: <RefreshCw className={cn("size-3", recalculating && "animate-spin")} />,
                    onClick: recalculateCostBasis,
                    disabled: recalculating,
                  }
                : undefined
            }
          />
        )}
        <BreakdownRow
          label="Baseline pre-API"
          hint={
            mode === "api"
              ? "crypto comprate prima di usare il broker"
              : "costo totale storico"
          }
          editing={editing === "baseline"}
          editor={
            <InlineEditor
              draft={draft}
              setDraft={setDraft}
              save={save}
              cancel={() => {
                setEditing(null);
                setDraft("");
              }}
              saving={saving}
            />
          }
          value={baselineCost != null ? formatEUR(baselineCost) : "non impostato"}
          onEdit={() => {
            setEditing("baseline");
            setDraft(baselineCost?.toString() ?? "");
          }}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function ReadValue({
  value,
  onEdit,
  autoLabel,
}: {
  value: string;
  onEdit?: () => void;
  autoLabel?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {onEdit ? (
        <button
          onClick={onEdit}
          className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
          title="Modifica"
        >
          <Pencil className="size-3" />
        </button>
      ) : autoLabel ? (
        <span className="text-[10px] text-[var(--fg-subtle)] inline-flex items-center gap-1">
          <Lock className="size-2.5" /> {autoLabel}
        </span>
      ) : null}
    </div>
  );
}

function InlineEditor({
  draft,
  setDraft,
  save,
  cancel,
  saving,
}: {
  draft: string;
  setDraft: (v: string) => void;
  save: () => void;
  cancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="any"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") cancel();
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
        onClick={cancel}
        className="size-7 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function BreakdownRow({
  label,
  hint,
  value,
  locked,
  editing,
  editor,
  onEdit,
  action,
}: {
  label: string;
  hint: string;
  value: string;
  locked?: boolean;
  editing?: boolean;
  editor?: React.ReactNode;
  onEdit?: () => void;
  action?: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex flex-col">
        <span className="text-[var(--fg)]">{label}</span>
        <span className="text-[11px] text-[var(--fg-subtle)]">{hint}</span>
      </div>
      {editing && editor ? (
        <div className="flex-1 max-w-[280px]">{editor}</div>
      ) : (
        <div className="flex items-center gap-2">
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs hover:bg-violet-500/20 disabled:opacity-50"
            >
              {action.icon} {action.label}
            </button>
          )}
          <span className="tabular-nums text-[var(--fg-muted)]">{value}</span>
          {locked ? (
            <span
              className="size-6 inline-flex items-center justify-center text-[var(--fg-subtle)]"
              title="Auto, non modificabile"
            >
              <Lock className="size-3" />
            </span>
          ) : onEdit ? (
            <button
              onClick={onEdit}
              className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
              title="Modifica"
            >
              <Pencil className="size-3" />
            </button>
          ) : (
            <span className="size-6 inline-block" aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  );
}
