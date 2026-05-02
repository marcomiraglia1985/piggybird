"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ExternalLink, Key, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";
import { openExternal } from "@/lib/open-external";

type CheckResult = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  downloadName?: string | null;
  downloadSize?: number | null;
  info?: string;
  error?: string;
};

export function SistemaSection({ version }: { version: string }) {
  const [autostart, setAutostart] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [keyExportLoading, setKeyExportLoading] = useState(false);
  const [keyExported, setKeyExported] = useState<string | null>(null);
  const [keyImportInput, setKeyImportInput] = useState("");
  const [keyImportMsg, setKeyImportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function exportKey() {
    setKeyExportLoading(true);
    setKeyExported(null);
    try {
      const r = await fetch("/api/system/master-key", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Errore");
      setKeyExported(j.key);
      try {
        await navigator.clipboard.writeText(j.key);
      } catch {}
    } catch (e) {
      setKeyExported(null);
      window.alert("Errore export: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setKeyExportLoading(false);
    }
  }

  async function importKey() {
    setKeyImportMsg(null);
    const trimmed = keyImportInput.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(trimmed)) {
      setKeyImportMsg({ type: "err", text: "La chiave deve essere 64 caratteri esadecimali (a-f, 0-9)." });
      return;
    }
    if (
      !window.confirm(
        "Stai per sovrascrivere la chiave master. Le credenziali API esistenti diventeranno illeggibili se la chiave nuova non corrisponde a quella usata per cifrarle. Continuare?",
      )
    ) {
      return;
    }
    try {
      const r = await fetch("/api/system/master-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Errore");
      setKeyImportMsg({ type: "ok", text: "Chiave importata. Le credenziali API ora si decrittano con questa chiave." });
      setKeyImportInput("");
    } catch (e) {
      setKeyImportMsg({ type: "err", text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function checkForUpdates() {
    setChecking(true);
    setResult(null);
    try {
      // Cache-bust con timestamp così il browser non serve risposta cached
      const r = await fetch(`/api/check-update?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = (await r.json()) as CheckResult;
      setResult(data);
    } catch (e) {
      setResult({
        current: version,
        latest: null,
        updateAvailable: false,
        error: e instanceof Error ? e.message : "Errore di rete",
      });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sistema</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium inline-flex items-center gap-1.5">
                Apri all&apos;avvio del computer
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-subtle)] inline-flex items-center gap-1">
                  <Lock className="size-3" /> richiede app desktop
                </span>
              </div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Disponibile dalla versione desktop (Tauri). Sulla versione web/locale non
                applicabile.
              </p>
            </div>
            <label className="inline-flex items-center cursor-not-allowed opacity-50">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
                disabled
                className="size-4 accent-violet-500"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)]/50">
            <div>
              <div className="font-medium">Versione</div>
              <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                Build attualmente installata
              </p>
            </div>
            <span className="font-mono text-sm">v{version}</span>
          </div>

          <div className="space-y-2 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Aggiornamenti</div>
                <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                  Controlla manualmente se c&apos;è una nuova versione su GitHub.
                </p>
              </div>
              <button
                onClick={checkForUpdates}
                disabled={checking}
                className="h-8 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {checking ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Controllo…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3" />
                    Controlla ora
                  </>
                )}
              </button>
            </div>

            {result && !result.error && result.updateAvailable && (
              <div className="rounded-lg border border-violet-500/40 bg-violet-500/[0.06] p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-violet-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-violet-700 dark:text-violet-200">
                      Nuova versione disponibile: v{result.latest}
                    </p>
                    {result.releaseNotes && (
                      <p className="text-[11px] text-[var(--fg-muted)] mt-1 leading-relaxed line-clamp-3">
                        {result.releaseNotes}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = result.downloadUrl ?? result.releaseUrl;
                    if (url) openExternal(url);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 w-full h-8 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-medium hover:shadow-md"
                >
                  Scarica v{result.latest}
                  <ExternalLink className="size-3" />
                </button>
                {result.downloadSize && (
                  <p className="text-[10px] text-[var(--fg-subtle)] text-center">
                    {(result.downloadSize / 1024 / 1024).toFixed(0)} MB ·{" "}
                    {result.downloadName}
                  </p>
                )}
              </div>
            )}

            {result && !result.error && !result.updateAvailable && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-2 inline-flex items-center gap-2 w-full">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="text-xs text-[var(--fg-muted)]">
                  Sei già sulla versione più recente (v{result.current})
                </span>
              </div>
            )}

            {result?.error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/[0.06] p-2 text-xs text-rose-700 dark:text-rose-300">
                Errore: {result.error}
              </div>
            )}

            {result?.info && !result.updateAvailable && !result.error && (
              <p className="text-[11px] text-[var(--fg-subtle)] mt-1">{result.info}</p>
            )}
          </div>

          <div className="space-y-2 py-2 border-t border-[var(--border)]/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium inline-flex items-center gap-1.5">
                  <Key className="size-3.5 text-violet-400" />
                  Chiave di backup
                </div>
                <p className="text-[11px] text-[var(--fg-subtle)] mt-0.5 leading-relaxed">
                  La chiave master cifra le tue API keys (Anthropic, broker). Esportala e
                  conservala in un password manager: se il DB si corrompe, potrai
                  re-importarla per recuperare le credenziali.
                </p>
              </div>
              <button
                onClick={exportKey}
                disabled={keyExportLoading}
                className="h-8 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0"
              >
                {keyExportLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Export…
                  </>
                ) : (
                  <>
                    <Key className="size-3" />
                    Esporta
                  </>
                )}
              </button>
            </div>

            {keyExported && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.06] p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="font-medium text-emerald-700 dark:text-emerald-200">
                    Chiave copiata negli appunti
                  </span>
                </div>
                <code className="block text-[10px] font-mono break-all bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 text-[var(--fg-muted)] select-all">
                  {keyExported}
                </code>
                <p className="text-[10px] text-[var(--fg-subtle)]">
                  Salvala SUBITO in un password manager (1Password, Bitwarden, ecc.).
                  Non condividerla con nessuno: chi ha questa chiave può decrittare le
                  tue API keys salvate.
                </p>
              </div>
            )}

            <details className="group">
              <summary className="text-[11px] text-[var(--fg-muted)] cursor-pointer hover:text-[var(--fg)] inline-flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform">▸</span>
                Importa chiave da backup
              </summary>
              <div className="mt-2 space-y-2 pl-3">
                <input
                  type="text"
                  value={keyImportInput}
                  onChange={(e) => setKeyImportInput(e.target.value)}
                  placeholder="64 caratteri esadecimali"
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-xs font-mono focus:outline-none focus:border-violet-500/50"
                  autoComplete="off"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={importKey}
                    disabled={!keyImportInput.trim()}
                    className="h-8 px-3 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 disabled:opacity-40"
                  >
                    Importa
                  </button>
                  {keyImportMsg && (
                    <span
                      className={`text-[11px] ${
                        keyImportMsg.type === "ok"
                          ? "text-emerald-600 dark:text-emerald-300"
                          : "text-rose-600 dark:text-rose-300"
                      }`}
                    >
                      {keyImportMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </details>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
