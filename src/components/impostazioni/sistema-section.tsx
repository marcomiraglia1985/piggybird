"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ExternalLink, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";
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
        </div>
      </CardContent>
    </Card>
  );
}
