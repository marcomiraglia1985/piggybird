import { prisma } from "@/lib/prisma";

const FROZEN_KEY = "accountsFrozen";
const FROZEN_AT_KEY = "accountsFrozenAt";

export type FreezeState = {
  /** true = saldi statici (currentBalance), false = saldi live derivati da tx */
  frozen: boolean;
  /** Quando è stato attivato l'ultimo freeze (snapshot point). */
  frozenAt: Date | null;
};

/**
 * Stato globale di "congelamento" dei saldi conto.
 * Default: frozen=true (legacy behavior — saldi statici, l'utente li imposta a mano).
 * Quando frozen=false, i saldi mostrati = currentBalance + tx confermate dopo frozenAt.
 */
export async function getFreezeState(): Promise<FreezeState> {
  const [f, fAt] = await Promise.all([
    prisma.setting.findUnique({ where: { key: FROZEN_KEY } }),
    prisma.setting.findUnique({ where: { key: FROZEN_AT_KEY } }),
  ]);
  // Default: frozen=true (sicuro). Solo "false" esplicito sblocca.
  const frozen = f?.value !== "false";
  let frozenAt: Date | null = null;
  if (fAt?.value) {
    const d = new Date(fAt.value);
    if (!isNaN(d.getTime())) frozenAt = d;
  }
  return { frozen, frozenAt };
}

export async function setFreezeState(frozen: boolean, frozenAt?: Date): Promise<void> {
  await prisma.setting.upsert({
    where: { key: FROZEN_KEY },
    create: { key: FROZEN_KEY, value: frozen ? "true" : "false" },
    update: { value: frozen ? "true" : "false" },
  });
  if (frozenAt) {
    await prisma.setting.upsert({
      where: { key: FROZEN_AT_KEY },
      create: { key: FROZEN_AT_KEY, value: frozenAt.toISOString() },
      update: { value: frozenAt.toISOString() },
    });
  }
}

/**
 * Calcola il saldo "display" per ogni account.
 * - Frozen → currentBalance così com'è (statico).
 * - Unfrozen → currentBalance + sum(tx confermate con date > frozenAt e ≤ now).
 *   Le tx future (>now) NON contribuiscono al saldo attuale.
 *
 * Eccezione friendsplit: ignora freeze + confirmed e usa sempre `sum(tx.amount)`
 * di tutte le tx del conto. /friendsplit page è la source of truth ed usa
 * questo calcolo. Manteniamo coerenza qui per evitare divergenze con /conti.
 * (Il POST /api/transactions/friendsplit non aggiorna currentBalance, quindi
 * è cronicamente stale.)
 */
export async function getDisplayBalances<
  T extends { id: string; currentBalance: number; type: string },
>(accounts: T[]): Promise<(T & { displayBalance: number })[]> {
  if (accounts.length === 0) return [];
  const { frozen, frozenAt } = await getFreezeState();

  // Friendsplit: sum di TUTTE le tx (ignora freeze, ignora confirmed)
  const fsIds = accounts.filter((a) => a.type === "friendsplit").map((a) => a.id);
  const fsSums = new Map<string, number>();
  if (fsIds.length > 0) {
    const rows = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: fsIds } },
      _sum: { amount: true },
    });
    for (const r of rows) fsSums.set(r.accountId, r._sum.amount ?? 0);
  }

  const fsBalance = (id: string) => fsSums.get(id) ?? 0;

  if (frozen || !frozenAt) {
    return accounts.map((a) => ({
      ...a,
      displayBalance:
        a.type === "friendsplit" ? fsBalance(a.id) : a.currentBalance,
    }));
  }

  const nonFsIds = accounts.filter((a) => a.type !== "friendsplit").map((a) => a.id);
  const sumMap = new Map<string, number>();
  if (nonFsIds.length > 0) {
    const sums = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: {
        accountId: { in: nonFsIds },
        confirmed: true,
        confirmedAt: { gt: frozenAt },
      },
      _sum: { amount: true },
    });
    for (const r of sums) sumMap.set(r.accountId, r._sum.amount ?? 0);
  }
  return accounts.map((a) => ({
    ...a,
    displayBalance:
      a.type === "friendsplit"
        ? fsBalance(a.id)
        : a.currentBalance + (sumMap.get(a.id) ?? 0),
  }));
}

/**
 * Snapshot tutti i saldi live dei conti attivi nei rispettivi currentBalance,
 * poi imposta frozen=true e frozenAt=now. Usato quando l'utente forza un saldo
 * o clicca "congela" dal toggle.
 */
export async function snapshotAndFreeze(now: Date = new Date()): Promise<void> {
  const accounts = await prisma.account.findMany({ where: { active: true } });
  const withDisplay = await getDisplayBalances(accounts);
  await prisma.$transaction([
    ...withDisplay.map((a) =>
      prisma.account.update({
        where: { id: a.id },
        data: { currentBalance: a.displayBalance },
      }),
    ),
  ]);
  await setFreezeState(true, now);
}
