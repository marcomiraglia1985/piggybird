/**
 * Lista curata di paesi EUROPEI (ISO 3166-1) con nome italiano + flag emoji.
 * Usata dal CountryPicker del profilo utente.
 *
 * Scope: solo Europa (EU 27 + extra-EU geograficamente europei). Niente paesi
 * oversea perché Moneybird non ha ancora supporto bancario al di fuori
 * dell'area europea. Quando aggiungeremo broker/banche extra-EU, espandere
 * questa lista.
 *
 * Storage: il `name` italiano è la chiave canonica (es. "Italia").
 */

export type Country = {
  /** ISO 3166-1 alpha-2 — non usato per storage, solo helper */
  code: string;
  /** Nome italiano — è la chiave di storage */
  name: string;
  /** Emoji bandiera */
  flag: string;
};

export const COUNTRIES: Country[] = [
  // === EU 27 ===
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "BE", name: "Belgio", flag: "🇧🇪" },
  { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
  { code: "HR", name: "Croazia", flag: "🇭🇷" },
  { code: "CY", name: "Cipro", flag: "🇨🇾" },
  { code: "CZ", name: "Repubblica Ceca", flag: "🇨🇿" },
  { code: "DK", name: "Danimarca", flag: "🇩🇰" },
  { code: "EE", name: "Estonia", flag: "🇪🇪" },
  { code: "FI", name: "Finlandia", flag: "🇫🇮" },
  { code: "FR", name: "Francia", flag: "🇫🇷" },
  { code: "DE", name: "Germania", flag: "🇩🇪" },
  { code: "GR", name: "Grecia", flag: "🇬🇷" },
  { code: "HU", name: "Ungheria", flag: "🇭🇺" },
  { code: "IE", name: "Irlanda", flag: "🇮🇪" },
  { code: "IT", name: "Italia", flag: "🇮🇹" },
  { code: "LV", name: "Lettonia", flag: "🇱🇻" },
  { code: "LT", name: "Lituania", flag: "🇱🇹" },
  { code: "LU", name: "Lussemburgo", flag: "🇱🇺" },
  { code: "MT", name: "Malta", flag: "🇲🇹" },
  { code: "NL", name: "Paesi Bassi", flag: "🇳🇱" },
  { code: "PL", name: "Polonia", flag: "🇵🇱" },
  { code: "PT", name: "Portogallo", flag: "🇵🇹" },
  { code: "RO", name: "Romania", flag: "🇷🇴" },
  { code: "SK", name: "Slovacchia", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", flag: "🇸🇮" },
  { code: "ES", name: "Spagna", flag: "🇪🇸" },
  { code: "SE", name: "Svezia", flag: "🇸🇪" },

  // === Europa extra-EU ===
  { code: "AL", name: "Albania", flag: "🇦🇱" },
  { code: "AD", name: "Andorra", flag: "🇦🇩" },
  { code: "BA", name: "Bosnia ed Erzegovina", flag: "🇧🇦" },
  { code: "BY", name: "Bielorussia", flag: "🇧🇾" },
  { code: "GB", name: "Regno Unito", flag: "🇬🇧" },
  { code: "IS", name: "Islanda", flag: "🇮🇸" },
  { code: "LI", name: "Liechtenstein", flag: "🇱🇮" },
  { code: "MC", name: "Monaco", flag: "🇲🇨" },
  { code: "ME", name: "Montenegro", flag: "🇲🇪" },
  { code: "MK", name: "Macedonia del Nord", flag: "🇲🇰" },
  { code: "MD", name: "Moldavia", flag: "🇲🇩" },
  { code: "NO", name: "Norvegia", flag: "🇳🇴" },
  { code: "RS", name: "Serbia", flag: "🇷🇸" },
  { code: "SM", name: "San Marino", flag: "🇸🇲" },
  { code: "CH", name: "Svizzera", flag: "🇨🇭" },
  { code: "TR", name: "Turchia", flag: "🇹🇷" },
  { code: "UA", name: "Ucraina", flag: "🇺🇦" },
  { code: "VA", name: "Vaticano", flag: "🇻🇦" },
  { code: "XK", name: "Kosovo", flag: "🇽🇰" },
];

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));

/** Lookup case-insensitive per nome italiano. */
export function findCountryByName(name: string): Country | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** Restituisce la flag o "🌐" se il nome non è nel set curato (es. legacy
 *  free-text inserito da utenti pre-picker). */
export function flagFor(name: string): string {
  return findCountryByName(name)?.flag ?? "🌐";
}

/** Filtro per il picker: matcha l'inizio di ogni parola del nome o del codice.
 *  Es. "fra" → "Francia"; "rep ce" → "Repubblica Ceca". */
export function searchCountries(query: string, exclude: string[] = []): Country[] {
  const q = query.trim().toLowerCase();
  const excl = new Set(exclude.map((e) => e.toLowerCase()));
  if (!q) {
    return COUNTRIES.filter((c) => !excl.has(c.name.toLowerCase()));
  }
  return COUNTRIES.filter((c) => {
    if (excl.has(c.name.toLowerCase())) return false;
    const name = c.name.toLowerCase();
    const code = c.code.toLowerCase();
    if (name.startsWith(q) || code === q) return true;
    // word-start match: "rep ce" → "repubblica ceca"
    const words = name.split(/\s+/);
    return words.some((w) => w.startsWith(q));
  });
}
