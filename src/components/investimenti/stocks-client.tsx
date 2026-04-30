"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Position = {
  id: string;
  ticker: string;
  name: string | null;
  shares: number;
  avgCost: number | null;
  currentPrice: number;
  currency: string;
  fxToEur: number;
  exchange: string | null;
  lastUpdated: string;
  eurValue: number;
  gainAbs: number | null;
  gainPct: number | null;
};

export function StocksClient({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  // Add form
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/integrations/stocks/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      const ok = json.updates.filter((u: { ok: boolean }) => u.ok).length;
      const fail = json.updates.length - ok;
      setRefreshResult(`${ok} aggiornati${fail > 0 ? `, ${fail} falliti` : ""}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setRefreshing(false);
    }
  }

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const body = {
        ticker: ticker.trim(),
        shares: parseFloat(shares),
        avgCost: avgCost ? parseFloat(avgCost) : undefined,
      };
      const res = await fetch("/api/integrations/stocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setTicker("");
      setShares("");
      setAvgCost("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
          Posizioni
        </h2>
        <div className="flex items-center gap-2">
          {refreshResult && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-emerald-400 inline-flex items-center gap-1"
            >
              <CheckCircle2 className="size-3" /> {refreshResult}
            </motion.span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing || positions.length === 0}
            className="h-9 px-3 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refresh prezzi…" : "Refresh prezzi"}
          </button>
        </div>
      </div>

      {error && (
        <div className="surface border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400 inline-flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {positions.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--fg-subtle)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium text-right">Quantità</th>
                  <th className="px-4 py-3 font-medium text-right">Prezzo</th>
                  <th className="px-4 py-3 font-medium text-right">Valore EUR</th>
                  <th className="px-4 py-3 font-medium text-right">Gain/Loss</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <PositionRow key={p.id} p={p} onChanged={() => router.refresh()} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form aggiunta */}
      <div className="surface p-5">
        <h3 className="text-sm font-medium mb-3 inline-flex items-center gap-1.5">
          <Plus className="size-4" /> Aggiungi posizione
        </h3>
        <form onSubmit={addPosition} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
              Ticker (es. AAPL, TSLA)
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              required
              className="h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono w-32 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
              Quantità
            </label>
            <input
              type="number"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
              required
              className="h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm w-28 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
              Prezzo medio carico (opz.)
            </label>
            <input
              type="number"
              step="any"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              placeholder="150.00"
              className="h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm w-32 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="h-9 px-4 rounded bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 disabled:opacity-50"
          >
            {adding ? "Aggiungo…" : "Aggiungi"}
          </button>
        </form>
        <p className="text-[11px] text-[var(--fg-subtle)] mt-3">
          Il prezzo corrente e la valuta sono presi da Yahoo Finance al momento dell'inserimento.
          Se la valuta non è EUR viene applicato il cambio del momento.
        </p>
      </div>
    </div>
  );
}

function PositionRow({ p, onChanged }: { p: Position; onChanged: () => void }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(p.shares.toString());
  const [avgCost, setAvgCost] = useState(p.avgCost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/stocks/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shares: parseFloat(shares),
          avgCost: avgCost ? parseFloat(avgCost) : null,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm({ title: `Rimuovere ${p.ticker}?`, confirmLabel: "Rimuovi", variant: "danger" }))) return;
    await fetch(`/api/integrations/stocks/${p.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <tr className="border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40">
      <td className="px-4 py-3 font-mono font-medium">{p.ticker}</td>
      <td className="px-4 py-3 max-w-[200px] truncate text-xs text-[var(--fg-muted)]">
        {p.name ?? "—"}
        {p.exchange && <span className="text-[var(--fg-subtle)] ml-1">· {p.exchange}</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {editing ? (
          <input
            type="number"
            step="any"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="h-7 w-20 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-sm text-right"
          />
        ) : (
          p.shares
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-xs text-[var(--fg-muted)]">
        {p.currentPrice.toFixed(2)} {p.currency}
        {p.currency !== "EUR" && (
          <div className="text-[10px] text-[var(--fg-subtle)]">
            {(p.currentPrice * p.fxToEur).toFixed(2)} EUR
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium">
        {formatEUR(p.eurValue)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-xs">
        {editing ? (
          <input
            type="number"
            step="any"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder="costo medio"
            className="h-7 w-24 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-sm text-right"
          />
        ) : p.gainAbs !== null && p.gainPct !== null ? (
          <span
            className={cn(
              "font-medium",
              p.gainAbs >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {p.gainAbs >= 0 ? "+" : ""}{formatEUR(p.gainAbs)}
            <div className="text-[10px]">
              {(p.gainPct * 100).toFixed(2)}%
            </div>
          </span>
        ) : (
          <span className="text-[var(--fg-subtle)]">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs"
            >
              ✓
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setShares(p.shares.toString());
                setAvgCost(p.avgCost?.toString() ?? "");
              }}
              className="size-6 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-1 justify-end opacity-60 hover:opacity-100">
            <button
              onClick={() => setEditing(true)}
              className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)]"
              title="Modifica"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={remove}
              className="size-6 inline-flex items-center justify-center rounded hover:bg-rose-500/10 text-rose-400"
              title="Rimuovi"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
