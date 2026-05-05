"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Sparkles, ArrowUpRight, Loader2 } from "lucide-react";
import { AIButton } from "@/components/ui/ai-button";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { ConfigureAiCta } from "@/components/ai/configure-ai-cta";
import { useAiConfigured } from "@/hooks/use-ai-configured";

type Section = { title: string; body: string };
type Commentary = {
  headline: string;
  lead: string;
  sections: Section[];
  watchouts: string[];
  generatedAt: string;
};

/**
 * Sezione "Analisi del portafoglio" su /investimenti. On-demand, cached
 * fino a "Aggiorna analisi" manuale. Usa web_search Anthropic per news
 * macro mirate al portafoglio.
 *
 * `personalityCompleted` è server-passed dalla page: serve per modulare la
 * copy dello stato vuoto (se il test è fatto, lo diciamo; se no, linkiamo
 * direttamente a /impostazioni/personality per farlo).
 */
export function InvestmentCommentarySection({
  personalityCompleted,
}: {
  personalityCompleted: boolean;
}) {
  const aiConfigured = useAiConfigured();
  const [commentary, setCommentary] = useState<Commentary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/investment-commentary")
      .then((r) => r.json())
      .then((d) => setCommentary(d.commentary ?? null))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/investment-commentary", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setCommentary(json.commentary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="surface p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold inline-flex items-center gap-1.5">
            <Sparkles className="size-4 text-orange-400" />
            Analisi del portafoglio
          </h2>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Note di analisi multidimensionale: concentrazione, performance vs
            benchmark, allineamento al profilo, FX, regime macro corrente.
          </p>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            <span className="font-medium text-[var(--fg)]">
              Cadenza consigliata:
            </span>{" "}
            mensile, o on-demand al cambio scenario (deposito/ritiro
            significativo, ribilanciamento, evento macro).
          </p>
        </div>
        {commentary && aiConfigured !== false && (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="text-[11px] text-[var(--fg-subtle)] hover:text-[var(--fg)] inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Forza una nuova analisi (sostituisce quella corrente)"
          >
            <RefreshCw className={`size-3 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Aggiorno…" : "Aggiorna"}
          </button>
        )}
      </header>

      {loading ? (
        <div className="text-xs text-[var(--fg-subtle)]">Caricamento…</div>
      ) : aiConfigured === false ? (
        <ConfigureAiCta />
      ) : !commentary ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Genera la prima analisi del tuo portafoglio. Recupera news macro
            recenti per contestualizzare i dati
            {personalityCompleted ? (
              <>
                {" "}e usa il tuo profilo psico-finanziario per modulare
                l&apos;interpretazione.
              </>
            ) : (
              "."
            )}
          </p>
          {!personalityCompleted && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-3 flex items-start gap-2">
              <Sparkles className="size-3.5 text-violet-300 mt-0.5 shrink-0" />
              <div className="space-y-1.5 text-[11px] leading-relaxed flex-1">
                <p className="text-[var(--fg)]">
                  Per un&apos;analisi più precisa, fai prima il test di
                  personalità finanziaria — l&apos;analisi userà i tuoi tratti
                  comportamentali (avversione alle perdite, calma sotto
                  pressione, money scripts) per inquadrare i numeri.
                </p>
                <Link
                  href="/impostazioni/personality"
                  className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200 font-medium"
                >
                  Vai al test
                  <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </div>
          )}
          <AIButton
            variant="default"
            size="sm"
            onClick={generate}
            loading={generating}
            disabled={generating}
          >
            {generating ? "Analizzo…" : "Genera analisi"}
          </AIButton>
          {error && (
            <div className="text-[11px] text-rose-400 inline-flex items-start gap-1.5 pt-1">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <article className={`space-y-4 ${generating ? "opacity-60" : ""}`}>
          {generating && (
            <div className="rounded-lg border border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-rose-500/10 p-3 flex items-center gap-2.5 text-xs">
              <Loader2 className="size-4 text-orange-400 animate-spin shrink-0" />
              <div className="flex-1 leading-snug">
                <div className="font-medium text-orange-200">
                  Sto rigenerando l&apos;analisi…
                </div>
                <div className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                  Web search + sintesi: può richiedere 30-60 secondi.
                  L&apos;analisi corrente sotto resta visibile finché non arriva
                  la nuova.
                </div>
              </div>
            </div>
          )}
          <header className="space-y-2">
            <h3 className="text-lg font-semibold leading-tight tracking-tight">
              {commentary.headline}
            </h3>
            {commentary.lead && (
              <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
                {commentary.lead}
              </p>
            )}
          </header>
          {commentary.sections.length > 0 && (
            <div className="space-y-5 pt-1 border-t border-[var(--border)]/40">
              {commentary.sections.map((s, i) => {
                const paragraphs = s.body
                  .split(/\n\n+/)
                  .map((p) => p.trim())
                  .filter(Boolean);
                return (
                  <div key={i} className="space-y-2 pt-3">
                    <h4 className="text-[11px] uppercase tracking-[0.2em] font-semibold text-orange-300/80">
                      {s.title}
                    </h4>
                    <div className="space-y-2.5 text-sm leading-relaxed text-[var(--fg)]">
                      {paragraphs.length > 0
                        ? paragraphs.map((p, pi) => (
                            <p key={pi} className="whitespace-pre-line">
                              {p}
                            </p>
                          ))
                        : (
                          <p className="whitespace-pre-line">{s.body}</p>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {commentary.watchouts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 space-y-1.5">
              <div className="text-[11px] uppercase tracking-widest font-semibold text-amber-300 inline-flex items-center gap-1.5">
                <AlertTriangle className="size-3" />
                Da tenere d&apos;occhio
              </div>
              <ul className="space-y-1 text-sm leading-snug">
                {commentary.watchouts.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-400 shrink-0">▸</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(() => {
            const ageDays = Math.floor(
              (Date.now() - new Date(commentary.generatedAt).getTime()) /
                86_400_000,
            );
            const isStale = ageDays >= 30;
            return (
              <div
                className={`text-[10px] pt-1 border-t border-[var(--border)]/40 flex items-center justify-between gap-2 ${
                  isStale ? "text-amber-300" : "text-[var(--fg-subtle)]"
                }`}
              >
                <span>
                  Generata il{" "}
                  {new Date(commentary.generatedAt).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {ageDays > 0 && (
                    <>
                      {" "}— {ageDays} giorn{ageDays === 1 ? "o" : "i"} fa
                    </>
                  )}
                </span>
                {isStale && (
                  <span className="inline-flex items-center gap-1 font-medium">
                    <AlertTriangle className="size-3" />
                    Analisi vecchia, conviene aggiornarla
                  </span>
                )}
              </div>
            );
          })()}
          {error && (
            <div className="text-[11px] text-rose-400 inline-flex items-start gap-1.5">
              <AlertTriangle className="size-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <AiDisclaimer />
        </article>
      )}
    </section>
  );
}
