/**
 * Lista master delle borse mondiali. Usata dai widget Borse mondiali
 * (orologi) e Pianeta vivo (mappa giorno/notte).
 *
 * `sessions`: array di finestre apertura locale (gestisce pause pranzo
 *   tipo Tokyo/HKEX/SSE — multiple sessions per dare lo stato corretto).
 * `labelPosition`: usato solo dalla mappa per posizionare il nome sopra
 *   o sotto il marker (default: below).
 *
 * Setting condiviso: useWidgetSettings("market-favorites") con
 * `{ exchanges: string[] }` (lista degli id). Modificandolo da un widget
 * si aggiorna anche l'altro in real-time (custom event).
 */

export type ExchangeSession = { open: string; close: string };

export type Exchange = {
  id: string;
  city: string;
  label: string;
  flag: string;
  lat: number;
  lng: number;
  timezone: string;
  sessions: ExchangeSession[];
  labelPosition?: "above" | "below";
};

export const ALL_EXCHANGES: Exchange[] = [
  {
    id: "nyse",
    city: "New York",
    label: "NYSE",
    flag: "🇺🇸",
    lat: 40.71,
    lng: -74.0,
    timezone: "America/New_York",
    sessions: [{ open: "09:30", close: "16:00" }],
  },
  {
    id: "tsx",
    city: "Toronto",
    label: "TSX",
    flag: "🇨🇦",
    lat: 43.65,
    lng: -79.38,
    timezone: "America/Toronto",
    sessions: [{ open: "09:30", close: "16:00" }],
  },
  {
    id: "lse",
    city: "London",
    label: "LSE",
    flag: "🇬🇧",
    lat: 51.51,
    lng: -0.13,
    timezone: "Europe/London",
    sessions: [{ open: "08:00", close: "16:30" }],
    labelPosition: "above",
  },
  {
    id: "xetra",
    city: "Frankfurt",
    label: "XETRA",
    flag: "🇩🇪",
    lat: 50.11,
    lng: 8.68,
    timezone: "Europe/Berlin",
    sessions: [{ open: "09:00", close: "17:30" }],
  },
  {
    id: "euronext",
    city: "Paris",
    label: "Euronext",
    flag: "🇫🇷",
    lat: 48.86,
    lng: 2.35,
    timezone: "Europe/Paris",
    sessions: [{ open: "09:00", close: "17:30" }],
  },
  {
    id: "mib",
    city: "Milano",
    label: "MIB",
    flag: "🇮🇹",
    lat: 45.46,
    lng: 9.19,
    timezone: "Europe/Rome",
    sessions: [{ open: "09:00", close: "17:30" }],
  },
  {
    id: "six",
    city: "Zurigo",
    label: "SIX",
    flag: "🇨🇭",
    lat: 47.37,
    lng: 8.54,
    timezone: "Europe/Zurich",
    sessions: [{ open: "09:00", close: "17:30" }],
  },
  {
    id: "bse",
    city: "Mumbai",
    label: "BSE/NSE",
    flag: "🇮🇳",
    lat: 19.08,
    lng: 72.88,
    timezone: "Asia/Kolkata",
    sessions: [{ open: "09:15", close: "15:30" }],
  },
  {
    id: "sse",
    city: "Shanghai",
    label: "SSE",
    flag: "🇨🇳",
    lat: 31.23,
    lng: 121.47,
    timezone: "Asia/Shanghai",
    sessions: [
      { open: "09:30", close: "11:30" },
      { open: "13:00", close: "15:00" },
    ],
  },
  {
    id: "hkex",
    city: "Hong Kong",
    label: "HKEX",
    flag: "🇭🇰",
    lat: 22.32,
    lng: 114.17,
    timezone: "Asia/Hong_Kong",
    sessions: [
      { open: "09:30", close: "12:00" },
      { open: "13:00", close: "16:00" },
    ],
  },
  {
    id: "tse",
    city: "Tokyo",
    label: "TSE",
    flag: "🇯🇵",
    lat: 35.69,
    lng: 139.69,
    timezone: "Asia/Tokyo",
    // Aggiornamento 5 nov 2024: chiusura estesa da 15:00 a 15:30
    sessions: [
      { open: "09:00", close: "11:30" },
      { open: "12:30", close: "15:30" },
    ],
  },
  {
    id: "asx",
    city: "Sydney",
    label: "ASX",
    flag: "🇦🇺",
    lat: -33.87,
    lng: 151.21,
    timezone: "Australia/Sydney",
    sessions: [{ open: "10:00", close: "16:00" }],
  },
];

/**
 * Default favorites: top 6 globali per copertura timezone (USA → Europe → Asia → Pacific).
 * Niente MIB nel default (utente italiano la aggiungerà manualmente).
 */
export const DEFAULT_FAVORITE_EXCHANGES = [
  "nyse",
  "lse",
  "xetra",
  "tse",
  "hkex",
  "asx",
];

/**
 * Helper: valuta se un mercato è aperto NOW basandosi su sessions multiple
 * (gestisce pause pranzo).
 */
export function isMarketOpen(now: Date, ex: Exchange): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ex.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hour =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") return false;
  const nowMin = hour * 60 + minute;
  return ex.sessions.some(({ open, close }) => {
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    return nowMin >= oh * 60 + om && nowMin < ch * 60 + cm;
  });
}

export function getLocalTime(timezone: string, now: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hour =
    parseInt(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { hour, minute, weekday };
}

export function isWeekend(weekday: string) {
  return weekday === "Sat" || weekday === "Sun";
}
