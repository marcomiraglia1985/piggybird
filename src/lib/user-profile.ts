import { prisma } from "./prisma";
import type { UserProfile } from "./profile-options";

/**
 * Funzioni server-side per leggere/scrivere il profilo utente nelle Setting
 * key-value. Le costanti dei dropdown (AGE_RANGES, FAMILY_STATUSES, ecc.) e
 * il type UserProfile stanno in `lib/profile-options.ts` (client-safe).
 */

const KEYS = {
  name: "user.name",
  email: "user.email",
  countries: "user.countries",
  city: "user.city",
  birthDate: "user.birthDate",
  familyStatus: "user.familyStatus",
  profession: "user.profession",
  trackingExperience: "user.trackingExperience",
  goals: "user.goals",
  monthlyIncome: "user.monthlyIncome",
  childrenCount: "user.childrenCount",
  retirementAge: "user.retirementAge",
  riskTolerance: "user.riskTolerance",
  housingType: "user.housingType",
} as const;

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  email: "",
  countries: [],
  city: "",
  birthDate: "",
  familyStatus: "",
  profession: "",
  trackingExperience: "",
  goals: [],
  monthlyIncome: "",
  childrenCount: "",
  retirementAge: "",
  riskTolerance: "",
  housingType: "",
};

function parseJsonArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((c) => typeof c === "string");
    }
  } catch {
    // Fallback CSV legacy
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export async function getUserProfile(): Promise<UserProfile> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    name: map.get(KEYS.name) ?? DEFAULT_PROFILE.name,
    email: map.get(KEYS.email) ?? DEFAULT_PROFILE.email,
    countries: parseJsonArray(map.get(KEYS.countries)),
    city: map.get(KEYS.city) ?? DEFAULT_PROFILE.city,
    birthDate: map.get(KEYS.birthDate) ?? DEFAULT_PROFILE.birthDate,
    familyStatus: map.get(KEYS.familyStatus) ?? DEFAULT_PROFILE.familyStatus,
    profession: map.get(KEYS.profession) ?? DEFAULT_PROFILE.profession,
    trackingExperience: map.get(KEYS.trackingExperience) ?? DEFAULT_PROFILE.trackingExperience,
    goals: parseJsonArray(map.get(KEYS.goals)),
    monthlyIncome: map.get(KEYS.monthlyIncome) ?? DEFAULT_PROFILE.monthlyIncome,
    childrenCount: map.get(KEYS.childrenCount) ?? DEFAULT_PROFILE.childrenCount,
    retirementAge: map.get(KEYS.retirementAge) ?? DEFAULT_PROFILE.retirementAge,
    riskTolerance: map.get(KEYS.riskTolerance) ?? DEFAULT_PROFILE.riskTolerance,
    housingType: map.get(KEYS.housingType) ?? DEFAULT_PROFILE.housingType,
  };
}

export async function saveUserProfile(input: Partial<UserProfile>): Promise<void> {
  const ops: Promise<unknown>[] = [];
  if (input.name !== undefined) ops.push(upsertSetting(KEYS.name, input.name.trim()));
  if (input.email !== undefined) ops.push(upsertSetting(KEYS.email, input.email.trim()));
  if (input.countries !== undefined) ops.push(upsertSetting(KEYS.countries, JSON.stringify(input.countries)));
  if (input.city !== undefined) ops.push(upsertSetting(KEYS.city, input.city.trim()));
  if (input.birthDate !== undefined) ops.push(upsertSetting(KEYS.birthDate, input.birthDate.trim()));
  if (input.familyStatus !== undefined) ops.push(upsertSetting(KEYS.familyStatus, input.familyStatus.trim()));
  if (input.profession !== undefined) ops.push(upsertSetting(KEYS.profession, input.profession.trim()));
  if (input.trackingExperience !== undefined) ops.push(upsertSetting(KEYS.trackingExperience, input.trackingExperience.trim()));
  if (input.goals !== undefined) ops.push(upsertSetting(KEYS.goals, JSON.stringify(input.goals)));
  if (input.monthlyIncome !== undefined) ops.push(upsertSetting(KEYS.monthlyIncome, input.monthlyIncome.trim()));
  if (input.childrenCount !== undefined) ops.push(upsertSetting(KEYS.childrenCount, input.childrenCount.trim()));
  if (input.retirementAge !== undefined) ops.push(upsertSetting(KEYS.retirementAge, input.retirementAge.trim()));
  if (input.riskTolerance !== undefined) ops.push(upsertSetting(KEYS.riskTolerance, input.riskTolerance.trim()));
  if (input.housingType !== undefined) ops.push(upsertSetting(KEYS.housingType, input.housingType.trim()));
  await Promise.all(ops);
}

async function upsertSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * True quando l'utente ha completato l'onboarding (i 3 campi obbligatori:
 * name + email + almeno 1 paese). Gli altri sono opzionali.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const profile = await getUserProfile();
  return !!(profile.name.trim() && profile.email.trim() && profile.countries.length > 0);
}
