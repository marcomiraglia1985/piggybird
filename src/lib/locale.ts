/**
 * Locale resolver per formatting (numeri, date, valute).
 *
 * Strategia universale-app: deriva il locale dai countries dell'utente nel
 * profilo. Se countries[0] = "IT" → "it-IT", "FR" → "fr-FR", ecc. Fallback
 * "it-IT" per profilo vuoto (la app è nata IT, default ragionevole finché
 * non si fa onboarding completo).
 *
 * Server-side: chiama `resolveUserLocale()` da una server component / route.
 * Client-side: si può passare via React Context bootstrappato dal layout
 * server (vedi `lib/preferences.tsx` come modello). Per ora i client component
 * usano il default — la migrazione completa è graduale.
 */

import { prisma } from "./prisma";

const COUNTRY_TO_LOCALE: Record<string, string> = {
  IT: "it-IT",
  FR: "fr-FR",
  DE: "de-DE",
  ES: "es-ES",
  PT: "pt-PT",
  NL: "nl-NL",
  BE: "fr-BE",
  AT: "de-AT",
  IE: "en-IE",
  GR: "el-GR",
  PL: "pl-PL",
  AL: "sq-AL",
  GB: "en-GB",
  US: "en-US",
};

/** Default locale per fallback (invariato col comportamento storico). */
export const DEFAULT_LOCALE = "it-IT";

/**
 * Resolve il locale UI dell'utente leggendo Setting `user.countries` (JSON
 * array di codici ISO). Server-side only.
 */
export async function resolveUserLocale(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: "user.countries" },
    });
    if (!row?.value) return DEFAULT_LOCALE;
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_LOCALE;
    const first = String(parsed[0]).toUpperCase();
    return COUNTRY_TO_LOCALE[first] ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Sincrono: deriva locale da un codice country già fornito (quando server l'ha precaricato). */
export function localeFromCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_LOCALE;
  return COUNTRY_TO_LOCALE[country.toUpperCase()] ?? DEFAULT_LOCALE;
}
