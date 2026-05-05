"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import pkg from "../../../package.json";

/**
 * Welcome tutorial mostrato la PRIMA volta che l'utente arriva sulla
 * Dashboard. 5 step:
 *   1. Modal welcome al centro (versione app + Team Panino)
 *   2-5. Tooltip ancorati a sidebar items (movimenti, conti, import, impostazioni)
 *
 * Persistenza: flag `tutorial.dashboard.completed=1` in Setting al click
 * sull'ultimo "Fine". Dopo questo il tutorial non riappare più (anche al
 * refresh dell'app).
 *
 * Per ri-mostrare manualmente: cancellare la riga Setting con quella key.
 */

type Step =
  | { kind: "modal"; title: string; body: React.ReactNode }
  | { kind: "tooltip"; target: string; title: string; body: React.ReactNode };

const STEPS: Step[] = [
  {
    kind: "modal",
    title: "Benvenuto in Piggybird",
    body: (
      <>
        Il tuo nuovo assistente per la finanza personale.
        <br />
        <br />
        Questa versione è la <strong>v{pkg.version}</strong> e sei uno degli
        utenti scelti per il betatest.
        <br />
        <br />
        Congratulazioni e grazie da parte di <strong>Team Panino</strong>! 🐦
      </>
    ),
  },
  {
    kind: "tooltip",
    target: "movimenti",
    title: "Movimenti",
    body: "Qui potrai elencare i tuoi movimenti uno ad uno e scegliere la categoria a cui appartengono.",
  },
  {
    kind: "tooltip",
    target: "conti",
    title: "Conti",
    body: "Ma prima dovrai configurare un tuo conto qui. Al momento i conti sono Congelati finché non li scongelerai. I conti congelati ti permettono di configurare e importare i tuoi movimenti passati, e di fare fine tuning a cifre e categorie senza pericolo. Una volta pronto, potrai andare Live dalla tab Conti.",
  },
  {
    kind: "tooltip",
    target: "import",
    title: "Importa CSV",
    body: "Ti consigliamo, dopo aver aperto un conto, di importare il CSV corrispondente. Il CSV è scaricabile da ogni banca e riporta tutti i tuoi movimenti passati per il periodo che scegli — partiamo subito con buona parte del tuo storico (potrai sistemare a mano categorie e beneficiari in seguito). Solo alcune banche/broker sono supportati nativamente, ma la beta ti dà una call gratis alla AI di Piggybird per configurare CSV di banche nuove. Nota: feature in sviluppo, potrebbe non funzionare al 100%.",
  },
  {
    kind: "tooltip",
    target: "impostazioni",
    title: "Impostazioni",
    body: "Prima di iniziare ti suggeriamo di prenderti 5 minuti per regolare il tuo profilo e — perché no — fare il nostro test di personalità finanziaria per scoprire il tuo archetipo da risparmiatore. Il tuo profilo sarà utilissimo quando attiveremo Piggybird Insights — osservazioni educative e personalizzate sui tuoi dati locali. Grazie per aver scelto di volare con Piggybird!",
  },
];

const SETTING_KEY = "tutorial.dashboard.completed";

export function WelcomeTutorial() {
  const [step, setStep] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState<number>(0);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Measure tooltip altezza reale post-render → riposiziona se necessario
  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const h = tooltipRef.current.offsetHeight;
    if (h > 0 && h !== tooltipHeight) setTooltipHeight(h);
  });

  // Tutorial parte SOLO se entrambe condizioni:
  //   1. tutorial.dashboard.completed != "1" (mai fatto)
  //   2. profile.completed == true (utente è oltre il welcome onboarding)
  //
  // Trigger:
  //   - Al mount, se già condizione vera → parte (caso "vecchio utente")
  //   - Su evento "fp-onboarding-done" emesso dal welcome al save
  //     (caso "fresh user che ha appena completato l'onboarding")
  useEffect(() => {
    let aborted = false;
    let started = false;

    async function maybeStart() {
      if (started || aborted) return;
      const [settings, profile] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()).catch(() => null),
        fetch("/api/profile").then((r) => r.json()).catch(() => null),
      ]);
      if (aborted) return;
      const tutorialDone = settings?.settings?.[SETTING_KEY] === "1";
      const profileDone = profile?.completed === true;
      if (!tutorialDone && profileDone) {
        started = true;
        setTimeout(() => setStep(0), 400);
      }
    }

    // Check al mount (utente che riapre la app col profilo già fatto)
    maybeStart();

    // Listen evento dal welcome onboarding (fresh user appena completato)
    const onOnboardingDone = () => maybeStart();
    window.addEventListener("fp-onboarding-done", onOnboardingDone);

    return () => {
      aborted = true;
      window.removeEventListener("fp-onboarding-done", onOnboardingDone);
    };
  }, []);

  // Track target rect per posizionare il tooltip sopra/accanto alla sidebar.
  // Retry-with-timeout: se hot reload non ha ancora applicato i data-tutorial
  // attributes (Turbopack a volte ritarda) o se la sidebar è nascosta su
  // viewport mobile, ritenta per ~3s prima di skippare lo step.
  useLayoutEffect(() => {
    if (step == null) return;
    const cur = STEPS[step];
    if (cur.kind !== "tooltip") {
      setTargetRect(null);
      return;
    }
    const target = cur.target;
    let pollHandle: number | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 × 100ms = 3s

    const findAndSet = (): boolean => {
      const el = document.querySelector(`[data-tutorial="${target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        // Verify element is actually visible (not display:none / off-screen)
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);
          return true;
        }
      }
      return false;
    };

    if (!findAndSet()) {
      pollHandle = window.setInterval(() => {
        attempts++;
        if (findAndSet() || attempts >= MAX_ATTEMPTS) {
          if (pollHandle != null) window.clearInterval(pollHandle);
          if (attempts >= MAX_ATTEMPTS) {
            console.warn(
              `[tutorial] target [data-tutorial="${target}"] non trovato dopo ${MAX_ATTEMPTS * 100}ms — skip step`,
            );
            // Skip to next step automaticamente
            setStep((s) => (s == null ? null : s + 1 < STEPS.length ? s + 1 : null));
          }
        }
      }, 100);
    }

    const update = () => {
      findAndSet();
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      if (pollHandle != null) window.clearInterval(pollHandle);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  if (!mounted || step == null) return null;
  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  async function next() {
    if (isLast) {
      setStep(null);
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: SETTING_KEY, value: "1" }),
        });
      } catch {
        // Fail silently — l'utente potrebbe rivederlo al prossimo reload.
        // Non-critical perché il flow è "una tantum benvenuto".
      }
    } else {
      setStep((s) => (s ?? 0) + 1);
    }
  }

  function skip() {
    setStep(null);
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: SETTING_KEY, value: "1" }),
    }).catch(() => {});
  }

  // ============================================================================
  // MODAL (centered, step 0)
  // ============================================================================
  if (cur.kind === "modal") {
    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md rounded-2xl border border-violet-500/40 bg-[var(--surface)] shadow-2xl p-6 text-center space-y-4"
          >
            <div className="size-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-500/30">
              🐦
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight mb-2">
                {cur.title}
              </h2>
              <div className="text-sm text-[var(--fg-muted)] leading-relaxed">
                {cur.body}
              </div>
            </div>
            <Dots step={step} />
            <button
              onClick={next}
              className="w-full h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-violet-500/40 inline-flex items-center justify-center gap-2 transition-shadow"
            >
              Iniziamo il tour
              <ChevronRight className="size-4" />
            </button>
            <button
              onClick={skip}
              className="text-[11px] text-[var(--fg-subtle)] hover:text-[var(--fg-muted)] underline underline-offset-2"
            >
              Salta tour
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  }

  // ============================================================================
  // TOOLTIP (sidebar-anchored, steps 1-4)
  // ============================================================================
  if (!targetRect) return null;
  const tooltipLeft = targetRect.right + 16;
  // Posiziono il tooltip via top + height intera (no translateY), così è
  // facile clamparlo in viewport. Strategia:
  //   - se ci sta centrato sul target → centro
  //   - se uscirebbe in basso → top = viewport.height - tooltipHeight - padding
  //   - se uscirebbe in alto → top = padding
  const VIEWPORT_PADDING = 16;
  // Fallback height al primo render (prima del measure): 320 = stima media
  const measuredH = tooltipHeight > 0 ? tooltipHeight : 320;
  const targetCenter = targetRect.top + targetRect.height / 2;
  const idealTop = targetCenter - measuredH / 2;
  const minTop = VIEWPORT_PADDING;
  const maxTop = window.innerHeight - measuredH - VIEWPORT_PADDING;
  const tooltipTop = Math.max(minTop, Math.min(maxTop, idealTop));
  // Arrow Y: posizione sul target relativa al tooltip top
  const arrowY = Math.max(
    16,
    Math.min(measuredH - 16, targetCenter - tooltipTop),
  );

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
        onClick={next}
      />
      <motion.div
        key="ring"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed z-[101] rounded-lg pointer-events-none ring-2 ring-violet-400 ring-offset-2 ring-offset-[var(--bg)]"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
        }}
      />
      <motion.div
        key="tt"
        ref={tooltipRef}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        style={{ top: tooltipTop, left: tooltipLeft }}
        className="fixed z-[102] w-80 rounded-xl border border-violet-500/40 bg-[var(--surface)] shadow-2xl p-4"
      >
        {/* Arrow puntante alla sidebar — Y dinamico per restare allineato
            sul target anche quando il tooltip è clamped in viewport */}
        <div
          style={{ top: arrowY }}
          className="absolute right-full -translate-y-1/2 -mr-[6px] size-3 rotate-45 bg-[var(--surface)] border-l border-b border-violet-500/40"
        />

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-violet-700 dark:text-violet-200">
              {cur.title}
            </h3>
            <p className="text-xs text-[var(--fg-muted)] mt-1.5 leading-relaxed">
              {cur.body}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <Dots step={step} />
            <button
              onClick={next}
              className="h-8 px-3 rounded-lg bg-violet-500 text-white text-xs font-medium inline-flex items-center gap-1 hover:bg-violet-600"
            >
              {isLast ? "Fine" : "Avanti"}
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((_, i) => (
        <span
          key={i}
          className={
            i === step
              ? "size-1.5 rounded-full bg-violet-500"
              : i < step
                ? "size-1.5 rounded-full bg-violet-400/60"
                : "size-1.5 rounded-full bg-[var(--fg-subtle)]/30"
          }
        />
      ))}
    </div>
  );
}
