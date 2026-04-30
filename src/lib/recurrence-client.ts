/** Client-side helpers per gestione ricorrenze.
 *  Lo storage `IGNORED_KEY` tiene gli id che l'utente ha esplicitamente
 *  escluso dai prompt di estensione (banner + pagina ricorrenze). Reset
 *  manuale dalla devtools se serve. */

const IGNORED_KEY = "fp-recurrence-ignored";

export function getIgnoredRecurrences(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(IGNORED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function ignoreRecurrence(groupId: string) {
  if (typeof window === "undefined") return;
  const set = getIgnoredRecurrences();
  set.add(groupId);
  try {
    window.localStorage.setItem(IGNORED_KEY, JSON.stringify([...set]));
  } catch {}
}

/** Numero di mesi (≥1) da `lastDate` a fine dicembre dell'anno corrente.
 *  Usato come default per estendere ricorrenze: il forecast del cashflow
 *  proietta fino a fine anno corrente, oltre non avrebbe utilità. */
export function monthsUntilEndOfYear(lastDate: Date, now: Date = new Date()): number {
  const targetYear = now.getFullYear();
  const monthsDiff =
    (targetYear - lastDate.getFullYear()) * 12 + (11 - lastDate.getMonth());
  return Math.max(1, monthsDiff);
}
