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

/**
 * Currency probabile per paese / nome del paese (italiano o inglese o codice).
 * Usato come default ragionevole in form di create account: utente UK vede
 * GBP pre-selezionato invece di EUR. Niente di più di un suggerimento — l'UI
 * lascia la scelta libera nella select.
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Eurozona — EUR
  IT: "EUR", ITALIA: "EUR", ITALY: "EUR",
  FR: "EUR", FRANCIA: "EUR", FRANCE: "EUR",
  DE: "EUR", GERMANIA: "EUR", GERMANY: "EUR",
  ES: "EUR", SPAGNA: "EUR", SPAIN: "EUR",
  PT: "EUR", PORTOGALLO: "EUR", PORTUGAL: "EUR",
  NL: "EUR", PAESI_BASSI: "EUR", NETHERLANDS: "EUR",
  BE: "EUR", BELGIO: "EUR", BELGIUM: "EUR",
  AT: "EUR", AUSTRIA: "EUR",
  IE: "EUR", IRLANDA: "EUR", IRELAND: "EUR",
  GR: "EUR", GRECIA: "EUR", GREECE: "EUR",
  // Non-EUR
  GB: "GBP", REGNO_UNITO: "GBP", "REGNO UNITO": "GBP", UK: "GBP", "UNITED KINGDOM": "GBP",
  US: "USD", USA: "USD", "STATI UNITI": "USD", "UNITED STATES": "USD",
  CH: "CHF", SVIZZERA: "CHF", SWITZERLAND: "CHF",
  AL: "ALL", ALBANIA: "ALL",
  PL: "PLN", POLONIA: "PLN", POLAND: "PLN",
  CZ: "CZK",
  SE: "SEK", SVEZIA: "SEK", SWEDEN: "SEK",
  DK: "DKK",
  NO: "NOK",
};

export function currencyFromCountry(country: string | null | undefined): string {
  if (!country) return "EUR";
  const key = country.trim().toUpperCase().replace(/\s+/g, "_");
  return COUNTRY_TO_CURRENCY[key] ?? "EUR";
}
