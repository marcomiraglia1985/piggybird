import { prisma } from "./prisma";
import {
  ARCHETYPES,
  findArchetype,
  type Axes,
  type MoneyArchetype,
} from "./personality-archetypes";
import { getUserProfile } from "./user-profile";

const STATS_BACKEND_URL = process.env.PIGGYBIRD_STATS_URL;

/**
 * Personality test: storage, scoring, derived profile.
 *
 * Storage in `Setting` con prefix `personality.*`:
 *   - `personality.completedAt` ISO date — quando è stato completato
 *   - `personality.answers` JSON {questionId: value} — risposte raw (per
 *     ri-prendere il test e ricalcolare se aggiungiamo questions)
 *   - `personality.archetypeId` — id calcolato (es. "weaver", "owl")
 *   - `personality.axes` JSON Axes — coordinate 5D Layer 1
 *   - `personality.summary` — 1 paragrafo personalizzato (per AI prompts)
 *   - `personality.testVersion` — versione del test usata
 *
 * V4 layers (Klontz/Lusardi/behavioral overlay — vedi
 * project_personality_test_roadmap):
 *   - `personality.moneyScripts` JSON MoneyScripts — Layer 2
 *   - `personality.literacyScore` int 0-3 — Layer 3 (Lusardi Big Three)
 *   - `personality.behavioral` JSON BehavioralProfile — Layer 4
 *   - `personality.vision` string opzionale — Layer 5 (Kinder-lite)
 *
 * Privacy: tutto resta nel DB locale. Quando l'utente usa una feature AI,
 * il summary viene incluso nel prompt locale. Al developer arrivano solo
 * archetype aggregati anonimi (per stats "23% utenti = Experiential"). I
 * layer v4 NON sono tracciati al backend stats — restano strettamente locali.
 */

/**
 * Layer 2 — Money Scripts (Klontz-inspired).
 * 4 dimensioni indipendenti (1-10 ciascuna). NON sono assi del modello 5D —
 * sono overlay psicologici ortogonali che indicano relazione emotiva con
 * il denaro (vs trait di personalità). Costrutti dalla Klontz Money Script
 * Inventory–Revised; item originali Piggybird (no licensing, vedi roadmap).
 */
export type MoneyScripts = {
  /** Alta = "i soldi mi mettono ansia, preferisco non pensarci" */
  avoidance: number;
  /** Alta = "più soldi = più felicità / sicurezza" */
  worship: number;
  /** Alta = "ciò che possiedo dice chi sono" */
  status: number;
  /** Alta = "monitoro spesso, non condivido cifre, mi preoccupo" */
  vigilance: number;
};

/**
 * Layer 4 — Behavioral biases.
 * Loss aversion + composure (Oxford Risk-style) — predicono panic-sell in
 * drawdown. ESMA Guidelines on MiFID II Suitability richiedono esplicitamente
 * che la suitability assessment includa loss aversion.
 */
export type BehavioralProfile = {
  /** 1-10. Alta = forte avversione alle perdite */
  lossAversion: number;
  /** 1-10. Alta = mantiene la calma in drawdown */
  composure: number;
};

export type PersonalityProfile = {
  completed: boolean;
  completedAt: string | null;
  answers: Record<string, number>;
  archetype: MoneyArchetype | null;
  axes: Axes | null;
  summary: string;
  /** Versione del test usata per generare questo profilo. null se profilo
   *  legacy salvato prima dell'introduzione del versioning. */
  testVersion: number | null;
  /** Layer 2 — null se profilo v < 4. */
  moneyScripts: MoneyScripts | null;
  /** Layer 3 — null se profilo v < 4. 0-3 risposte corrette Lusardi. */
  literacyScore: number | null;
  /** Layer 4 — null se profilo v < 4. */
  behavioral: BehavioralProfile | null;
  /** Layer 5 — null o stringa vuota se non compilato. */
  vision: string | null;
};

const KEYS = {
  completedAt: "personality.completedAt",
  answers: "personality.answers",
  archetypeId: "personality.archetypeId",
  axes: "personality.axes",
  summary: "personality.summary",
  testVersion: "personality.testVersion",
  // v4
  moneyScripts: "personality.moneyScripts",
  literacyScore: "personality.literacyScore",
  behavioral: "personality.behavioral",
  vision: "personality.vision",
} as const;

export async function getPersonalityProfile(): Promise<PersonalityProfile> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const completedAt = map.get(KEYS.completedAt) ?? null;
  let answers: Record<string, number> = {};
  let axes: Axes | null = null;
  let moneyScripts: MoneyScripts | null = null;
  let behavioral: BehavioralProfile | null = null;
  try {
    const a = map.get(KEYS.answers);
    if (a) answers = JSON.parse(a);
  } catch {}
  try {
    const x = map.get(KEYS.axes);
    if (x) axes = JSON.parse(x);
  } catch {}
  try {
    const m = map.get(KEYS.moneyScripts);
    if (m) moneyScripts = JSON.parse(m);
  } catch {}
  try {
    const b = map.get(KEYS.behavioral);
    if (b) behavioral = JSON.parse(b);
  } catch {}
  const archetypeId = map.get(KEYS.archetypeId) ?? null;
  const archetype = archetypeId
    ? ARCHETYPES.find((a) => a.id === archetypeId) ?? null
    : null;
  const tvRaw = map.get(KEYS.testVersion);
  const testVersion = tvRaw ? parseInt(tvRaw, 10) : null;
  const lsRaw = map.get(KEYS.literacyScore);
  const literacyScore =
    lsRaw != null ? parseInt(lsRaw, 10) : null;
  const visionRaw = map.get(KEYS.vision);
  return {
    completed: !!completedAt,
    completedAt,
    answers,
    archetype,
    axes,
    summary: map.get(KEYS.summary) ?? "",
    testVersion: testVersion && isFinite(testVersion) ? testVersion : null,
    moneyScripts,
    literacyScore:
      literacyScore != null && isFinite(literacyScore) ? literacyScore : null,
    behavioral,
    vision: visionRaw && visionRaw.trim().length > 0 ? visionRaw : null,
  };
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export type PersonalityLayers = {
  moneyScripts?: MoneyScripts;
  literacyScore?: number;
  behavioral?: BehavioralProfile;
  vision?: string;
};

export async function savePersonalityResult(
  answers: Record<string, number>,
  axes: Axes,
  summary: string,
  testVersion: number,
  layers?: PersonalityLayers,
): Promise<MoneyArchetype> {
  const archetype = findArchetype(axes);
  const writes: Promise<unknown>[] = [
    upsertSetting(KEYS.completedAt, new Date().toISOString()),
    upsertSetting(KEYS.answers, JSON.stringify(answers)),
    upsertSetting(KEYS.archetypeId, archetype.id),
    upsertSetting(KEYS.axes, JSON.stringify(axes)),
    upsertSetting(KEYS.summary, summary),
    upsertSetting(KEYS.testVersion, String(testVersion)),
  ];
  if (layers?.moneyScripts) {
    writes.push(
      upsertSetting(KEYS.moneyScripts, JSON.stringify(layers.moneyScripts)),
    );
  }
  if (layers?.literacyScore != null) {
    writes.push(upsertSetting(KEYS.literacyScore, String(layers.literacyScore)));
  }
  if (layers?.behavioral) {
    writes.push(
      upsertSetting(KEYS.behavioral, JSON.stringify(layers.behavioral)),
    );
  }
  if (layers?.vision != null) {
    writes.push(upsertSetting(KEYS.vision, layers.vision));
  }
  await Promise.all(writes);
  // Fire-and-forget: traccia anonima al backend stats (se configurato).
  // Solo archetype + country + city del profilo + testVersion, no PII,
  // no userId, no IP. NON tracciamo i layer v4 — restano strettamente locali.
  const profile = await getUserProfile().catch(() => null);
  void trackToBackend(
    archetype.id,
    profile?.countries[0] ?? null,
    profile?.city || null,
    testVersion,
  );
  return archetype;
}

async function trackToBackend(
  archetypeId: string,
  country: string | null,
  city: string | null,
  testVersion: number,
): Promise<void> {
  if (!STATS_BACKEND_URL) return;
  try {
    await fetch(`${STATS_BACKEND_URL}/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archetypeId, country, city, testVersion }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Fail silently — non-critical.
  }
}

export async function resetPersonality(): Promise<void> {
  // deleteMany è atomico e non solleva su record assenti (a differenza di
  // delete + .catch). Se DB lock o altro errore reale, il caller riceve
  // l'errore invece di un reset silente parziale.
  await prisma.setting.deleteMany({
    where: { key: { in: Object.values(KEYS) } },
  });
}

/**
 * Comparazione anonima con altri utenti.
 *
 * Se `PIGGYBIRD_STATS_URL` è configurato (Cloudflare Worker — vedi
 * tools/piggybird-stats/), fetcha la distribuzione reale aggregata.
 * Altrimenti ritorna mock data (utile in dev e per nuovi setup).
 *
 * Il backend applica min sample threshold (30 city, 10 country) — uno scope
 * sotto soglia non appare nei risultati.
 */
export type ArchetypeStats = {
  scope: "city" | "country" | "world";
  scopeLabel: string;
  percent: number;
  totalUsers: number;
};

export async function getArchetypeStats(
  archetypeId: string,
  city: string | null,
  country: string | null,
  testVersion: number,
): Promise<ArchetypeStats[]> {
  const real = await fetchBackendStats(archetypeId, city, country, testVersion);
  if (real) return real;
  return mockStats(archetypeId, city, country);
}

async function fetchBackendStats(
  archetypeId: string,
  city: string | null,
  country: string | null,
  testVersion: number,
): Promise<ArchetypeStats[] | null> {
  if (!STATS_BACKEND_URL) return null;
  try {
    const params = new URLSearchParams({ archetypeId });
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (testVersion > 0) params.set("testVersion", String(testVersion));
    const r = await fetch(`${STATS_BACKEND_URL}/distribution?${params}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j: { stats?: unknown } = await r.json();
    return Array.isArray(j.stats) ? (j.stats as ArchetypeStats[]) : null;
  } catch {
    return null;
  }
}

function mockStats(
  archetypeId: string,
  city: string | null,
  country: string | null,
): ArchetypeStats[] {
  const mockPercents: Record<string, [number, number, number]> = {
    weaver: [18, 14, 11],
    "bird-of-paradise": [22, 19, 17],
    albatross: [12, 10, 8],
    owl: [16, 17, 15],
    hummingbird: [10, 12, 14],
    pelican: [8, 9, 10],
    peacock: [6, 7, 9],
    crane: [4, 5, 6],
    falcon: [2, 3, 4],
    sparrow: [9, 8, 7],
    starling: [11, 13, 15],
    raven: [3, 3, 4],
  };
  const [pCity, pCountry, pWorld] = mockPercents[archetypeId] ?? [10, 10, 10];
  return [
    {
      scope: "city",
      scopeLabel: city || "—",
      percent: pCity,
      totalUsers: city ? 47 : 0,
    },
    {
      scope: "country",
      scopeLabel: country || "—",
      percent: pCountry,
      totalUsers: country ? 312 : 0,
    },
    { scope: "world", scopeLabel: "Mondo", percent: pWorld, totalUsers: 5800 },
  ];
}
