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
