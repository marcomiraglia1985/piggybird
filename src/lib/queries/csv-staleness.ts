import { prisma } from "@/lib/prisma";

/** Soglia "stale" di default — sopra questa, suggeriamo all'utente di
 *  ricaricare il CSV. Override-abile via Setting `csv.staleDays` (utile per
 *  utenti che importano mensile o quarterly invece che settimanale). */
export const STALE_CSV_DAYS_DEFAULT = 14;
export const STALE_CSV_DAYS = STALE_CSV_DAYS_DEFAULT; // re-export per back-compat consumers

async function resolveStaleDays(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { key: "csv.staleDays" } });
  if (!s?.value) return STALE_CSV_DAYS_DEFAULT;
  const n = parseInt(s.value, 10);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : STALE_CSV_DAYS_DEFAULT;
}

export type StaleAccount = {
  id: string;
  name: string;
  emoji: string | null;
  lastCsvImportAt: string;
  daysSince: number;
};

/**
 * Ritorna i conti che hanno avuto almeno un import CSV ma che non vedono un
 * nuovo CSV da `STALE_CSV_DAYS` giorni. Conti API-only (Binance, ecc.) o
 * appena creati non rientrano: `lastCsvImportAt` resta null finché un CSV
 * passa per il commit.
 */
export async function getStaleCsvAccounts(): Promise<StaleAccount[]> {
  const days = await resolveStaleDays();
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const accounts = await prisma.account.findMany({
    where: {
      active: true,
      closedAt: null,
      lastCsvImportAt: { not: null, lt: threshold },
    },
    select: {
      id: true,
      name: true,
      emoji: true,
      lastCsvImportAt: true,
    },
    orderBy: { lastCsvImportAt: "asc" },
  });
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    lastCsvImportAt: a.lastCsvImportAt!.toISOString(),
    daysSince: Math.floor(
      (Date.now() - a.lastCsvImportAt!.getTime()) / (24 * 60 * 60 * 1000),
    ),
  }));
}
