"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { AIBadge } from "@/components/ui/ai-button";
import { formatCostEur } from "@/lib/ai-pricing";

type CredentialStatus = {
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
};

type Usage = {
  lifetime: { calls: number; inputTokens: number; outputTokens: number; costEur: number };
  byFeature: Array<{ feature: string; calls: number; costEur: number }>;
};

export function AiFeaturesSection() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadAll() {
    const [credRes, usageRes] = await Promise.all([
      fetch("/api/ai/credential").then((r) => r.json()),
      fetch("/api/ai/usage").then((r) => r.json()),
    ]);
    setStatus(credRes);
    setUsage(usageRes);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function onSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/ai/credential", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Espandi il messaggio di errore in base allo status: la API ritorna
        // dettagli specifici (es. 401 = key invalida, 403 = quota, network err)
        // — usali invece del generico "Errore".
        const detail = typeof data?.error === "string" ? data.error : null;
        if (res.status === 401) {
          setError(
            detail ?? "API key non valida (401 unauthorized). Controlla che sia copiata correttamente.",
          );
        } else if (res.status === 403) {
          setError(
            detail ?? "Permessi insufficienti (403). La key potrebbe avere quota esaurita o scope limitati.",
          );
        } else if (res.status === 429) {
          setError(detail ?? "Troppe richieste (429). Attendi qualche secondo e riprova.");
        } else if (res.status >= 500) {
          setError(
            detail ?? `Errore server Anthropic (${res.status}). Riprova tra qualche minuto.`,
          );
        } else {
          setError(detail ?? `Errore (${res.status}). Riprova o controlla la console.`);
        }
      } else {
        setSuccess("API key salvata e validata.");
        setApiKey("");
        await loadAll();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (e) {
      // Network o JSON parse error — utente probabilmente offline
      setError(
        e instanceof TypeError && /fetch/i.test(String(e))
          ? "Errore di rete: controlla la connessione internet e riprova."
          : `Errore inatteso: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Rimuovere la API key? Tutte le feature AI saranno disabilitate.")) {
      return;
    }
    await fetch("/api/ai/credential", { method: "DELETE" });
    await loadAll();
    setSuccess("API key rimossa.");
    setTimeout(() => setSuccess(null), 3000);
  }

  return (
    <div className="space-y-2">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-4 text-orange-400" />
            Funzioni AI
            <AIBadge className="ml-1" />
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
          Connetti la tua <strong>Anthropic API key</strong> per abilitare le
          feature <strong>Moneybird Insights</strong> on-demand:
          auto-categorizzazione dei movimenti, osservazioni sul portfolio,
          rilevamento anomalie e altro. Ogni feature ha un bottone{" "}
          <span className="inline-flex items-center gap-1 text-orange-300">
            <Sparkles className="size-3" />
          </span>{" "}
          dedicato — niente token bruciati senza un tuo click esplicito. Le
          osservazioni sono educative e basate sui tuoi dati locali, non
          costituiscono consulenza finanziaria.
        </p>

        <div className="mt-3 text-[11px] text-[var(--fg-subtle)] inline-flex items-center gap-1.5">
          <ExternalLink className="size-3" />
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-orange-300"
          >
            Dove ottenere una API key →
          </a>
        </div>

        {status?.configured ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-xs flex items-start gap-2">
              <CheckCircle2 className="size-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-emerald-300">
                  API key configurata
                </div>
                <div className="text-[var(--fg-muted)] mt-0.5">
                  Chiave: <code className="text-[10px]">{status.hint}</code> ·
                  Validata il{" "}
                  {status.updatedAt
                    ? new Date(status.updatedAt).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={onDelete}
                title="Rimuovi API key"
                className="size-7 inline-flex items-center justify-center rounded text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {usage && (
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
                    Utilizzo totale
                  </span>
                  <span className="text-xs tabular-nums">
                    <strong>{formatCostEur(usage.lifetime.costEur)}</strong>
                    <span className="text-[var(--fg-subtle)]">
                      {" "}
                      · {usage.lifetime.calls} chiamate ·{" "}
                      {(usage.lifetime.inputTokens + usage.lifetime.outputTokens).toLocaleString()} tokens
                    </span>
                  </span>
                </div>
                {usage.byFeature.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border)]/50 space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                      Per feature
                    </span>
                    {usage.byFeature.map((f) => (
                      <div
                        key={f.feature}
                        className="flex items-baseline justify-between text-[11px]"
                      >
                        <span className="text-[var(--fg-muted)]">{f.feature}</span>
                        <span className="tabular-nums text-[var(--fg-subtle)]">
                          {formatCostEur(f.costEur)} · {f.calls} call
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-[var(--fg-subtle)] pt-1 border-t border-[var(--border)]/50">
                  Costi calcolati lato app sui prezzi pubblici Anthropic
                  (Sonnet $3/$15 per 1M, Haiku $0.80/$4 per 1M). Il valore
                  ufficiale lo trovi su{" "}
                  <a
                    href="https://console.anthropic.com/settings/usage"
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-orange-300"
                  >
                    console Anthropic
                  </a>
                  .
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <label className="block text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
              Anthropic API key
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 pr-9 text-sm font-mono focus:outline-none focus:border-orange-500/50"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
                  title={showKey ? "Nascondi" : "Mostra"}
                >
                  {showKey ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !apiKey.trim()}
                className="h-9 px-4 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white text-sm font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/40 disabled:opacity-40 disabled:shadow-none"
              >
                {saving ? "Verifica…" : "Salva e testa"}
              </button>
            </div>
            <p className="text-[10px] text-[var(--fg-subtle)]">
              La key viene cifrata (AES-256-GCM) prima di essere salvata in
              DB. Una mini-chiamata di test verifica che funzioni prima di
              salvarla.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/[0.08] p-2.5 text-xs flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-rose-400 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] p-2.5 text-xs flex items-start gap-2">
            <CheckCircle2 className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}
      </CardContent>
    </div>
  );
}
