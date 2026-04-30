"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Trash2, Lock, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatEUR } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Status = {
  provider: string;
  hint: string | null;
  createdAt: string;
  lastSyncAt: string | null;
};

export function BinanceConnect() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/binance");
      const json = await res.json();
      setStatus(json.status);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    const k = apiKey.trim();
    const s = apiSecret.trim();
    if (k.length < 10) {
      setError(`API Key troppo corta (hai inserito ${k.length} caratteri, servono min 10)`);
      return;
    }
    if (s.length < 10) {
      setError(`API Secret troppo corto (hai inserito ${s.length} caratteri, servono min 10)`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/binance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: k, apiSecret: s }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore salvataggio");
      }
      setApiKey("");
      setApiSecret("");
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!(await confirm({ title: "Revocare la connessione a Binance?", description: "Le credenziali API verranno cancellate. Le posizioni sincronizzate restano, ma non potrai più aggiornarle finché non riconnetti.", confirmLabel: "Revoca", variant: "danger" }))) return;
    await fetch("/api/integrations/binance", { method: "DELETE" });
    await refresh();
  }

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    totalEur: number;
    positions: { asset: string; amount: number; eurValue: number }[];
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [importingHistory, setImportingHistory] = useState(false);
  const [importResult, setImportResult] = useState<{
    summary?: {
      tradesFetched: number;
      tradesInserted: number;
      tradesSkippedDup: number;
      cryptoDeposits: number;
      cryptoWithdrawals: number;
    };
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/binance/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore sync");
      setSyncResult(json);
      await refresh();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSyncing(false);
    }
  }

  async function importHistory() {
    setImportingHistory(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/integrations/binance/import-history", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore import");
      setImportResult(json);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Errore");
    } finally {
      setImportingHistory(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <span>🟡</span>
            <span>Binance API</span>
          </span>
        </CardTitle>
        {status && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="size-3.5" /> Connesso
          </span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-[var(--fg-muted)]">Caricamento…</div>
        ) : status && !editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">API Key</div>
                <div className="font-mono text-xs mt-1">{status.hint ?? "•••• ••••"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">Ultima sync</div>
                <div className="text-xs mt-1">
                  {status.lastSyncAt
                    ? new Date(status.lastSyncAt).toLocaleString("it-IT")
                    : "Mai"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
              <button
                onClick={sync}
                disabled={syncing}
                className="h-8 px-3 rounded bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-medium shadow-lg shadow-violet-500/20 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
                {syncing ? "Sincronizzo…" : "Sync ora"}
              </button>
              <button
                onClick={importHistory}
                disabled={importingHistory}
                title="Importa lo storico completo dei trade da Binance (può durare 1-2 minuti). Necessario per il grafico investimenti day-by-day."
                className="h-8 px-3 rounded bg-[var(--surface-2)] border border-violet-500/30 text-violet-300 text-xs hover:border-violet-500/60 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3", importingHistory && "animate-spin")} />
                {importingHistory ? "Importo storico…" : "Importa storico trade"}
              </button>
              <button
                onClick={() => {
                  setEditing(true);
                  setApiKey("");
                  setApiSecret("");
                }}
                className="h-8 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-[var(--border-strong)]"
              >
                Sostituisci credenziali
              </button>
              <button
                onClick={disconnect}
                className="h-8 px-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs hover:bg-rose-500/20 inline-flex items-center gap-1.5 ml-auto"
              >
                <Trash2 className="size-3" />
                Revoca
              </button>
            </div>

            {syncError && (
              <div className="mt-3 text-xs text-rose-400 flex gap-2 items-start">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                {syncError}
              </div>
            )}

            {importError && (
              <div className="mt-3 text-xs text-rose-400 flex gap-2 items-start">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                Import storico: {importError}
              </div>
            )}

            {importResult?.summary && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 px-3 py-2 rounded-md bg-violet-500/[0.06] border border-violet-500/20 text-[11px] text-violet-300/90"
              >
                ✓ Storico importato: {importResult.summary.tradesInserted} trade nuovi
                {importResult.summary.tradesSkippedDup > 0 &&
                  ` (${importResult.summary.tradesSkippedDup} già presenti)`}
                {", "}
                {importResult.summary.cryptoDeposits} deposit + {importResult.summary.cryptoWithdrawals} withdrawal trovati.
              </motion.div>
            )}

            {syncResult && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 space-y-2 pt-3 border-t border-[var(--border)]"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                    Wallet totale
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatEUR(syncResult.totalEur)}
                  </span>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {syncResult.positions
                    .filter((p) => p.eurValue > 0.5)
                    .map((p) => (
                      <div
                        key={p.asset}
                        className="flex items-center justify-between text-xs py-1"
                      >
                        <span className="font-mono">{p.asset}</span>
                        <span className="text-[var(--fg-subtle)] tabular-nums">
                          {p.amount < 1 ? p.amount.toFixed(6) : p.amount.toFixed(2)}
                        </span>
                        <span className="tabular-nums w-24 text-right">
                          {formatEUR(p.eurValue)}
                        </span>
                      </div>
                    ))}
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-[var(--fg-muted)]">
              Incolla le tue credenziali Binance. Verranno cifrate <strong>AES-256-GCM</strong> e salvate
              nel DB locale. La master key vive in <code className="text-xs">.env</code>.
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>Usa una API key con permessi <em>solo lettura</em></strong> (no Trade, no Withdraw).
                Crea una key dedicata per quest'app su Binance → API Management.
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] block mb-1">
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="es. abcdef…"
                className="w-full h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] block mb-1 inline-flex items-center gap-1">
                <Lock className="size-3" />
                API Secret
              </label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {error && (
              <div className="text-xs text-rose-400 flex gap-2 items-start">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={save}
                disabled={!apiKey || !apiSecret || saving}
                className="h-9 px-4 rounded bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 disabled:opacity-40 disabled:shadow-none"
              >
                {saving ? "Salvataggio…" : "Connetti"}
              </button>
              {status && (
                <button
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  className="h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]"
                >
                  Annulla
                </button>
              )}
              <a
                href="https://www.binance.com/en/my/settings/api-management"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] ml-auto"
              >
                Apri Binance API Management
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
