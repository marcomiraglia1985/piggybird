"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AIButton } from "@/components/ui/ai-button";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { ConfigureAiCta } from "@/components/ai/configure-ai-cta";
import { useAiConfigured } from "@/hooks/use-ai-configured";
import { cn } from "@/lib/utils";

type Section = { title: string; body: string };
type Commentary = {
  headline: string;
  lead: string;
  sections: Section[];
  watchouts: string[];
  generatedAt: string;
};

type Slide =
  | { kind: "cover"; headline: string; lead: string }
  | { kind: "section"; index: number; total: number; title: string; body: string }
  | { kind: "watchouts"; items: string[] };

/**
 * Sezione "Analisi del portafoglio" su /investimenti. Presentata a slide:
 * cover + 1 slide per sezione + slide finale watchouts. Navigabile con
 * prev/next, dots, e tasti freccia.
 *
 * Genera on-demand, cached fino a "Aggiorna analisi" manuale. Web search
 * Anthropic per news macro mirate al portafoglio.
 *
 * `personalityCompleted` server-passed: modula la copy dello stato vuoto.
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
  const [slideIdx, setSlideIdx] = useState(0);

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
      setSlideIdx(0); // ricomincia dalla cover dopo rigenerazione
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setGenerating(false);
    }
  }

  // Calcola slides dal commentary
  const slides = useMemo<Slide[]>(() => {
    if (!commentary) return [];
    const out: Slide[] = [];
    out.push({ kind: "cover", headline: commentary.headline, lead: commentary.lead });
    commentary.sections.forEach((s, i) =>
      out.push({
        kind: "section",
        index: i + 1,
        total: commentary.sections.length,
        title: s.title,
        body: s.body,
      }),
    );
    if (commentary.watchouts.length > 0) {
      out.push({ kind: "watchouts", items: commentary.watchouts });
    }
    return out;
  }, [commentary]);

  // Clamp slideIdx se le slides cambiano
  useEffect(() => {
    if (slideIdx >= slides.length && slides.length > 0) setSlideIdx(0);
  }, [slides.length, slideIdx]);

  // Keyboard navigation: ←/→
  useEffect(() => {
    if (slides.length === 0) return;
    function onKey(e: KeyboardEvent) {
      // Skip se l'utente sta scrivendo in un input
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") setSlideIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setSlideIdx((i) => Math.min(slides.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

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
        <article className={cn("space-y-3", generating && "opacity-60")}>
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

          <SlideStage slide={slides[slideIdx]} totalSections={commentary.sections.length} />

          <SlideNav
            currentIdx={slideIdx}
            total={slides.length}
            slides={slides}
            onSelect={setSlideIdx}
          />

          <Footer commentary={commentary} />
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

function SlideStage({
  slide,
  totalSections,
}: {
  slide: Slide | undefined;
  totalSections: number;
}) {
  if (!slide) return null;
  // Min-height per evitare salti tra slide di lunghezze diverse.
  return (
    <div className="min-h-[280px] py-2">
      {slide.kind === "cover" && (
        <SlideContent
          eyebrow="Cover"
          eyebrowDetail={`${totalSections} capitol${totalSections === 1 ? "o" : "i"}`}
        >
          <h3 className="text-xl font-semibold leading-tight tracking-tight">
            {slide.headline}
          </h3>
          {slide.lead && (
            <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
              {slide.lead}
            </p>
          )}
        </SlideContent>
      )}
      {slide.kind === "section" && (
        <SlideContent
          eyebrow={`Capitolo ${slide.index}`}
          eyebrowDetail={`di ${slide.total}`}
        >
          <h3 className="text-lg font-semibold leading-tight tracking-tight">
            {slide.title}
          </h3>
          <div className="space-y-2.5 text-sm leading-relaxed text-[var(--fg)]">
            {slide.body
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
          </div>
        </SlideContent>
      )}
      {slide.kind === "watchouts" && (
        <SlideContent eyebrow="Da tenere d'occhio" eyebrowTone="amber">
          <ul className="space-y-2.5 text-sm leading-relaxed">
            {slide.items.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </SlideContent>
      )}
    </div>
  );
}

function SlideContent({
  eyebrow,
  eyebrowDetail,
  eyebrowTone = "orange",
  children,
}: {
  eyebrow: string;
  eyebrowDetail?: string;
  eyebrowTone?: "orange" | "amber";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div
        className={cn(
          "text-[11px] uppercase tracking-[0.2em] font-semibold inline-flex items-center gap-1.5",
          eyebrowTone === "amber" ? "text-amber-300" : "text-orange-300/80",
        )}
      >
        {eyebrow}
        {eyebrowDetail && (
          <span className="text-[var(--fg-subtle)] font-normal normal-case tracking-normal">
            · {eyebrowDetail}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SlideNav({
  currentIdx,
  total,
  slides,
  onSelect,
}: {
  currentIdx: number;
  total: number;
  slides: Slide[];
  onSelect: (i: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]/40">
      <button
        type="button"
        onClick={() => onSelect(Math.max(0, currentIdx - 1))}
        disabled={currentIdx === 0}
        className="size-8 inline-flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Slide precedente"
      >
        <ChevronLeft className="size-4" />
      </button>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {slides.map((s, i) => {
          const isActive = i === currentIdx;
          const isWatchout = s.kind === "watchouts";
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              title={
                s.kind === "cover"
                  ? "Cover"
                  : s.kind === "section"
                    ? `Capitolo ${s.index}: ${s.title}`
                    : "Da tenere d'occhio"
              }
              className={cn(
                "h-1.5 rounded-full transition-all",
                isActive
                  ? isWatchout
                    ? "w-6 bg-amber-400"
                    : "w-6 bg-orange-400"
                  : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--fg-subtle)]",
              )}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--fg-subtle)] tabular-nums min-w-[40px] text-right">
          {currentIdx + 1} / {total}
        </span>
        <button
          type="button"
          onClick={() => onSelect(Math.min(total - 1, currentIdx + 1))}
          disabled={currentIdx === total - 1}
          className="size-8 inline-flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Slide successiva"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Footer({ commentary }: { commentary: Commentary }) {
  const ageDays = Math.floor(
    (Date.now() - new Date(commentary.generatedAt).getTime()) / 86_400_000,
  );
  const isStale = ageDays >= 30;
  return (
    <div
      className={cn(
        "text-[10px] pt-1 flex items-center justify-between gap-2",
        isStale ? "text-amber-300" : "text-[var(--fg-subtle)]",
      )}
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
}
