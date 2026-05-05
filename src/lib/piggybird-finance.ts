/**
 * Costanti e helper condivisi per la rubrica "Piggybird Finance".
 */

export const NOTIFY_SETTING_KEY = "pf-notify-new-issue";
export const NOTIFY_DISMISSED_KEY_PREFIX = "pf-notify-dismissed.";

const MONTH_NAMES_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

/**
 * Ritorna l'anno e il mese (0-based) del numero che stiamo "pubblicando".
 * Se < giorno 15 → mese precedente (chiuso, dati completi).
 * Da 15 in poi → mese in corso.
 */
export function targetIssueMonth(now: Date = new Date()): { year: number; month: number } {
  const useCurrent = now.getDate() >= 15;
  if (useCurrent) {
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  if (now.getMonth() === 0) {
    return { year: now.getFullYear() - 1, month: 11 };
  }
  return { year: now.getFullYear(), month: now.getMonth() - 1 };
}

export function monthKey(now?: Date): string {
  const { year, month } = targetIssueMonth(now);
  return `insights.networth.${year}-${String(month + 1).padStart(2, "0")}`;
}

export function dismissKey(now?: Date): string {
  const { year, month } = targetIssueMonth(now);
  return `${NOTIFY_DISMISSED_KEY_PREFIX}${year}-${String(month + 1).padStart(2, "0")}`;
}

export function monthLabel(now?: Date): string {
  const { year, month } = targetIssueMonth(now);
  return `${MONTH_NAMES_IT[month]} ${year}`;
}
