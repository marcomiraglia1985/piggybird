import { getUserProfile } from "./user-profile";
import { getPersonalityProfile } from "./personality";
import { computeCapacityForLoss } from "./capacity-for-loss";

/**
 * Compone un blocco di contesto utente da iniettare nei system prompt AI.
 *
 * Combina tutti i layer del modello v4 (vedi project_personality_test_roadmap):
 *   - Profilo demografico (nome, età, paesi, professione, ...)
 *   - Layer 1 — archetipo + assi 5D
 *   - Layer 2 — Money Scripts (4 dimensioni Klontz)
 *   - Layer 3 — Financial Literacy (Lusardi Big Three, 0-3)
 *   - Layer 4 — Behavioral (loss aversion + composure)
 *   - Capacity for Loss (computed da NW + profilo, NON da test)
 *
 * Universal-app: nessun valore hardcoded. Tutto fetched a runtime dal DB
 * locale dell'utente che attiva la feature. Funziona identico per qualunque
 * utente (vergine compreso — campi mancanti vengono semplicemente omessi).
 *
 * USO TIPICO:
 *
 *   const userContext = await buildUserContext();
 *   const system = `${AI_INSIGHT_GUARDRAILS}\n\n${userContext}\n\n[feature-specific]`;
 *
 * O via flag `includeUserContext: true` in `callClaude` (prepende
 * automaticamente userContext, NON i guardrails — quelli vanno aggiunti
 * dalle feature che producono output user-facing).
 *
 * Privacy: il context resta nel system prompt locale e viene inviato solo
 * al provider AI (Anthropic) tramite l'API key dell'utente quando attiva
 * esplicitamente una feature AI. Mai inviato a backend Piggybird.
 */
export async function buildUserContext(): Promise<string> {
  const [profile, personality, capacity] = await Promise.all([
    getUserProfile(),
    getPersonalityProfile(),
    computeCapacityForLoss().catch(() => null),
  ]);

  const lines: string[] = [];

  // === Profilo demografico ===
  if (profile.name) lines.push(`Nome: ${profile.name}`);
  if (profile.birthDate) {
    const age = computeAge(profile.birthDate);
    if (age != null) lines.push(`Età: ${age} anni`);
  }
  if (profile.countries.length > 0) {
    lines.push(`Paesi: ${profile.countries.join(", ")}`);
  }
  if (profile.profession) lines.push(`Professione: ${profile.profession}`);
  if (profile.familyStatus) lines.push(`Famiglia: ${profile.familyStatus}`);
  if (profile.childrenCount) lines.push(`Figli: ${profile.childrenCount}`);
  if (profile.monthlyIncome) lines.push(`Reddito mensile: ${profile.monthlyIncome}`);
  if (profile.housingType) lines.push(`Casa: ${profile.housingType}`);
  if (profile.retirementAge) lines.push(`Pensione attesa: ${profile.retirementAge}`);
  if (profile.riskTolerance) {
    lines.push(`Tolleranza rischio dichiarata: ${profile.riskTolerance}`);
  }
  if (profile.trackingExperience) {
    lines.push(`Esperienza tracking: ${profile.trackingExperience}`);
  }
  if (profile.goals.length > 0) {
    lines.push(`Obiettivi dichiarati: ${profile.goals.join(", ")}`);
  }

  // === Layer 1 — Archetipo + assi 5D ===
  if (personality.completed && personality.archetype) {
    const a = personality.archetype;
    lines.push("");
    lines.push(`Personalità finanziaria: ${a.name} (${a.bird})`);
    lines.push(`Tagline: "${a.tagline}"`);
    lines.push(`Profilo: ${a.description}`);
    if (personality.summary) {
      lines.push(`Sintesi auto-generata: ${personality.summary}`);
    }
    if (personality.axes) {
      const ax = personality.axes;
      lines.push(
        `Assi 1-10 (planning/risk/time/value/social): ${round(ax.planning)}/${round(ax.risk)}/${round(ax.time)}/${round(ax.value)}/${round(ax.social)}`,
      );
    }
  }

  // === Layer 2 — Money Scripts ===
  if (personality.moneyScripts) {
    const ms = personality.moneyScripts;
    lines.push("");
    lines.push("Money Scripts (Klontz, 1-10 per dimensione indipendente):");
    lines.push(`- Avoidance: ${round(ms.avoidance)} (alta = evita pensare ai soldi)`);
    lines.push(`- Worship: ${round(ms.worship)} (alta = soldi = felicità/sicurezza)`);
    lines.push(`- Status: ${round(ms.status)} (alta = possesso = identità)`);
    lines.push(`- Vigilance: ${round(ms.vigilance)} (alta = monitora spesso, condivide poco)`);
  }

  // === Layer 3 — Financial Literacy ===
  if (personality.literacyScore != null) {
    lines.push("");
    lines.push(
      `Financial Literacy (Lusardi Big Three): ${personality.literacyScore}/3 — ${literacyHint(personality.literacyScore)}`,
    );
  }

  // === Layer 4 — Behavioral ===
  if (personality.behavioral) {
    const b = personality.behavioral;
    lines.push("");
    lines.push("Behavioral (1-10):");
    lines.push(`- Loss aversion: ${round(b.lossAversion)} (alta = forte avversione alle perdite, predittore di panic-sell)`);
    lines.push(`- Composure: ${round(b.composure)} (alta = mantiene calma in drawdown)`);
  }

  // === Capacity for Loss (computed) ===
  if (capacity && capacity.level !== "unknown" && capacity.monthlyBurn != null) {
    lines.push("");
    lines.push("Capacity for Loss (calcolata da Net Worth + profilo, NON da test):");
    lines.push(`- Net worth attuale: €${formatEur(capacity.netWorth)}`);
    lines.push(
      `- Safety reserve target: €${formatEur(capacity.safetyReserve)} (${capacity.monthsReserveTarget} mesi × €${formatEur(capacity.monthlyBurn)}/mese)`,
    );
    lines.push(
      `- Eccedenza oltre la reserve: €${formatEur(capacity.excessAboveReserve)} (${round(capacity.capacityPctOfNW)}% del NW)`,
    );
    lines.push(`- Level: ${capacity.level}`);
    lines.push(`- Burn source: ${capacity.burnSource}`);
  }

  if (lines.length === 0) return "";

  return [
    "CONTESTO UTENTE — usa per personalizzare ogni risposta sul profilo e la personalità finanziaria di questo utente specifico:",
    ...lines,
  ].join("\n");
}

/**
 * Guardrails universali per feature che producono output user-facing.
 * Da prepend al system prompt PRIMA del userContext per ricordare al modello
 * il framing legale (no advice MiFID II) e lessicale (Moneybird Insights brand).
 *
 * NON includere in feature funzionali (parsing CSV, mapping colonne) — token
 * sprecati. Da usare solo per feature di insight/osservazione/coaching.
 */
export const AI_INSIGHT_GUARDRAILS = `ISTRUZIONI di sistema per Moneybird Insights:

POSIZIONAMENTO LEGALE
- Sei un sistema di personalizzazione EDUCATIVA, NON un consulente finanziario.
- Non fornisci investment advice ai sensi MiFID II — solo coaching/educational insight basato sui dati locali dell'utente.
- Mai dire di comprare/vendere strumenti finanziari specifici. Mai indicare ticker, ISIN, allocation precise in percentuale.

LESSICO
- VIETATI: "consiglio", "consigli", "raccomando", "raccomandazione", "dovresti", "consulente", "advisor", "advice".
- AMMESSI: "insight", "spunto", "osservazione", "potresti considerare", "alcuni utenti con il tuo profilo trovano utile", "ecco cosa noto nei tuoi dati", "una possibilità è".

CALIBRAZIONE in base al CONTESTO UTENTE
- Financial Literacy 0-1: vocabolario base, spiega anche concetti elementari (interesse composto, inflazione).
- Financial Literacy 2: vocabolario intermedio, ETF/diversificazione/asset class OK.
- Financial Literacy 3: vocabolario tecnico OK (expense ratio, duration, MWR/TWR, drawdown).

GUARD COMPORTAMENTALI
- Loss aversion > 6/10 + asset volatili discussi → premetti sempre la dimensione del rischio.
- Composure < 4/10 → evita scenari di stress, focus su strategie che non richiedano sangue freddo.
- Capacity for Loss = "low" o "unknown" → NON suggerire allocazioni ad alto rischio, anche se il personality test sembra permetterlo (willingness ≠ ability).
- Money Scripts: Avoidance alta → tono incoraggiante, non sovraccaricare di dettagli o cifre.
- Money Scripts: Vigilance alta → dettagli OK, ma evita di amplificare l'ansia ("stai facendo bene a monitorare, ecco un'osservazione neutra").
- Money Scripts: Worship alta → smorzare l'aspettativa che più soldi = più felicità, riconoscere la dimensione emotiva.
- Money Scripts: Status alta → connettere obiettivi materiali a goal di lungo termine, non giudicare la motivazione.

OUTPUT
- Sempre educativo + personalizzato sui dati dell'utente.
- Quando ha senso, chiudi con una domanda aperta che inviti l'utente a riflettere.
- Niente toni paternalistici. L'utente è adulto e responsabile delle sue decisioni.`;

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function literacyHint(score: number): string {
  if (score <= 1) return "vocabolario base, spiegare anche concetti elementari";
  if (score === 2) return "vocabolario intermedio (ETF, diversificazione)";
  return "vocabolario tecnico OK (expense ratio, duration, MWR/TWR)";
}

function computeAge(birthDate: string): number | null {
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
