import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eurFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 2,
});

// Deterministic compact formatter (avoids ICU-data drift between Node and browser)
function formatItNumber(n: number, decimals = 1): string {
  const rounded = decimals === 0 ? Math.round(n) : Math.round(n * 10 ** decimals) / 10 ** decimals;
  return rounded.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function compactEUR(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1000) return `${formatItNumber(amount, 0)} €`;
  if (abs < 1_000_000) return `${formatItNumber(amount / 1000, 1)}K €`;
  if (abs < 1_000_000_000) return `${formatItNumber(amount / 1_000_000, 1)}M €`;
  return `${formatItNumber(amount / 1_000_000_000, 1)}B €`;
}

export function formatEUR(amount: number, opts: { compact?: boolean; signed?: boolean } = {}) {
  const formatted = opts.compact ? compactEUR(Math.abs(amount)) : eurFormatter.format(Math.abs(amount));
  if (opts.signed && amount > 0) return `+${formatted}`;
  if (amount < 0) return `−${formatted}`;
  return formatted;
}

/**
 * Arrotonda un valore in euro a 2 decimali. Da usare sui totali aggregati
 * (NW, sum mensile, ecc.) per evitare drift visibile da accumulo di errori
 * binari Float (es. 0.1 + 0.2 = 0.30000000000000004). Non risolve il
 * precision-debt strutturale (vedi schema.prisma) — solo strato di sicurezza
 * visiva sui valori derivati.
 */
export function roundEur(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNumber(n: number) {
  return numberFormatter.format(n);
}

export function formatPercent(n: number, opts: { signed?: boolean } = {}) {
  const formatted = `${(n * 100).toFixed(1)}%`;
  if (opts.signed && n > 0) return `+${formatted}`;
  if (n < 0 && !formatted.startsWith("-")) return `-${formatted}`;
  return formatted;
}

export function formatDate(date: Date | string, opts: Intl.DateTimeFormatOptions = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric", ...opts }).format(d);
}

export function formatMonth(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(d);
}

/**
 * Format compatto per tick di chart: "ott 24" invece di "ottobre 2024".
 * Mese abbreviato (3 char) + anno 2-digit, lowercase italiano.
 */
export function formatMonthShort(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" })
    .format(d)
    .replace(/\.$/, ""); // rimuovi punto trailing (es. "ott. 24" → "ott 24")
}
