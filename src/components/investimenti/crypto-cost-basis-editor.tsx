"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Plus, AlertTriangle, Trash2, BarChart3 } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";
import { AssetChartModal } from "@/components/investimenti/asset-chart-modal";
import { useConfirm } from "@/components/ui/confirm-dialog";

type AssetRow = {
  asset: string;
  amount: number;
  eurValue: number;
  sources: string[];
  costEur: number | null;
};

const SOURCE_LABELS: Record<string, string> = {
  spot: "Spot",
  funding: "Funding",
  "earn-flexible": "Earn Flexible",
  "earn-locked": "Earn Locked",
  "margin-cross": "Cross Margin",
  "margin-isolated": "Isolated Margin",
  "futures-usdm": "USDⓈ-M Futures",
  "futures-coinm": "COIN-M Futures",
  manual: "Manuale",
};

export function CryptoCostBasisEditor({
  platform,
  assets,
  allowAdd,
}: {
  platform: string;
  assets: AssetRow[];
  allowAdd: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editingAsset, setEditingAsset] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"cost" | "amount" | "value" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingPosition, setAddingPosition] = useState(false);
  const [chartAsset, setChartAsset] = useState<string | null>(null);
  const [newAsset, setNewAsset] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newCost, setNewCost] = useState("");

  function beginEdit(asset: string, field: "cost" | "amount" | "value", current: number | null) {
    setEditingAsset(asset);
    setEditingField(field);
    setEditValue(current?.toString() ?? "");
  }
  function cancelEdit() {
    setEditingAsset(null);
    setEditingField(null);
    setEditValue("");
  }

  async function saveEdit(row: AssetRow) {
    if (!editingField) return;
    setSaving(true);
    setError(null);
    try {
      const value = editValue.trim() === "" ? null : parseFloat(editValue);
      if (value != null && !isFinite(value)) throw new Error("Valore non valido");
      if (editingField === "cost") {
        const res = await fetch(`/api/integrations/crypto/cost-basis`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform, asset: row.asset, costEur: value }),
        });
        if (!res.ok) throw new Error("Errore salvataggio costo");
      } else {
        // amount o value: usa upsert manuale (preserva tutto il resto)
        const isManual = row.sources.length === 1 && row.sources[0] === "manual";
        if (!isManual) {
          throw new Error("Solo posizioni manuali sono editabili");
        }
        if (value == null) throw new Error("Valore obbligatorio");
        const res = await fetch(`/api/integrations/crypto/manual`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            platform,
            asset: row.asset,
            amount: editingField === "amount" ? value : row.amount,
            eurValue: editingField === "value" ? value : row.eurValue,
            costEur: row.costEur,
          }),
        });
        if (!res.ok) throw new Error("Errore salvataggio");
      }
      cancelEdit();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function addManualPosition(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/crypto/manual`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          asset: newAsset.trim().toUpperCase(),
          amount: parseFloat(newAmount),
          eurValue: parseFloat(newValue),
          costEur: newCost ? parseFloat(newCost) : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      setNewAsset("");
      setNewAmount("");
      setNewValue("");
      setNewCost("");
      setAddingPosition(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function removeManualPosition(asset: string) {
    if (!(await confirm({ title: `Rimuovere posizione manuale ${asset}?`, confirmLabel: "Rimuovi", variant: "danger" }))) return;
    await fetch(
      `/api/integrations/crypto/manual?platform=${encodeURIComponent(platform)}&asset=${encodeURIComponent(asset)}`,
      { method: "DELETE" },
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-4" /> {error}
        </div>
      )}

      {assets.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--fg-subtle)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium text-right">Quantità</th>
                  <th className="px-4 py-3 font-medium text-right">Valore EUR</th>
                  <th className="px-4 py-3 font-medium text-right">Costo EUR</th>
                  <th className="px-4 py-3 font-medium text-right">Gain</th>
                  <th className="px-4 py-3 font-medium">Wallet</th>
                  <th className="px-4 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((r) => {
                  const gain = r.costEur != null ? r.eurValue - r.costEur : null;
                  const gainPct =
                    r.costEur != null && r.costEur > 0 ? (gain! / r.costEur) * 100 : null;
                  const isManual = r.sources.length === 1 && r.sources[0] === "manual";
                  const editingThisRow = editingAsset === r.asset;
                  const isEditingField = (f: "amount" | "value" | "cost") =>
                    editingThisRow && editingField === f;

                  function renderEditableCell(
                    field: "amount" | "value" | "cost",
                    display: React.ReactNode,
                    editable: boolean,
                  ) {
                    if (isEditingField(field)) {
                      return (
                        <input
                          type="number"
                          step="any"
                          value={editValue}
                          autoFocus
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(r);
                            else if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-7 w-28 rounded bg-[var(--surface-2)] border border-violet-500/50 px-2 text-sm tabular-nums text-right focus:outline-none"
                        />
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5 group/cell">
                        {display}
                        {editable && (
                          <button
                            onClick={() =>
                              beginEdit(
                                r.asset,
                                field,
                                field === "amount"
                                  ? r.amount
                                  : field === "value"
                                    ? r.eurValue
                                    : r.costEur,
                              )
                            }
                            className="size-5 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-subtle)] opacity-0 group-hover/cell:opacity-100 transition-opacity"
                            title={`Modifica ${field === "amount" ? "quantità" : field === "value" ? "valore" : "costo"}`}
                          >
                            <Pencil className="size-3" />
                          </button>
                        )}
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={r.asset}
                      className="group border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40"
                    >
                      <td className="px-4 py-3 font-mono font-medium">
                        <button
                          onClick={() => setChartAsset(r.asset)}
                          className="inline-flex items-center gap-1.5 hover:text-violet-400 transition-colors"
                          title="Mostra grafico storico"
                        >
                          {r.asset}
                          <BarChart3 className="size-3 opacity-0 group-hover:opacity-60" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--fg-muted)]">
                        {renderEditableCell(
                          "amount",
                          <>{r.amount < 1 ? r.amount.toFixed(6) : r.amount.toFixed(4)}</>,
                          isManual,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {renderEditableCell("value", <>{formatEUR(r.eurValue)}</>, isManual)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {renderEditableCell(
                          "cost",
                          r.costEur != null ? (
                            <span className="text-[var(--fg-muted)]">{formatEUR(r.costEur)}</span>
                          ) : (
                            <span className="text-[var(--fg-subtle)] italic text-xs">
                              non impostato
                            </span>
                          ),
                          true,
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right tabular-nums font-medium",
                          gain == null
                            ? "text-[var(--fg-subtle)]"
                            : gain >= 0
                              ? "text-emerald-400"
                              : "text-rose-400",
                        )}
                      >
                        {gain == null ? (
                          "—"
                        ) : (
                          <>
                            {gain >= 0 ? "+" : ""}
                            {formatEUR(gain)}
                            {gainPct != null && (
                              <div className="text-[10px]">{gainPct.toFixed(2)}%</div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--fg-muted)]">
                        {r.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingThisRow ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => saveEdit(r)}
                              disabled={saving}
                              className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                            >
                              <Check className="size-3" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="size-6 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ) : (
                          isManual && (
                            <button
                              onClick={() => removeManualPosition(r.asset)}
                              className="size-6 inline-flex items-center justify-center rounded hover:bg-rose-500/10 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Rimuovi posizione manuale"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addingPosition ? (
        <form
          onSubmit={addManualPosition}
          className="surface p-4 grid grid-cols-1 sm:grid-cols-5 gap-2 items-end"
        >
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
              Asset
            </label>
            <input
              type="text"
              value={newAsset}
              onChange={(e) => setNewAsset(e.target.value)}
              placeholder="BTC"
              required
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm font-mono uppercase focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
              Quantità
            </label>
            <input
              type="number"
              step="any"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              required
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
              Valore EUR
            </label>
            <input
              type="number"
              step="any"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              required
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)]">
              Costo EUR <span className="normal-case tracking-normal">(opz)</span>
            </label>
            <input
              type="number"
              step="any"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-3 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              Aggiungi
            </button>
            <button
              type="button"
              onClick={() => setAddingPosition(false)}
              className="h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
            >
              Annulla
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingPosition(true)}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <Plus className="size-3" /> Aggiungi posizione manuale
        </button>
      )}
      <AssetChartModal
        open={!!chartAsset}
        onClose={() => setChartAsset(null)}
        symbol={chartAsset ?? ""}
        kind="crypto"
      />
    </div>
  );
}
