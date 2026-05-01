"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Lock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  findArchetype,
  type Axes,
  type MoneyArchetype,
} from "@/lib/personality-archetypes";
import type {
  PersonalityProfile,
  PersonalityLayers,
  MoneyScripts,
  BehavioralProfile,
} from "@/lib/personality";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Personality Test client wizard.
 *
 * Stages:
 *   - "intro" → privacy disclaimer + start button (o "Rifai" se già completato)
 *   - "result" (caso già completato): mostra archetype + comparison + reset
 *   - "test" → step del wizard (7 sezioni × 3 q = 21 domande totali)
 *   - "computing" → spinner mentre POST /api/personality
 *   - "done" → archetype (uccello) rivelato con animazione + comparison stats
 */

// ============================================================================
// QUESTIONS — 11 sezioni, 25 domande in 4 layer (v5, post-compression).
//
// Layer 1 — Modello 5D archetipo (sezioni 1-8, 16 q): planning, risk, time,
//   value, social. axesImpact mappa raw 1-10 sulle 5 assi.
//   Calibrazione pesi per asse (v5): risk 3.0 / value 3.2 / time 2.5 /
//   planning 2.1 / social 2.1. Pesi inferiori a v3 (4.6/4.1/3.8/3.1/3.4)
//   ma ancora bilanciati relativi tra assi → discriminazione mantenuta,
//   tempo test ridotto da ~7 min a ~5 min (sweet spot dropout).
//
// Layer 2 — Money Scripts (sez 9, 4 q): Klontz overlay (avoidance, worship,
//   status, vigilance). 4 dimensioni indipendenti, NON sono assi.
//   moneyScriptImpact mappa diretto.
//
// Layer 3 — Financial Literacy (sez 10, 3 q): Lusardi Big Three MCQ public
//   domain. literacyCorrect indica la option giusta. Score 0-3.
//
// Layer 4 — Behavioral (sez 11, 2 q): loss aversion + composure (Oxford Risk
//   style). behavioralImpact mappa diretto. Predicono panic-sell.
//
// Linguaggio universale, no riferimenti a strumenti di paesi specifici
// (401k, FIRE, ecc.).
//
// Likert button values [1, 3.25, 5.5, 7.75, 10]: 5.5 = norm 0 (vero neutro);
// scala perfettamente simmetrica e equidistante.
// Choice option values [1, 4, 7, 10] per item su asse continuo, [1, 2, 3]
// per Lusardi MCQ (correttezza, non scoring).
// ============================================================================

/**
 * Versione del test. INCREMENTARE solo per cambi MATERIALI:
 *   - aggiunta/rimozione di domande (non solo wording)
 *   - cambio di pesi/direzioni significativi
 *   - rinomina di archetipi
 *   - cambio del modello di assi (es. 4D → 5D)
 *
 * NON bumpare per: bug fix UI, refactor, cambio testi cosmetico.
 *
 * Quando bumpata + nuova release app distribuita: utenti con profilo della
 * vecchia versione vedono banner "Test aggiornato, rifai per profilo accurato".
 * Backend stats filtra per versione → vecchie aggregate restano inerti.
 */
const TEST_VERSION = 5;

/**
 * Etichette user-facing per le 5 assi: ancore semantiche del polo basso e
 * alto della scala 1-10. Usate nella visualizzazione "I tuoi assi" del
 * risultato.
 */
const AXIS_DESCRIPTORS: {
  key: keyof Axes;
  label: string;
  leftAnchor: string;
  rightAnchor: string;
}[] = [
  {
    key: "planning",
    label: "Pianificazione",
    leftAnchor: "Spontaneo",
    rightAnchor: "Metodico",
  },
  {
    key: "risk",
    label: "Rischio",
    leftAnchor: "Prudente",
    rightAnchor: "Audace",
  },
  {
    key: "time",
    label: "Orizzonte",
    leftAnchor: "Presente",
    rightAnchor: "Futuro",
  },
  {
    key: "value",
    label: "Valore",
    leftAnchor: "Funzionale",
    rightAnchor: "Esperienziale",
  },
  {
    key: "social",
    label: "Sociale",
    leftAnchor: "Individualista",
    rightAnchor: "Collettivista",
  },
];

type QuestionType =
  | { kind: "slider"; min: number; max: number; minLabel: string; maxLabel: string }
  | { kind: "likert"; statement: string }
  | { kind: "choice"; options: { value: number; label: string; emoji?: string }[] };

type Question = {
  id: string;
  section: string;
  prompt: string;
  type: QuestionType;
  /** Layer 1 — mapping risposta (1-10 normalizzato) → contributo alle 5 assi.
   *  weight è quanto questa q sposta l'asse (0-1). Direction +1 = stesso verso,
   *  -1 = inverso. Optional: domande di altri layer non hanno axesImpact. */
  axesImpact?: Partial<Record<keyof Axes, { weight: number; direction: 1 | -1 }>>;
  /** Layer 2 — mapping diretto su uno dei 4 money scripts. raw 1-10 diventa
   *  lo score dello script (con eventuale inversione). Direction default +1. */
  moneyScriptImpact?: { script: keyof MoneyScripts; direction?: 1 | -1 };
  /** Layer 4 — mapping diretto su loss aversion o composure. Direction default +1. */
  behavioralImpact?: {
    dimension: keyof BehavioralProfile;
    direction?: 1 | -1;
  };
  /** Layer 3 — Lusardi MCQ: il `value` della option corretta. */
  literacyCorrect?: number;
};

const QUESTIONS: Question[] = [
  // === Sezione 1 — Money Story ===
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

  // === Sezione 2 — Spending Triggers ===
  {
    id: "st1",
    section: "Spending Triggers",
    prompt: "Quando faccio un acquisto importante, di solito...",
    type: {
      kind: "slider",
      min: 1,
      max: 10,
      minLabel: "Pianifico per settimane",
      maxLabel: "Decido sul momento",
    },
    // Impulsività → present-focused, più tolleranza al rischio
    axesImpact: {
      time: { weight: 0.5, direction: -1 },
      risk: { weight: 0.3, direction: 1 },
    },
  },
  {
    id: "st2",
    section: "Spending Triggers",
    prompt: "Cosa ti spinge di più a comprare qualcosa?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Risolve un problema concreto", emoji: "🔧" },
        { value: 4, label: "Migliora i miei strumenti / qualità della vita pratica", emoji: "⚙️" },
        { value: 7, label: "Mi fa vivere un'esperienza memorabile", emoji: "✨" },
        { value: 10, label: "Mi rappresenta o trasmette qualcosa agli altri", emoji: "👁️" },
      ],
    },
    // Da functional a experiential/status
    axesImpact: {
      value: { weight: 0.6, direction: 1 },
      social: { weight: 0.2, direction: 1 },
    },
  },

  // === Sezione 3 — Saving Mindset ===
  {
    id: "sm1",
    section: "Saving Mindset",
    prompt: "Quando ricevo soldi inaspettati (bonus, regalo, rimborso)...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Li metto subito da parte / investo", emoji: "🏦" },
        { value: 4, label: "Una parte risparmio, una parte godo", emoji: "⚖️" },
        { value: 7, label: "Mi tolgo uno sfizio che desideravo", emoji: "🎁" },
        { value: 10, label: "Li uso per qualcosa di significativo (viaggio, esperienza)", emoji: "🌍" },
      ],
    },
    // Più si gode → present-focused + experiential
    axesImpact: {
      time: { weight: 0.5, direction: -1 },
      value: { weight: 0.4, direction: 1 },
    },
  },
  {
    id: "sm3",
    section: "Saving Mindset",
    prompt: "Penso al mio futuro finanziario quando faccio scelte di spesa quotidiane",
    type: {
      kind: "likert",
      statement: "...considero il futuro nelle spese di tutti i giorni",
    },
    axesImpact: {
      time: { weight: 0.7, direction: 1 },
    },
  },

  // === Sezione 4 — Investing Style ===
  {
    id: "is1",
    section: "Investing Style",
    prompt: "Se il mercato crolla del 30%...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Vendo subito per limitare le perdite", emoji: "🚪" },
        { value: 4, label: "Aspetto con ansia, riduco l'esposizione", emoji: "😬" },
        { value: 7, label: "Lascio stare, è normale, ribilancio", emoji: "🧘" },
        { value: 10, label: "Compro di più, è un'occasione storica", emoji: "🚀" },
      ],
    },
    axesImpact: {
      risk: { weight: 0.8, direction: 1 },
    },
  },
  {
    id: "is3",
    section: "Investing Style",
    prompt: "Come preferisci gestire i tuoi investimenti?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Conto deposito / titoli garantiti", emoji: "🏛️" },
        { value: 4, label: "Fondi/ETF passivi diversificati", emoji: "📊" },
        { value: 7, label: "Mix di ETF e azioni che scelgo io", emoji: "🎯" },
        { value: 10, label: "Asset growth concentrati (singole azioni, crypto, startup)", emoji: "💎" },
      ],
    },
    axesImpact: {
      risk: { weight: 0.6, direction: 1 },
      time: { weight: 0.3, direction: 1 },
    },
  },

  // === Sezione 5 — Financial Values ===
  {
    id: "fv1",
    section: "Financial Values",
    prompt: "I soldi per te rappresentano principalmente...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Sicurezza e tranquillità", emoji: "🛡️" },
        { value: 4, label: "Libertà di scegliere come vivere", emoji: "🦅" },
        { value: 7, label: "Strumento per esperienze e relazioni", emoji: "🤝" },
        { value: 10, label: "Espressione di chi sono / status raggiunto", emoji: "👑" },
      ],
    },
    axesImpact: {
      value: { weight: 0.6, direction: 1 },
      social: { weight: 0.3, direction: 1 },
    },
  },
  {
    id: "fv2",
    section: "Financial Values",
    prompt: "Parlo apertamente di soldi (stipendio, investimenti, debiti) con amici e famiglia",
    type: {
      kind: "likert",
      statement: "...condivido apertamente cifre e scelte finanziarie",
    },
    axesImpact: {
      social: { weight: 0.9, direction: 1 },
    },
  },
  {
    id: "fv4",
    section: "Financial Values",
    prompt: "Le decisioni finanziarie importanti della mia vita...",
    type: {
      kind: "slider",
      min: 1,
      max: 10,
      minLabel: "Le prendo da solo",
      maxLabel: "Le prendo con partner / famiglia",
    },
    axesImpact: {
      social: { weight: 0.7, direction: 1 },
    },
  },

  // === Sezione 6 — Goals & Fears ===
  {
    id: "gf2",
    section: "Goals & Fears",
    prompt: "Qual è la tua paura finanziaria principale?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Perdere quello che ho costruito", emoji: "💔" },
        { value: 4, label: "Non risparmiare abbastanza per il futuro", emoji: "⏳" },
        { value: 7, label: "Lavorare per sempre senza godere la vita", emoji: "🏃" },
        { value: 10, label: "Non lasciare nulla a chi amo", emoji: "🕯️" },
      ],
    },
    // Da risk-averse a experiential
    axesImpact: {
      value: { weight: 0.5, direction: 1 },
      risk: { weight: 0.3, direction: 1 },
    },
  },
  {
    id: "gf3",
    section: "Goals & Fears",
    prompt: "Pensando a 10 anni nel futuro, valorizzo di più...",
    type: {
      kind: "slider",
      min: 1,
      max: 10,
      minLabel: "Sicurezza, prevedibilità, ciò che ho",
      maxLabel: "Cambiamento, evoluzione, opportunità nuove",
    },
    axesImpact: {
      risk: { weight: 0.6, direction: 1 },
      time: { weight: 0.3, direction: 1 },
    },
  },

  // === Sezione 7 — Money Outlook ===
  // Domanda discriminante (originariamente v2) per separare "minimalismo per
  // scelta" (Sparrow) da "minimalismo per paura" (Owl) o "frugalità per FIRE"
  // (Albatross).
  {
    id: "mo2",
    section: "Money Outlook",
    prompt: "Se domani il tuo patrimonio raddoppiasse, cosa faresti?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Quasi nulla cambierebbe nel mio quotidiano", emoji: "🪺" },
        { value: 4, label: "Lo investirei in modo pianificato", emoji: "📊" },
        { value: 7, label: "Mi tolgo qualche grosso sfizio che desideravo", emoji: "🎁" },
        { value: 10, label: "Cambierei vita radicalmente (mollare lavoro, viaggiare)", emoji: "🚀" },
      ],
    },
    // Da "sazio" a "aspirazionale" — discrimina sparrow (low) da risk-takers (high)
    axesImpact: {
      value: { weight: 0.5, direction: 1 },
      risk: { weight: 0.4, direction: 1 },
      time: { weight: 0.2, direction: -1 },
    },
  },

  // === Sezione 8 — Planning Style ===
  {
    id: "ps2",
    section: "Planning Style",
    prompt: "Mi piace tenere traccia delle mie finanze in modo regolare e dettagliato",
    type: {
      kind: "likert",
      statement: "...annoto, controllo, monitoro spesso",
    },
    axesImpact: {
      planning: { weight: 0.7, direction: 1 },
    },
  },
  {
    id: "ps3",
    section: "Planning Style",
    prompt: "Davanti a una decisione finanziaria importante, di solito...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Faccio fogli, simulazioni, scenari", emoji: "📊" },
        { value: 4, label: "Ci penso a fondo per qualche giorno", emoji: "🤔" },
        { value: 7, label: "Decido di pancia in poco tempo", emoji: "⚡" },
        { value: 10, label: "Vado coi tempi che mi propone l'occasione", emoji: "🌊" },
      ],
    },
    axesImpact: {
      planning: { weight: 0.7, direction: -1 },
    },
  },
  {
    id: "ps4",
    section: "Planning Style",
    prompt: "Della tua spesa del mese scorso, quanto sei in grado di dire in dettaglio?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "So esattamente quanto in ogni categoria principale", emoji: "📋" },
        { value: 4, label: "So la cifra totale e le voci grosse", emoji: "💼" },
        { value: 7, label: "Ho un'idea di massima", emoji: "🤷" },
        { value: 10, label: "Onestamente, nessuna idea precisa", emoji: "🌫️" },
      ],
    },
    axesImpact: {
      planning: { weight: 0.7, direction: -1 },
    },
  },

  // === Sezione 9 — Money Scripts (Klontz overlay, Layer 2) ===
  // 4 dimensioni indipendenti — NON sono assi del modello 5D.
  {
    id: "ms_av",
    section: "Money Scripts",
    prompt: "Pensare ai soldi mi mette in difficoltà, quindi preferisco non occuparmene",
    type: {
      kind: "likert",
      statement: "...evito di pensare/parlare di soldi",
    },
    moneyScriptImpact: { script: "avoidance" },
  },
  {
    id: "ms_wo",
    section: "Money Scripts",
    prompt: "Più soldi accumulerò, più sereno e sicuro mi sentirò nella vita",
    type: {
      kind: "likert",
      statement: "...più soldi = più felicità / sicurezza",
    },
    moneyScriptImpact: { script: "worship" },
  },
  {
    id: "ms_st",
    section: "Money Scripts",
    prompt: "Quello che possiedo dice qualcosa di importante su chi sono",
    type: {
      kind: "likert",
      statement: "...le mie cose mi rappresentano",
    },
    moneyScriptImpact: { script: "status" },
  },
  {
    id: "ms_vg",
    section: "Money Scripts",
    prompt: "Controllo spesso i miei conti e tendo a non condividere cifre con altri",
    type: {
      kind: "likert",
      statement: "...monitoro spesso, condivido poco",
    },
    moneyScriptImpact: { script: "vigilance" },
  },

  // === Sezione 10 — Financial Literacy (Lusardi Big Three, Layer 3) ===
  // 3 MCQ public-domain (gflec.org). Risposta corretta = literacyCorrect.
  // Score finale = numero corrette (0-3) → calibra vocabolario AI.
  {
    id: "lit_int",
    section: "Financial Literacy",
    prompt: "Hai 100€ su un conto che rende il 2% l'anno. Senza fare versamenti, dopo 5 anni avrai...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Meno di 102€", emoji: "📉" },
        { value: 2, label: "Esattamente 110€", emoji: "🟰" },
        { value: 3, label: "Più di 110€", emoji: "📈" },
      ],
    },
    literacyCorrect: 3,
  },
  {
    id: "lit_inf",
    section: "Financial Literacy",
    prompt: "Il tuo conto rende l'1% l'anno; l'inflazione è il 2%. Dopo un anno, con i soldi sul conto puoi comprare...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Più cose di oggi", emoji: "📈" },
        { value: 2, label: "Le stesse cose di oggi", emoji: "🟰" },
        { value: 3, label: "Meno cose di oggi", emoji: "📉" },
      ],
    },
    literacyCorrect: 3,
  },
  {
    id: "lit_div",
    section: "Financial Literacy",
    prompt: "Comprare azioni di una sola società, di solito, è... rispetto a comprare un fondo che contiene molte azioni diverse",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Meno rischioso", emoji: "🛡️" },
        { value: 2, label: "Ugualmente rischioso", emoji: "🟰" },
        { value: 3, label: "Più rischioso", emoji: "⚠️" },
      ],
    },
    literacyCorrect: 3,
  },

  // === Sezione 11 — Behavioral (loss aversion + composure, Layer 4) ===
  {
    id: "bh_la",
    section: "Behavioral",
    prompt: "Hai 100€ in tasca. Ti propongono di scommetterne 50: testa vinci altri 100€, croce non guadagni nulla. Cosa fai?",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Non scommetto, troppo rischio", emoji: "🛡️" },
        { value: 4, label: "Probabilmente non scommetto", emoji: "😬" },
        { value: 7, label: "Probabilmente scommetto", emoji: "🤔" },
        { value: 10, label: "Scommetto subito, è una buona occasione", emoji: "🎲" },
      ],
    },
    // Low value = high loss aversion → direction -1 inverte raw
    behavioralImpact: { dimension: "lossAversion", direction: -1 },
  },
  {
    id: "bh_co",
    section: "Behavioral",
    prompt: "Hai investito 5000€. Dopo 6 mesi valgono 3500€. La tua reazione spontanea è...",
    type: {
      kind: "choice",
      options: [
        { value: 1, label: "Vendo subito per fermare le perdite", emoji: "🚪" },
        { value: 4, label: "Aspetto con ansia, magari riduco l'esposizione", emoji: "😰" },
        { value: 7, label: "Lascio stare, è normale, mi tengo la posizione", emoji: "🧘" },
        { value: 10, label: "Compro di più, è un'occasione storica", emoji: "🚀" },
      ],
    },
    // High value = high composure → direction +1 (default)
    behavioralImpact: { dimension: "composure" },
  },
];

const TOTAL_SECTIONS = [
  "Money Story",
  "Spending Triggers",
  "Saving Mindset",
  "Investing Style",
  "Financial Values",
  "Goals & Fears",
  "Money Outlook",
  "Planning Style",
  "Money Scripts",
  "Financial Literacy",
  "Behavioral",
];

// ============================================================================
// SCORING
// ============================================================================

function computeAxes(answers: Record<string, number>): Axes {
  const axes: Axes = { planning: 5, risk: 5, time: 5, value: 5, social: 5 };
  const totalWeight: Record<keyof Axes, number> = {
    planning: 0,
    risk: 0,
    time: 0,
    value: 0,
    social: 0,
  };
  const weighted: Record<keyof Axes, number> = {
    planning: 0,
    risk: 0,
    time: 0,
    value: 0,
    social: 0,
  };

  for (const q of QUESTIONS) {
    if (!q.axesImpact) continue;
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

  for (const axis of ["planning", "risk", "time", "value", "social"] as const) {
    if (totalWeight[axis] > 0) {
      const avg = weighted[axis] / totalWeight[axis]; // -1..+1
      axes[axis] = 5.5 + avg * 4.5; // 1..10
    }
  }
  return axes;
}

function computeMoneyScripts(
  answers: Record<string, number>,
): MoneyScripts | null {
  const scripts: MoneyScripts = {
    avoidance: 5.5,
    worship: 5.5,
    status: 5.5,
    vigilance: 5.5,
  };
  let any = false;
  for (const q of QUESTIONS) {
    if (!q.moneyScriptImpact) continue;
    const raw = answers[q.id];
    if (raw == null) continue;
    any = true;
    const dir = q.moneyScriptImpact.direction ?? 1;
    // raw 1-10. Direction +1: high answer = high script. Direction -1: invert.
    scripts[q.moneyScriptImpact.script] = dir === 1 ? raw : 11 - raw;
  }
  return any ? scripts : null;
}

function computeBehavioral(
  answers: Record<string, number>,
): BehavioralProfile | null {
  const result: BehavioralProfile = { lossAversion: 5.5, composure: 5.5 };
  let any = false;
  for (const q of QUESTIONS) {
    if (!q.behavioralImpact) continue;
    const raw = answers[q.id];
    if (raw == null) continue;
    any = true;
    const dir = q.behavioralImpact.direction ?? 1;
    result[q.behavioralImpact.dimension] = dir === 1 ? raw : 11 - raw;
  }
  return any ? result : null;
}

function computeLiteracyScore(
  answers: Record<string, number>,
): number | null {
  let any = false;
  let correct = 0;
  for (const q of QUESTIONS) {
    if (q.literacyCorrect == null) continue;
    const raw = answers[q.id];
    if (raw == null) continue;
    any = true;
    if (raw === q.literacyCorrect) correct++;
  }
  return any ? correct : null;
}

function generateSummary(axes: Axes, archetypeName: string): string {
  // Summary breve auto-generato. Può diventare AI-generated in futuro.
  const planningWord =
    axes.planning < 4 ? "spontaneo" : axes.planning > 7 ? "metodico" : "flessibile";
  const riskWord = axes.risk < 4 ? "prudente" : axes.risk > 7 ? "audace" : "equilibrato";
  const timeWord =
    axes.time < 4
      ? "vivi nel presente"
      : axes.time > 7
        ? "pianifichi a lungo termine"
        : "bilanci presente e futuro";
  const valueWord =
    axes.value < 4
      ? "cerchi la funzionalità"
      : axes.value > 7
        ? "ami le esperienze"
        : "miri all'equilibrio";
  return `Sei un ${archetypeName.replace(/^The /, "")}. Approccio ${planningWord} alla pianificazione, ${riskWord} al rischio, ${timeWord}, e ${valueWord}.`;
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
  const confirm = useConfirm();
  const [stage, setStage] = useState<"intro" | "test" | "computing" | "done" | "result">(
    profile.completed ? "result" : "intro",
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(profile.answers);
  const [resultStats, setResultStats] = useState<Stats[]>([]);
  // Risultato fresh appena calcolato (post-submit). Necessario perché il
  // `profile` prop arriva dal server-render iniziale (con archetype=null
  // se l'utente non aveva ancora completato), quindi non possiamo solo
  // spread `...profile` per la ResultStage post-completion.
  const [justComputed, setJustComputed] = useState<{
    archetype: MoneyArchetype;
    axes: Axes;
    summary: string;
  } | null>(null);

  const currentQ = QUESTIONS[step];
  const isLastQ = step === QUESTIONS.length - 1;
  const allAnswered = QUESTIONS.every((q) => answers[q.id] != null);

  function setAnswer(qId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  }

  async function submit() {
    setStage("computing");
    const axes = computeAxes(answers);
    // Usa findArchetype centralizzato (5D, defensive ?? 5) — niente drift
    // tra test client e lib backend.
    const archetype = findArchetype(axes);
    const summary = generateSummary(axes, archetype.name);
    // v4 layers — calcolati dalle risposte ai nuovi item; null se mancanti
    // (es. test fatto in v3 con risposte parziali).
    const layers: PersonalityLayers = {};
    const ms = computeMoneyScripts(answers);
    if (ms) layers.moneyScripts = ms;
    const bh = computeBehavioral(answers);
    if (bh) layers.behavioral = bh;
    const lit = computeLiteracyScore(answers);
    if (lit != null) layers.literacyScore = lit;
    setJustComputed({ archetype, axes, summary });
    try {
      await fetch("/api/personality", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers,
          axes,
          summary,
          testVersion: TEST_VERSION,
          ...layers,
        }),
      });
      // Fetch comparison stats
      const params = new URLSearchParams();
      if (userCity) params.set("city", userCity);
      if (userCountry) params.set("country", userCountry);
      params.set("testVersion", String(TEST_VERSION));
      const r = await fetch(`/api/personality/stats/${archetype.id}?${params}`);
      const j = await r.json().catch(() => ({ stats: [] }));
      setResultStats(j.stats ?? []);
      setStage("done");
    } catch {
      setStage("test"); // rollback
    }
  }

  async function reset() {
    const ok = await confirm({
      title: "Rifare il test?",
      description:
        "Il risultato attuale verrà cancellato e dovrai rispondere di nuovo a tutte le domande.",
      confirmLabel: "Rifai il test",
      variant: "danger",
    });
    if (!ok) return;
    await fetch("/api/personality", { method: "DELETE" });
    setAnswers({});
    setStep(0);
    setJustComputed(null);
    setResultStats([]);
    setStage("intro");
    router.refresh();
  }

  const hasUnsavedAnswers = stage === "test" && Object.keys(answers).length > 0;

  async function handleBack(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!hasUnsavedAnswers) return;
    e.preventDefault();
    const ok = await confirm({
      title: "Interrompere il test?",
      description:
        "Le risposte date finora non verranno salvate. Potrai sempre ricominciare dall'inizio in seguito.",
      confirmLabel: "Esci dal test",
      cancelLabel: "Continua",
      variant: "danger",
    });
    if (ok) router.push("/impostazioni");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/impostazioni"
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Torna a Impostazioni
      </Link>
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
            stage === "done" && justComputed
              ? {
                  ...profile,
                  answers,
                  completed: true,
                  completedAt: new Date().toISOString(),
                  archetype: justComputed.archetype,
                  axes: justComputed.axes,
                  summary: justComputed.summary,
                  testVersion: TEST_VERSION,
                }
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
            params.set("testVersion", String(TEST_VERSION));
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
        <span>~5 minuti · {QUESTIONS.length} domande in {TOTAL_SECTIONS.length} sezioni</span>
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
              <div className="grid grid-cols-3 items-start text-[11px] text-[var(--fg-subtle)]">
                <span className="text-left">{question.type.minLabel}</span>
                <span className="font-medium tabular-nums text-violet-300 text-center text-base">
                  {value ?? "—"}
                </span>
                <span className="text-right">{question.type.maxLabel}</span>
              </div>
            </div>
          )}

          {question.type.kind === "likert" && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--fg-muted)] italic">
                &quot;{question.type.statement}&quot;
              </p>
              <div className="grid grid-cols-5 gap-1">
                {[1, 3.25, 5.5, 7.75, 10].map((v, i) => (
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

      {profile.axes && (
        <div className="surface p-5 space-y-4">
          <h3 className="text-xs uppercase tracking-wider text-[var(--fg-subtle)] font-medium">
            I tuoi assi
          </h3>
          <div className="space-y-4">
            {AXIS_DESCRIPTORS.map((d) => {
              const value = profile.axes![d.key] ?? 5;
              const pct = Math.max(0, Math.min(100, ((value - 1) / 9) * 100));
              const centroidValue = archetype.centroid[d.key];
              const centroidPct = Math.max(
                0,
                Math.min(100, ((centroidValue - 1) / 9) * 100),
              );
              return (
                <div key={d.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--fg-muted)] font-medium uppercase tracking-wider">
                      {d.label}
                    </span>
                    <span className="tabular-nums text-violet-700 dark:text-violet-300 font-semibold">
                      {value.toFixed(1)} / 10
                    </span>
                  </div>
                  <div className="grid grid-cols-3 items-center text-[10px] text-[var(--fg-subtle)]">
                    <span className="text-left">{d.leftAnchor}</span>
                    <span className="text-center" />
                    <span className="text-right">{d.rightAnchor}</span>
                  </div>
                  <div className="relative h-2 bg-[var(--surface-2)] rounded-full">
                    {/* Centroid dell'archetype: marker sbiadito di riferimento */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-violet-400/30 border border-violet-400/40"
                      style={{ left: `calc(${centroidPct}% - 4px)` }}
                      title={`Centroide ${archetype.name}`}
                    />
                    {/* User: marker pieno violet */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-violet-500 border-2 border-[var(--surface)] shadow-sm"
                      style={{ left: `calc(${pct}% - 6px)` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--fg-subtle)] flex items-center gap-2 pt-1">
            <span className="size-2 rounded-full bg-violet-500 inline-block" />
            <span>tu</span>
            <span className="size-2 rounded-full bg-violet-400/40 border border-violet-400/40 inline-block ml-2" />
            <span>centroide {archetype.name}</span>
          </p>
        </div>
      )}

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

      {profile.completed &&
        profile.testVersion != null &&
        profile.testVersion < TEST_VERSION && (
          <div className="surface p-4 flex items-start gap-3 border border-amber-500/40 bg-amber-500/[0.06]">
            <Sparkles className="size-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-200">
                Test aggiornato (v{TEST_VERSION})
              </p>
              <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
                Il tuo profilo è stato calcolato con la versione{" "}
                <span className="tabular-nums">v{profile.testVersion}</span> del
                test. Da quando lo hai fatto abbiamo aggiunto/modificato
                domande.{" "}
                <button
                  onClick={onReset}
                  className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200 font-medium"
                >
                  Rifai il test
                </button>{" "}
                per ottenere un profilo più accurato.
              </p>
            </div>
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
            {profile.testVersion != null && (
              <span className="tabular-nums opacity-60"> · v{profile.testVersion}</span>
            )}
            .
          </span>
        </div>
      )}

      <Link
        href="/impostazioni"
        className="w-full h-10 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center justify-center gap-2"
      >
        <CheckCircle2 className="size-4" />
        Torna a Impostazioni
      </Link>
    </div>
  );
}
