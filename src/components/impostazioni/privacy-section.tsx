"use client";

import { useEffect, useState } from "react";
import { BarChart3, Shield, ExternalLink } from "lucide-react";
import {
  getTelemetryStatus,
  setTelemetryEnabled,
  type TelemetryStatus,
} from "@/lib/telemetry";
import { useToast } from "@/components/ui/toast";

/**
 * Sezione Impostazioni → Privacy: toggle telemetria anonima.
 *
 * Lo stato viene letto dal Setting "telemetry.enabled" (lo stesso che il modal
 * di consenso scrive). Toggling immediato: opt_in/opt_out PostHog senza ricarica.
 */
export function PrivacySection() {
  const { toast } = useToast();
  const [status, setStatus] = useState<TelemetryStatus>("enabled");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getTelemetryStatus().then(setStatus);
  }, []);

  async function toggle() {
    if (saving) return;
    const next = status !== "enabled";
    setSaving(true);
    try {
      await setTelemetryEnabled(next);
      setStatus(next ? "enabled" : "disabled");
      toast({
        title: next
          ? "Telemetria attivata"
          : "Telemetria disattivata",
        variant: "success",
        duration: 2500,
      });
    } catch {
      toast({ title: "Errore nel salvare la scelta", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const enabled = status === "enabled";

  return (
    <div className="surface p-5 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="size-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
          <BarChart3 className="size-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">Telemetria anonima</h3>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5 leading-relaxed">
            Aiuta a capire quali funzioni vengono usate e prioritizzare i
            miglioramenti. Niente dati finanziari, niente identità.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          aria-pressed={enabled}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
            enabled
              ? "bg-emerald-500/30 border-emerald-500/50"
              : "bg-[var(--surface-2)] border-[var(--border)]"
          }`}
        >
          <span
            className={`inline-block size-4 transform rounded-full transition-transform ${
              enabled
                ? "translate-x-6 bg-emerald-300"
                : "translate-x-1 bg-[var(--fg-subtle)]"
            }`}
          />
        </button>
      </div>

      <div className="rounded-xl bg-[var(--surface-2)]/50 border border-[var(--border)] p-3 text-[11px] space-y-1.5">
        <div className="font-medium text-emerald-400 inline-flex items-center gap-1.5">
          <Shield className="size-3" />
          Cosa viene raccolto
        </div>
        <ul className="text-[var(--fg-muted)] space-y-0.5 pl-4 list-disc leading-relaxed">
          <li>Versione app, sistema operativo (macOS/Windows/Linux), lingua</li>
          <li>Quali pagine/widget visiti (no contenuti, no parametri URL)</li>
          <li>Ogni quanto apri l&apos;app (heartbeat 1×/giorno)</li>
        </ul>
        <div className="font-medium text-rose-400 pt-1">
          Cosa NON viene raccolto, mai
        </div>
        <ul className="text-[var(--fg-muted)] space-y-0.5 pl-4 list-disc leading-relaxed">
          <li>Saldi, conti, movimenti, categorie, beneficiari</li>
          <li>Email, nome, IP, identità</li>
          <li>Note, descrizioni, tx individuali</li>
        </ul>
      </div>

      <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
        Server: PostHog EU (Belgio), GDPR-compliant. Identificati da un UUID
        random generato al primo avvio e salvato nel database locale, non
        collegabile alla tua identità. IP, browser, geolocalizzazione e altri
        fingerprint vengono filtrati prima dell&apos;invio. Errori dell&apos;app
        sono tracciati separatamente da Sentry (non da questa funzione). Stato
        attuale:{" "}
        <strong className={enabled ? "text-emerald-400" : "text-rose-400"}>
          {enabled ? "attiva" : "disattivata"}
        </strong>
        .{" "}
        <a
          href="https://posthog.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-violet-400 hover:underline inline-flex items-center gap-0.5"
        >
          Privacy policy PostHog
          <ExternalLink className="size-2.5" />
        </a>
      </p>
    </div>
  );
}
