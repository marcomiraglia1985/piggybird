"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Trash2, Lock, ExternalLink, RefreshCw } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatEUR } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Status = {
  provider: string;
  hint: string | null;
  createdAt: string;
  lastSyncAt: string | null;
};

export function RevolutXConnect() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/revolut-x");
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
    const p = privateKeyPem.trim();
    if (k.length < 20) {
      setError(`API Key troppo corta (hai inserito ${k.length} caratteri, ne servono ~64)`);
      return;
    }
    if (!p.includes("-----BEGIN PRIVATE KEY-----")) {
      setError("Private key non valida: deve essere in formato PEM Ed25519");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/revolut-x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: k, privateKeyPem: p }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore salvataggio");
      }
      setApiKey("");
      setPrivateKeyPem("");
      setEditing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!(await confirm({ title: "Revocare la connessione a Revolut X?", description: "Le credenziali API verranno cancellate. Le posizioni sincronizzate restano, ma non potrai più aggiornarle finché non riconnetti.", confirmLabel: "Revoca", variant: "danger" }))) return;
    await fetch("/api/integrations/revolut-x", { method: "DELETE" });
    await refresh();
  }

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    totalEur: number;
    assetsSynced: number;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/revolut-x/sync", { method: "POST" });
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

  return (
    <div className="space-y-2">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <span>🚀</span>
            <span>Revolut X API</span>
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
                <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                  API Key
                </div>
                <div className="font-mono text-xs mt-1">{status.hint ?? "•••• ••••"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                  Ultima sync
                </div>
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
                onClick={() => {
                  setEditing(true);
                  setApiKey("");
                  setPrivateKeyPem("");
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
                <div className="text-[11px] text-[var(--fg-subtle)]">
                  {syncResult.assetsSynced} asset sincronizzati
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-[var(--fg-muted)]">
              Incolla la tua <strong>API Key</strong> (64 caratteri data da Revolut quando hai
              creato la chiave) e la <strong>Private Key</strong> Ed25519 (il contenuto del
              file <code className="text-xs">private.pem</code>). Verranno cifrate{" "}
              <strong>AES-256-GCM</strong> nel DB locale.
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <div>
                Usa una API key con permessi <strong>solo "Vista Spot"</strong> (no operazioni,
                no MCP/CLI). Mai abilitare trading per questa app.
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] block mb-1">
                API Key (64 caratteri)
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="abc123…"
                className="w-full h-9 px-3 rounded bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[var(--fg-subtle)] block mb-1 inline-flex items-center gap-1">
                <Lock className="size-3" />
                Private Key (PEM Ed25519)
              </label>
              <textarea
                value={privateKeyPem}
                onChange={(e) => setPrivateKeyPem(e.target.value)}
                placeholder={"-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO...\n-----END PRIVATE KEY-----"}
                rows={6}
                className="w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono focus:outline-none focus:border-violet-500/50 resize-y"
              />
              <p className="text-[11px] text-[var(--fg-subtle)] mt-1">
                Trovi il contenuto con: <code>cat ~/.revolut-x/private.pem</code>
              </p>
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
                disabled={!apiKey || !privateKeyPem || saving}
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
                href="https://exchange.revolut.com"
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] ml-auto"
              >
                Apri Revolut X
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </div>
  );
}
