"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AIButton } from "@/components/ui/ai-button";
import { ConfigureAiCta } from "@/components/ai/configure-ai-cta";
import { useAiConfigured } from "@/hooks/use-ai-configured";
import { WidgetHelpPopover } from "./widget-help-popover";
import { WidgetSettingsPopover } from "./widget-settings-popover";

type Issue = {
  headline: string;
  lead: string;
  highlights: string[];
  watchout: string | null;
  isSpecialEdition: boolean;
  generatedAt: string;
};

/**
 * "Piggybird Finance" — editoriale mensile AI.
 * Layout masthead newspaper compatto (1-col).
 * Una sola generazione/mese: dopo il click il bottone scompare.
 */
export function NetWorthInsightsWidget() {
  const router = useRouter();
  const aiConfigured = useAiConfigured();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [monthLabel, setMonthLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/ai/networth-insights")
      .then((r) => r.json())
      .then((d) => {
        setIssue(d.issue ?? null);
        setNotifyEnabled(!!d.notifyEnabled);
        // Estrai monthLabel dal key (es. "insights.networth.2026-04")
        if (typeof d.key === "string") {
          const m = d.key.match(/(\d{4})-(\d{2})$/);
          if (m) {
            const months = [
              "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
              "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
            ];
            setMonthLabel(`${months[parseInt(m[2], 10) - 1]} ${m[1]}`);
          }
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function toggleNotify(enabled: boolean) {
    setNotifyEnabled(enabled);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "pf-notify-new-issue",
          value: enabled ? "true" : "false",
        }),
      });
    } catch {
      // Rollback ottimistico in caso di errore di rete
      setNotifyEnabled(!enabled);
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/networth-insights", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setIssue(json.issue);
      if (json.monthLabel) setMonthLabel(json.monthLabel);
      // Re-render layout così il banner "in attesa" sparisce subito
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card id="piggybird-finance" className="!p-0 !border-0 relative scroll-mt-24">
      {!loading && (
        <img
          src="/piggybird-finance.png"
          alt="Piggybird Finance"
          className="absolute top-1 left-5 size-[71px] z-20 select-none pointer-events-none"
          draggable={false}
        />
      )}
      {issue && !loading && (
        <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
          <WidgetHelpPopover title="Piggybird Finance">
            <p>
              <strong className="text-[var(--fg)]">Piggybird Finance</strong> è
              la rubrica mensile della tua app: un editoriale che racconta in
              stile giornalistico cosa è successo ai tuoi numeri questo mese.
            </p>
            <p>
              Esce <strong>una volta al mese</strong>. I dati sono pre-calcolati
              localmente: net worth, savings rate, top spese, allocation,
              posizioni di trading, anomalie. La redazione AI sceglie quale
              storia raccontare e la formula in tono semi-serio — Bloomberg
              meets NYT.
            </p>
            <p className="text-[var(--fg-subtle)]">
              Se siamo prima del giorno 15 il numero copre il mese precedente
              (mese chiuso); altrimenti il mese in corso.
            </p>
          </WidgetHelpPopover>
          <WidgetSettingsPopover title="Piggybird Finance">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--fg)] disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${generating ? "animate-spin" : ""}`} />
              {generating ? "In stampa…" : "Ristampa il numero"}
            </button>
            <p className="text-[10px] text-[var(--fg-subtle)] leading-relaxed">
              Forza una nuova generazione del numero corrente. Sostituisce
              l&apos;edizione attuale.
            </p>
            <label className="flex items-start gap-2 pt-2 mt-1 border-t border-[var(--border)] cursor-pointer">
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={(e) => toggleNotify(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span className="space-y-0.5">
                <span className="block text-[var(--fg)] font-medium">
                  Avvisami quando il prossimo numero è in attesa
                </span>
                <span className="block text-[10px] text-[var(--fg-subtle)] leading-relaxed">
                  All&apos;inizio del mese, un avviso in alto ti ricorda che la
                  nuova edizione aspetta solo il tuo via.
                </span>
              </span>
            </label>
          </WidgetSettingsPopover>
        </div>
      )}
      {loading ? (
        <div className="p-6 text-xs text-[var(--fg-subtle)]">Caricamento…</div>
      ) : aiConfigured === false ? (
        <div className="p-5 space-y-3">
          <Masthead monthLabel={monthLabel ?? "—"} />
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Configura la tua API key in Impostazioni → Funzioni AI per ricevere
            il numero mensile di Piggybird Finance: un editoriale sui tuoi numeri.
          </p>
          <ConfigureAiCta />
        </div>
      ) : !issue ? (
        <div className="p-5 space-y-3">
          <Masthead monthLabel={monthLabel ?? "—"} />
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Edizione di <strong>{monthLabel ?? "questo mese"}</strong> ancora
            in bozza. La redazione del Piggybird Finance aspetta solo il tuo
            via — un click e va in stampa.
          </p>
          <div className="flex justify-center pt-1">
            <AIButton
              variant="default"
              size="sm"
              onClick={generate}
              loading={generating}
              disabled={generating}
            >
              {generating
                ? "In stampa…"
                : `Apri il numero di ${monthLabel ?? "questo mese"}`}
            </AIButton>
          </div>
          {error && (
            <div className="text-[11px] text-rose-400 inline-flex items-start gap-1.5 pt-1 justify-center">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <article className="newspaper-paper p-5 rounded-xl space-y-3 font-serif">
          <Masthead
            monthLabel={monthLabel ?? "—"}
            isSpecialEdition={issue.isSpecialEdition}
          />
          {/* Headline */}
          <h3 className="newspaper-headline text-base leading-tight tracking-tight">
            {issue.headline}
          </h3>
          {/* Lead con drop cap + giustificato */}
          {issue.lead && (
            <p className="newspaper-lead text-xs leading-relaxed text-[var(--fg-muted)]">
              {issue.lead}
            </p>
          )}
          {/* Highlights — "I numeri del mese" */}
          {issue.highlights.length > 0 && (
            <div className="border-t border-b border-double border-[var(--border)]/80 py-2.5 my-3">
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--fg-subtle)] mb-1.5 font-sans font-semibold text-center">
                · I numeri del mese ·
              </div>
              <ul className="space-y-1.5 text-xs leading-snug">
                {issue.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="newspaper-ink-mark shrink-0">▸</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Watchout — pull-quote */}
          {issue.watchout && (
            <div className="newspaper-pullquote text-xs leading-snug px-3 py-2 rounded-r flex items-start gap-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 not-italic" />
              <span>{issue.watchout}</span>
            </div>
          )}
          {/* Footer */}
          <div className="pt-2 border-t border-[var(--border)]/60 text-[9px] text-[var(--fg-subtle)] flex items-center justify-between font-sans">
            <span className="newspaper-dateline inline-flex items-center gap-1">
              <Sparkles className="size-2.5 newspaper-ink-mark not-italic" />
              Edizione del{" "}
              {new Date(issue.generatedAt).toLocaleDateString("it-IT", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="tracking-wider uppercase">Piggybird Finance</span>
          </div>
        </article>
      )}
    </Card>
  );
}

function Masthead({
  monthLabel,
  isSpecialEdition,
}: {
  monthLabel: string;
  isSpecialEdition?: boolean;
}) {
  return (
    <div className="text-center border-b-2 border-double border-[var(--border)] mb-[15px] font-serif -mt-5 h-[79px] flex flex-col justify-center">
      {isSpecialEdition && (
        <div className="inline-block text-[9px] tracking-widest uppercase font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded mb-1">
          Edizione Speciale
        </div>
      )}
      <div className="text-base font-bold tracking-tight uppercase">
        Piggybird <span className="italic font-medium">Finance</span>
      </div>
      <div className="text-[10px] text-[var(--fg-subtle)] tracking-wider uppercase mt-0.5">
        Numero di {monthLabel}
      </div>
    </div>
  );
}
