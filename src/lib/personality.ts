import { prisma } from "./prisma";
import {
  ARCHETYPES,
  findArchetype,
  type Axes,
  type MoneyArchetype,
} from "./personality-archetypes";

/**
 * Personality test: storage, scoring, derived profile.
 *
 * Storage in `Setting` con prefix `personality.*`:
 *   - `personality.completedAt` ISO date — quando è stato completato
 *   - `personality.answers` JSON {questionId: value} — risposte raw (per
 *     ri-prendere il test e ricalcolare se aggiungiamo questions)
 *   - `personality.archetypeId` — id calcolato (es. "wealth-architect")
 *   - `personality.axes` JSON Axes — coordinate 4D calcolate
 *   - `personality.summary` — 1 paragrafo personalizzato (per AI prompts)
 *
 * Privacy: tutto resta nel DB locale. Quando l'utente usa una feature AI,
 * il summary viene incluso nel prompt locale. Al developer arrivano solo
 * archetype aggregati anonimi (per stats "23% utenti = Experiential").
 */

export type PersonalityProfile = {
  completed: boolean;
  completedAt: string | null;
  answers: Record<string, number>;
  archetype: MoneyArchetype | null;
  axes: Axes | null;
  summary: string;
};

const KEYS = {
  completedAt: "personality.completedAt",
  answers: "personality.answers",
  archetypeId: "personality.archetypeId",
  axes: "personality.axes",
  summary: "personality.summary",
} as const;

export async function getPersonalityProfile(): Promise<PersonalityProfile> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const completedAt = map.get(KEYS.completedAt) ?? null;
  let answers: Record<string, number> = {};
  let axes: Axes | null = null;
  try {
    const a = map.get(KEYS.answers);
    if (a) answers = JSON.parse(a);
  } catch {}
  try {
    const x = map.get(KEYS.axes);
    if (x) axes = JSON.parse(x);
  } catch {}
  const archetypeId = map.get(KEYS.archetypeId) ?? null;
  const archetype = archetypeId
    ? ARCHETYPES.find((a) => a.id === archetypeId) ?? null
    : null;
  return {
    completed: !!completedAt,
    completedAt,
    answers,
    archetype,
    axes,
    summary: map.get(KEYS.summary) ?? "",
  };
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function savePersonalityResult(
  answers: Record<string, number>,
  axes: Axes,
  summary: string,
): Promise<MoneyArchetype> {
  const archetype = findArchetype(axes);
  await Promise.all([
    upsertSetting(KEYS.completedAt, new Date().toISOString()),
    upsertSetting(KEYS.answers, JSON.stringify(answers)),
    upsertSetting(KEYS.archetypeId, archetype.id),
    upsertSetting(KEYS.axes, JSON.stringify(axes)),
    upsertSetting(KEYS.summary, summary),
  ]);
  return archetype;
}

export async function resetPersonality(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((k) =>
      prisma.setting.delete({ where: { key: k } }).catch(() => null),
    ),
  );
}

/**
 * Comparazione anonima con altri utenti.
 *
 * Fase 1 (questa): mock data hardcoded — sostituire con real aggregazione
 * quando avremo abbastanza beta tester (~50+) tramite endpoint dedicato
 * che fa aggregazione anonima sul backend dev (no PII).
 *
 * Fase 2: chiamata a https://piggybird-stats.dev/api/archetype-distribution
 * o equivalent — gestita lato Marco con un service piccolo che riceve solo
 * `{archetypeId, country, city}` aggregato. Per ora ritorna mock.
 */
export type ArchetypeStats = {
  scope: "city" | "country" | "world";
  scopeLabel: string;
  /** % di utenti in questo scope con questo archetype */
  percent: number;
  /** Total users in scope (sample size) */
  totalUsers: number;
};

export async function getArchetypeStats(
  archetypeId: string,
  city: string | null,
  country: string | null,
): Promise<ArchetypeStats[]> {
  // MOCK: Fase 1, dati fittizi. Sostituire quando arriva real backend.
  // Distribuzione mock vagamente plausibile per dare senso alla UI.
  const mockPercents: Record<string, [number, number, number]> = {
    "wealth-architect": [18, 14, 11],
    "experiential-optimist": [22, 19, 17],
    "fire-seeker": [12, 10, 8],
    "vault-keeper": [16, 17, 15],
    "free-spirit": [10, 12, 14],
    "generous-provider": [8, 9, 10],
    "status-curator": [6, 7, 9],
    "cautious-steward": [4, 5, 6],
    "bold-investor": [2, 3, 4],
    "mindful-minimalist": [9, 8, 7],
    "social-currency": [11, 13, 15],
    "visionary-founder": [3, 3, 4],
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
