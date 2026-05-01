/**
 * Costanti dei dropdown per il profilo utente. File client-safe (no prisma,
 * no dipendenze server) per essere importato anche dai client components.
 *
 * Le funzioni server stanno in `lib/user-profile.ts`.
 */

export type UserProfile = {
  // Required
  name: string;
  email: string;
  countries: string[];
  // Optional demographic
  /** Data di nascita ISO "YYYY-MM-DD". Da qui ricaviamo l'età corrente
   *  via calcAge(), così non serve aggiornare manualmente l'età ogni anno. */
  birthDate: string;
  familyStatus: string; // "single" | "couple" | "family" | "other" | ""
  profession: string; // "employee" | "freelance" | "entrepreneur" | "student" | "other" | ""
  trackingExperience: string; // "first" | "excel" | "fintech" | "other" | ""
  /** Multi-select: cosa cerchi in Piggybird */
  goals: string[]; // subset di GOAL_OPTIONS values
};

export const FAMILY_STATUSES = [
  { value: "single", label: "Single", emoji: "🧑" },
  { value: "couple", label: "In coppia", emoji: "👫" },
  { value: "family", label: "Famiglia con figli", emoji: "👨‍👩‍👧" },
  { value: "other", label: "Altro", emoji: "✨" },
] as const;

export const PROFESSIONS = [
  { value: "employee", label: "Dipendente", emoji: "💼" },
  { value: "freelance", label: "Freelance / Partita IVA", emoji: "🧑‍💻" },
  { value: "entrepreneur", label: "Imprenditore", emoji: "🚀" },
  { value: "student", label: "Studente", emoji: "🎓" },
  { value: "other", label: "Altro", emoji: "✨" },
] as const;

export const TRACKING_EXPERIENCES = [
  { value: "first", label: "Primo tracker", emoji: "🌱" },
  { value: "excel", label: "Excel / Google Sheets", emoji: "📊" },
  { value: "fintech", label: "Altre app (YNAB, Toshl…)", emoji: "📱" },
  { value: "other", label: "Altro", emoji: "✨" },
] as const;

export const GOAL_OPTIONS = [
  { value: "expenses", label: "Tracking spese", emoji: "🧾" },
  { value: "investments", label: "Investimenti", emoji: "📈" },
  { value: "wealth", label: "Patrimonio totale (net worth)", emoji: "💎" },
  { value: "shared", label: "Spese condivise", emoji: "🤝" },
  { value: "savings", label: "Obiettivi & risparmi", emoji: "🎯" },
] as const;

export const MONTHLY_INCOME_OPTIONS = [
  { value: "<2k", label: "< €2.000", emoji: "💶" },
  { value: "2-3k", label: "€2.000 – €3.000", emoji: "💶" },
  { value: "3-5k", label: "€3.000 – €5.000", emoji: "💶" },
  { value: "5-8k", label: "€5.000 – €8.000", emoji: "💶" },
  { value: "8-12k", label: "€8.000 – €12.000", emoji: "💶" },
  { value: "12k+", label: "> €12.000", emoji: "💶" },
] as const;

export const CHILDREN_COUNT_OPTIONS = [
  { value: "0", label: "Nessuno", emoji: "🚫" },
  { value: "1", label: "1", emoji: "👶" },
  { value: "2", label: "2", emoji: "👨‍👩‍👧" },
  { value: "3+", label: "3 o più", emoji: "👨‍👩‍👧‍👦" },
] as const;

export const RETIREMENT_AGE_OPTIONS = [
  { value: "50-55", label: "50 – 55", emoji: "🏝️" },
  { value: "55-60", label: "55 – 60", emoji: "🏝️" },
  { value: "60-65", label: "60 – 65", emoji: "🏖️" },
  { value: "65-70", label: "65 – 70", emoji: "🏖️" },
  { value: "no-fretta", label: "Nessuna fretta", emoji: "✨" },
] as const;

export const RISK_TOLERANCE_OPTIONS = [
  { value: "conservative", label: "Conservativo", emoji: "🛡️" },
  { value: "balanced", label: "Bilanciato", emoji: "⚖️" },
  { value: "aggressive", label: "Aggressivo", emoji: "🚀" },
] as const;

export const HOUSING_TYPE_OPTIONS = [
  { value: "own-no-mortgage", label: "Proprietà (senza mutuo)", emoji: "🔑" },
  { value: "own-mortgage", label: "Proprietà (con mutuo)", emoji: "🏦" },
  { value: "rent", label: "Affitto", emoji: "🏷️" },
  { value: "family", label: "Famiglia / convivenza", emoji: "👨‍👩‍👧" },
] as const;

/**
 * Calcola l'età in anni compiuti da una data ISO "YYYY-MM-DD".
 * Ritorna null se la data è invalida o non impostata.
 */
export function calcAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}
