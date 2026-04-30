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
  /** Multi-select: cosa cerchi in Moneybird */
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
