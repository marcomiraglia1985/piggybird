import { prisma } from "@/lib/prisma";

/** Soglia "stale" — sopra questa, suggeriamo all'utente di ricaricare il CSV. */
export const STALE_CSV_DAYS = 14;

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
  const threshold = new Date(Date.now() - STALE_CSV_DAYS * 24 * 60 * 60 * 1000);
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
