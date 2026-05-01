"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Lock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { ARCHETYPES, type Axes } from "@/lib/personality-archetypes";
import type { PersonalityProfile } from "@/lib/personality";

/**
 * Personality Test client wizard.
 *
 * Stages:
 *   - "intro" → privacy disclaimer + start button (o "Rifai" se già completato)
 *   - "result" (caso già completato): mostra archetype + comparison + reset
 *   - "section-N" → step del wizard (Fase 1: 1 sezione "Money Story" con 3 q)
 *   - "computing" → spinner mentre POST /api/personality
 *   - "done" → archetype rivelato con animazione + comparison stats
 *
 * Fase 1: scaffolding + 3 domande di esempio (Money Story). Le altre 15-18
 * domande saranno aggiunte in Fase 2 — il flow è già completo end-to-end.
 */

// ============================================================================
// QUESTIONS — Fase 1: solo Money Story (3 questions). In Fase 2 aggiungiamo
// 5 sezioni × 3 = 15 q in più per coprire spending/saving/investing/values/goals.
// ============================================================================

type QuestionType =
  | { kind: "slider"; min: number; max: number; minLabel: string; maxLabel: string }
  | { kind: "likert"; statement: string }
  | { kind: "choice"; options: { value: number; label: string; emoji?: string }[] };

type Question = {
  id: string;
  section: string;
  prompt: string;
  type: QuestionType;
  /** Mapping risposta (1-10 normalizzato) → contributo alle 4 assi.
   *  weight è quanto questa q sposta l'asse (0-1). Direction +1 = stesso verso,
   *  -1 = inverso. */
  axesImpact: Partial<Record<keyof Axes, { weight: number; direction: 1 | -1 }>>;
};

const QUESTIONS: Question[] = [
  // === Sezione 1 — Money Story ===
  {
    id: "ms1",
    section: "Money Story",
    prompt: "Sono cresciuto in una famiglia in cui i soldi erano…",
    type: {
      kind: "slider",
      min: 1,
      max: 10,
      minLabel: "Scarsi, sempre da contare",
      maxLabel: "Mai un problema",
    },
    // Chi cresce con scarsità tende risk-averse + future-focused (sicurezza)
    axesImpact: {
      risk: { weight: 0.4, direction: 1 },
      time: { weight: 0.3, direction: -1 },
    },
  },
  {
    id: "ms2",
    section: "Money Story",
    prompt: "Parlare di soldi in casa era…",
    type: {
      kind: "likert",
      statement: "...una conversazione aperta e regolare",
    },
    // Più era aperta, più tendenza social/collectivist su decisioni money
    axesImpact: {
      social: { weight: 0.5, direction: 1 },
    },
  },
  {
    id: "ms3",
    section: "Money Story",
    prompt: "Il mio primo ricordo emotivo legato ai soldi è…",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Ansia / restrizione", emoji: "😰" },
        { value: 4, label: "Lavoro e merito (mi sono guadagnato qualcosa)", emoji: "💪" },
        { value: 7, label: "Regalo / generosità ricevuta", emoji: "🎁" },
        { value: 10, label: "Esperienza condivisa (viaggio, festa, cena)", emoji: "🎉" },
      ],
    },
    // Spinge value axis (functional ↔ experiential)
    axesImpact: {
      value: { weight: 0.6, direction: 1 },
    },
  },
];

const TOTAL_SECTIONS = ["Money Story"]; // Fase 2: 6 sections totali

// ============================================================================
// SCORING
// ============================================================================

function computeAxes(answers: Record<string, number>): Axes {
  // Default neutro per le assi non ancora coperte (Fase 1 ha solo 3 q)
  const axes: Axes = { risk: 5, time: 5, value: 5, social: 5 };
  const totalWeight: Record<keyof Axes, number> = { risk: 0, time: 0, value: 0, social: 0 };
  const weighted: Record<keyof Axes, number> = { risk: 0, time: 0, value: 0, social: 0 };

  for (const q of QUESTIONS) {
    const raw = answers[q.id];
    if (raw == null) continue;
    for (const [axis, impact] of Object.entries(q.axesImpact) as [
      keyof Axes,
      { weight: number; direction: 1 | -1 },
    ][]) {
      // Trasforma risposta in valore -1..+1 (5.5 = neutro)
      const norm = (raw - 5.5) / 4.5; // -1..+1
      const contribution = norm * impact.direction * impact.weight;
      weighted[axis] += contribution;
      totalWeight[axis] += impact.weight;
    }
  }

  for (const axis of ["risk", "time", "value", "social"] as const) {
    if (totalWeight[axis] > 0) {
      const avg = weighted[axis] / totalWeight[axis]; // -1..+1
      axes[axis] = 5.5 + avg * 4.5; // 1..10
    }
  }
  return axes;
}

function generateSummary(axes: Axes, archetypeName: string): string {
  // Summary breve auto-generato. In Fase 2 può diventare più ricco/AI-generated.
  const riskWord = axes.risk < 4 ? "prudente" : axes.risk > 7 ? "audace" : "equilibrato";
  const timeWord = axes.time < 4 ? "vivi nel presente" : axes.time > 7 ? "pianifichi a lungo termine" : "bilanci presente e futuro";
  const valueWord = axes.value < 4 ? "cerchi la funzionalità" : axes.value > 7 ? "ami le esperienze" : "miri all'equilibrio";
  return `Sei un ${archetypeName.replace(/^The /, "")}. Hai un approccio ${riskWord} al rischio, ${timeWord}, e ${valueWord}.`;
}

// ============================================================================
// COMPONENT
// ============================================================================

type Stats = {
  scope: "city" | "country" | "world";
  scopeLabel: string;
  percent: number;
  totalUsers: number;
};

export function PersonalityTestClient({
  profile,
  userCountry,
  userCity,
}: {
  profile: PersonalityProfile;
  userCountry: string | null;
  userCity: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"intro" | "test" | "computing" | "done" | "result">(
    profile.completed ? "result" : "intro",
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(profile.answers);
  const [resultStats, setResultStats] = useState<Stats[]>([]);

  const currentQ = QUESTIONS[step];
  const isLastQ = step === QUESTIONS.length - 1;
  const allAnswered = QUESTIONS.every((q) => answers[q.id] != null);

  function setAnswer(qId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }

  async function submit() {
    setStage("computing");
    const axes = computeAxes(answers);
    const archetype = ARCHETYPES.reduce((best, a) => {
      const dist = Math.sqrt(
        (a.centroid.risk - axes.risk) ** 2 +
          (a.centroid.time - axes.time) ** 2 +
          (a.centroid.value - axes.value) ** 2 +
          (a.centroid.social - axes.social) ** 2,
      );
      const bestDist = Math.sqrt(
        (best.centroid.risk - axes.risk) ** 2 +
          (best.centroid.time - axes.time) ** 2 +
          (best.centroid.value - axes.value) ** 2 +
          (best.centroid.social - axes.social) ** 2,
      );
      return dist < bestDist ? a : best;
    }, ARCHETYPES[0]);
    const summary = generateSummary(axes, archetype.name);
    try {
      await fetch("/api/personality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers, axes, summary }),
      });
      // Fetch comparison stats
      const params = new URLSearchParams();
      if (userCity) params.set("city", userCity);
      if (userCountry) params.set("country", userCountry);
      const r = await fetch(`/api/personality/stats/${archetype.id}?${params}`);
      const j = await r.json().catch(() => ({ stats: [] }));
      setResultStats(j.stats ?? []);
      setStage("done");
    } catch {
      setStage("test"); // rollback
    }
  }

  async function reset() {
    if (!confirm("Cancellare il risultato del test e rifare?")) return;
    await fetch("/api/personality", { method: "DELETE" });
    setAnswers({});
    setStep(0);
    setStage("intro");
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 text-violet-300">
          <Brain className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Personality Test</h1>
        </div>
        <p className="text-sm text-[var(--fg-muted)]">
          Capisci che tipo di persona finanziaria sei. Personalizza la AI di Piggybird
          sul tuo modo di pensare ai soldi.
        </p>
      </header>

      {stage === "intro" && (
        <IntroStage onStart={() => setStage("test")} />
      )}

      {stage === "test" && currentQ && (
        <TestStage
          question={currentQ}
          step={step}
          total={QUESTIONS.length}
          value={answers[currentQ.id]}
          onChange={(v) => setAnswer(currentQ.id, v)}
          onPrev={() => setStep((s) => Math.max(0, s - 1))}
          onNext={() => {
            if (isLastQ) {
              if (allAnswered) submit();
            } else {
              setStep((s) => s + 1);
            }
          }}
          isLast={isLastQ}
          canNext={answers[currentQ.id] != null}
        />
      )}

      {stage === "computing" && (
        <div className="surface p-12 text-center space-y-3">
          <Loader2 className="size-10 mx-auto animate-spin text-violet-400" />
          <p className="text-sm text-[var(--fg-muted)]">Calcolo il tuo profilo…</p>
        </div>
      )}

      {(stage === "done" || stage === "result") && (
        <ResultStage
          profile={
            stage === "done"
              ? { ...profile, answers, completed: true, completedAt: new Date().toISOString() }
              : profile
          }
          stats={
            stage === "done"
              ? resultStats
              : []
          }
          onReset={reset}
          onLoadStats={async () => {
            if (!profile.archetype) return;
            const params = new URLSearchParams();
            if (userCity) params.set("city", userCity);
            if (userCountry) params.set("country", userCountry);
            const r = await fetch(
              `/api/personality/stats/${profile.archetype.id}?${params}`,
            );
            const j = await r.json().catch(() => ({ stats: [] }));
            setResultStats(j.stats ?? []);
          }}
          loadedStats={resultStats}
        />
      )}
    </div>
  );
}

function IntroStage({ onStart }: { onStart: () => void }) {
  return (
    <div className="surface p-6 space-y-5">
      <p className="text-[12px] text-[var(--fg-subtle)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 leading-relaxed">
        <Lock className="size-3.5 inline mr-1 -mt-0.5" />
        <strong>Perché un test e non solo i campi del profilo?</strong> I dati
        demografici classici (età, reddito, professione) ti dicono CHI sei, ma non
        COME pensi al denaro. Due persone con stesso reddito possono essere opposti:
        una compulsive saver, l'altra experiential spender. Per personalizzare bene
        la AI, serve sapere la tua relazione emotiva e comportamentale coi soldi.
      </p>
      <p className="text-[12px] text-[var(--fg-subtle)] bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 leading-relaxed text-emerald-700 dark:text-emerald-200">
        🔒 <strong>Privacy:</strong> le risposte restano nel DB locale del tuo Mac.
        Quando usi una feature AI, il riassunto del tuo profilo viene incluso solo
        nel TUO prompt (non visto da nessuno). Al developer arrivano SOLO statistiche
        aggregate anonime (es. &quot;23% degli utenti italiani sono Experiential
        Optimist&quot;), MAI riferimenti al tuo profilo individuale.
      </p>
      <div className="flex items-center gap-3 text-xs text-[var(--fg-muted)]">
        <Sparkles className="size-3.5 text-violet-400" />
        <span>~6 minuti · {QUESTIONS.length} domande (sezione 1 di {TOTAL_SECTIONS.length})</span>
      </div>
      <button
        onClick={onStart}
        className="w-full h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center justify-center gap-2"
      >
        <Brain className="size-4" />
        Inizia il test
      </button>
    </div>
  );
}

function TestStage({
  question,
  step,
  total,
  value,
  onChange,
  onPrev,
  onNext,
  isLast,
  canNext,
}: {
  question: Question;
  step: number;
  total: number;
  value: number | undefined;
  onChange: (v: number) => void;
  onPrev: () => void;
  onNext: () => void;
  isLast: boolean;
  canNext: boolean;
}) {
  return (
    <div className="surface p-6 space-y-5">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[var(--fg-subtle)] uppercase tracking-wider">
          <span>{question.section}</span>
          <span>{step + 1} / {total}</span>
        </div>
        <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-5"
        >
          <h2 className="text-lg font-medium">{question.prompt}</h2>

          {question.type.kind === "slider" && (
            <div className="space-y-3">
              <input
                type="range"
                min={question.type.min}
                max={question.type.max}
                step={1}
                value={value ?? 5}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-[11px] text-[var(--fg-subtle)]">
                <span>{question.type.minLabel}</span>
                <span className="font-medium tabular-nums text-violet-300">
                  {value ?? "—"}
                </span>
                <span>{question.type.maxLabel}</span>
              </div>
            </div>
          )}

          {question.type.kind === "likert" && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--fg-muted)] italic">
                &quot;{question.type.statement}&quot;
              </p>
              <div className="grid grid-cols-5 gap-1">
                {[1, 3, 5, 7, 10].map((v, i) => (
                  <button
                    key={v}
                    onClick={() => onChange(v)}
                    className={`h-12 rounded-lg border text-xs font-medium transition-colors ${
                      value === v
                        ? "bg-violet-500/30 border-violet-400/60 text-white"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {["Forte<br/>disaccordo", "Disaccordo", "Neutro", "Accordo", "Forte<br/>accordo"][i]
                      .split("<br/>")
                      .map((s, j) => (
                        <span key={j} className="block">{s}</span>
                      ))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {question.type.kind === "choice" && (
            <div className="space-y-2">
              {question.type.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange(opt.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                    value === opt.value
                      ? "bg-violet-500/15 border-violet-400/60"
                      : "bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {opt.emoji && <span className="text-2xl shrink-0">{opt.emoji}</span>}
                  <span className="text-sm">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          onClick={onPrev}
          disabled={step === 0}
          className="h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm inline-flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
          Indietro
        </button>
        <button
          onClick={onNext}
          disabled={!canNext}
          className="h-9 px-4 rounded-lg bg-violet-500 text-white text-sm font-medium inline-flex items-center gap-1 disabled:opacity-50"
        >
          {isLast ? "Calcola profilo" : "Avanti"}
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ResultStage({
  profile,
  stats,
  onReset,
  onLoadStats,
  loadedStats,
}: {
  profile: PersonalityProfile;
  stats: Stats[];
  onReset: () => void;
  onLoadStats: () => Promise<void>;
  loadedStats: Stats[];
}) {
  const archetype = profile.archetype;
  const finalStats = stats.length > 0 ? stats : loadedStats;
  // Auto-load stats al mount se profile completed senza ancora avere stats
  useMemo(() => {
    if (profile.completed && finalStats.length === 0) onLoadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.completed]);

  if (!archetype) {
    return (
      <div className="surface p-6 text-center text-sm text-[var(--fg-muted)]">
        Profilo non trovato. Rifai il test.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="surface p-6 space-y-4 text-center bg-gradient-to-br from-violet-500/[0.06] via-[var(--surface)] to-indigo-500/[0.04]">
        <div className="size-24 mx-auto rounded-2xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-5xl">
          {archetype.emoji}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)] mb-1">
            Sei un
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">{archetype.name}</h2>
          <p className="text-sm italic text-violet-300 mt-1">
            &quot;{archetype.tagline}&quot;
          </p>
        </div>
        <p className="text-sm text-[var(--fg-muted)] max-w-md mx-auto leading-relaxed">
          {archetype.description}
        </p>
        {profile.summary && (
          <p className="text-xs text-[var(--fg-subtle)] italic max-w-md mx-auto pt-3 border-t border-[var(--border)]/50">
            {profile.summary}
          </p>
        )}
      </div>

      {finalStats.length > 0 && (
        <div className="surface p-5 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
            Confronto con altri utenti Piggybird
          </h3>
          <div className="space-y-2">
            {finalStats.map((s) => (
              <div key={s.scope} className="flex items-center gap-3">
                <span className="text-xs text-[var(--fg-muted)] w-20 truncate">
                  {s.scopeLabel}
                </span>
                <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    style={{ width: `${Math.min(100, s.percent * 3)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums font-medium text-violet-300 w-10 text-right">
                  {s.percent}%
                </span>
                <span className="text-[10px] text-[var(--fg-subtle)] tabular-nums w-12 text-right">
                  n={s.totalUsers}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--fg-subtle)] pt-1">
            % di utenti dello stesso scope con il tuo stesso archetype.
          </p>
        </div>
      )}

      {profile.completed && (
        <div className="surface p-4 flex items-center gap-2 text-[11px] text-[var(--fg-subtle)]">
          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
          <span className="flex-1">
            Test completato il{" "}
            {profile.completedAt
              ? new Date(profile.completedAt).toLocaleDateString("it-IT")
              : "—"}
            . In Fase 2 aggiungeremo altre 5 sezioni di domande per un profilo più
            ricco.
          </span>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--fg-muted)] inline-flex items-center justify-center gap-2 hover:border-rose-500/40 hover:text-rose-300"
      >
        <RefreshCw className="size-3.5" />
        Rifai il test
      </button>
    </div>
  );
}
