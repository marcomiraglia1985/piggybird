"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Pencil, BarChart3 } from "lucide-react";
import { AssetChartModal } from "@/components/investimenti/asset-chart-modal";
import { formatEUR, cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

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
  assetType: string;
  isin: string | null;
  lastUpdated: string;
  eurValue: number;
  gainAbs: number | null;
  gainPct: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  stock: "Azioni",
  etf: "ETF",
  metal: "Materie prime",
};

const TYPE_EMOJI: Record<string, string> = {
  stock: "📈",
  etf: "📊",
  metal: "🪙",
};

export function TradingClient({ positions }: { positions: Position[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Group by assetType
  const grouped = new Map<string, Position[]>();
  for (const p of positions) {
    const arr = grouped.get(p.assetType) ?? [];
    arr.push(p);
    grouped.set(p.assetType, arr);
  }
  // ETF prima, poi azioni, poi metalli
  const orderedTypes = ["etf", "stock", "metal"].filter((t) => grouped.has(t));
  for (const t of grouped.keys()) if (!orderedTypes.includes(t)) orderedTypes.push(t);

  return (
    <div className="space-y-6">
      {error && (
        <div className="surface border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-400 inline-flex items-start gap-2">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {orderedTypes.map((type) => {
        const items = grouped.get(type) ?? [];
        const typeTotal = items.reduce((s, p) => s + p.eurValue, 0);
        return (
          <section key={type}>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h3 className="text-xs uppercase tracking-wider text-[var(--fg-muted)] inline-flex items-center gap-1.5">
                <span>{TYPE_EMOJI[type]}</span>
                {TYPE_LABEL[type] ?? type}
                <span className="text-[var(--fg-subtle)]">· {items.length}</span>
              </h3>
              <span className="text-xs tabular-nums text-[var(--fg-muted)]">{formatEUR(typeTotal)}</span>
            </div>
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[10%]" />
                    <col className="w-[26%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                  </colgroup>
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
                    {items.map((p) => (
                      <PositionRow key={p.id} p={p} onChanged={() => router.refresh()} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PositionRow({ p, onChanged }: { p: Position; onChanged: () => void }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
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
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      toast({ title: `${p.ticker} aggiornato`, variant: "success" });
      setEditing(false);
      onChanged();
    } catch (e) {
      toast({
        title: "Errore salvataggio",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirm({ title: `Rimuovere ${p.ticker}?`, confirmLabel: "Rimuovi", variant: "danger" }))) return;
    try {
      const res = await fetch(`/api/integrations/stocks/${p.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      toast({ title: `${p.ticker} rimosso`, variant: "success" });
      onChanged();
    } catch (e) {
      toast({
        title: "Errore rimozione",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  const formatShares = p.assetType === "metal"
    ? `${p.shares.toFixed(8)} oz`
    : p.shares.toFixed(8);

  return (
    <tr className="group border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40">
      <td className="px-4 py-3 font-mono font-medium">
        <button
          onClick={() => setChartOpen(true)}
          className="inline-flex items-center gap-1.5 hover:text-violet-400 transition-colors"
          title="Mostra grafico storico"
        >
          {p.ticker}
          <BarChart3 className="size-3 opacity-0 group-hover:opacity-60" />
        </button>
        <AssetChartModal
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          symbol={p.ticker}
          kind="stock"
          title={p.name ?? undefined}
        />
      </td>
      <td className="px-4 py-3 max-w-[220px] truncate text-xs text-[var(--fg-muted)]">
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
            className="h-7 w-24 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-sm text-right"
          />
        ) : (
          formatShares
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-xs text-[var(--fg-muted)]">
        {p.currentPrice.toFixed(2)} {p.currency}
        {p.currency !== "EUR" && (
          <div className="text-[10px] text-[var(--fg-subtle)]">
            = {(p.currentPrice * p.fxToEur).toFixed(2)} EUR
          </div>
        )}
        {p.avgCost && (
          <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
            avg {p.avgCost.toFixed(2)} {p.currency}
            {p.currency !== "EUR" && (
              <span> (€{(p.avgCost * p.fxToEur).toFixed(2)})</span>
            )}
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
          <span className={cn("font-medium", p.gainAbs >= 0 ? "text-emerald-400" : "text-rose-400")}>
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
            <button onClick={save} disabled={saving} className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">✓</button>
            <button
              onClick={() => {
                setEditing(false);
                setShares(p.shares.toString());
                setAvgCost(p.avgCost?.toString() ?? "");
              }}
              className="size-6 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs"
            >✕</button>
          </div>
        ) : (
          <div className="flex gap-1 justify-end opacity-60 hover:opacity-100">
            <button onClick={() => setEditing(true)} className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)]" title="Modifica">
              <Pencil className="size-3" />
            </button>
            <button onClick={remove} className="size-6 inline-flex items-center justify-center rounded hover:bg-rose-500/10 text-rose-400" title="Rimuovi">
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
