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
 *
 * Default: frozen=false (auto-live mode — saldi derivati dalle tx). Solo
 * "true" esplicito attiva il freeze globale, usato per riconciliare saldi
 * a bocce ferme dopo import storico massiccio (modello: Marco).
 *
 * Per il caso comune (utente edita un singolo saldo a mano), NON serve
 * congelare globalmente: si usa Account.balanceLastEditedAt come snapshot
 * per-account.
 */
export async function getFreezeState(): Promise<FreezeState> {
  const [f, fAt] = await Promise.all([
    prisma.setting.findUnique({ where: { key: FROZEN_KEY } }),
    prisma.setting.findUnique({ where: { key: FROZEN_AT_KEY } }),
  ]);
  // Default: frozen=false (auto-live). Solo "true" esplicito congela.
  const frozen = f?.value === "true";
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
 * Calcola il saldo "display" per ogni account. Logica 3-rami:
 *
 *   1. **Frozen globale ON** (Marco's reconcile mode): displayBalance =
 *      currentBalance per tutti i conti. Override forte per chi sta sistemando
 *      i saldi a bocce ferme dopo un import storico massiccio.
 *   2. **Unfrozen + balanceLastEditedAt set** (manual override per-account):
 *      l'utente ha cliccato "Edit saldo" → quel saldo è uno snapshot.
 *      displayBalance = currentBalance + sum(tx con confirmedAt > balanceLastEditedAt).
 *      Le tx storiche pre-edit NON si ri-sommano (no double-count).
 *   3. **Unfrozen + balanceLastEditedAt null** (auto-live, default nuovi conti):
 *      displayBalance = currentBalance + sum(all confirmed tx).
 *      Caso tipico: nuovo utente crea conto, importa CSV, vede subito il saldo
 *      derivato dalle tx senza toccare nulla.
 *
 * Eccezione friendsplit: ignora tutto, sempre sum di TUTTE le tx
 * (`/friendsplit` page è la source of truth).
 */
export async function getDisplayBalances<
  T extends {
    id: string;
    currentBalance: number;
    type: string;
    balanceLastEditedAt?: Date | null;
  },
>(accounts: T[]): Promise<(T & { displayBalance: number })[]> {
  if (accounts.length === 0) return [];
  const { frozen } = await getFreezeState();

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

  // Investment accounts: currentBalance è auto-recalcolato da
  // recalcInvestmentBalances() al sum(tx). Già authoritative, non sommarci
  // di nuovo. Helper:
  const isInvestmentAuto = (type: string) => type === "investment";

  // RAMO 1: frozen globale → snapshot statico
  if (frozen) {
    return accounts.map((a) => ({
      ...a,
      displayBalance:
        a.type === "friendsplit" ? fsBalance(a.id) : a.currentBalance,
    }));
  }

  // RAMI 2 + 3 — unfrozen. Pre-calcolo somme tx in due tagli:
  //   - totalSum: sum(all confirmed tx) per ramo 3 (auto-live)
  //   - perAnchorSum: sum(tx after balanceLastEditedAt) per ramo 2 (manual)
  // Una singola query coprirebbe entrambi se usiamo confirmedAt sempre, ma è
  // più chiaro avere due path separati.
  const nonFsIds = accounts
    .filter((a) => a.type !== "friendsplit")
    .map((a) => a.id);
  const totalSumMap = new Map<string, number>();
  if (nonFsIds.length > 0) {
    const sums = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: nonFsIds }, confirmed: true },
      _sum: { amount: true },
    });
    for (const r of sums) totalSumMap.set(r.accountId, r._sum.amount ?? 0);
  }

  // Per gli account con balanceLastEditedAt set: query separata con filtro
  // confirmedAt. Una query per account, OK perché il numero di account è
  // tipicamente <20.
  const perAnchorSumMap = new Map<string, number>();
  for (const a of accounts) {
    if (a.type === "friendsplit") continue;
    if (!a.balanceLastEditedAt) continue;
    const r = await prisma.transaction.aggregate({
      where: {
        accountId: a.id,
        confirmed: true,
        confirmedAt: { gt: a.balanceLastEditedAt },
      },
      _sum: { amount: true },
    });
    perAnchorSumMap.set(a.id, r._sum.amount ?? 0);
  }

  return accounts.map((a) => {
    if (a.type === "friendsplit") {
      return { ...a, displayBalance: fsBalance(a.id) };
    }
    if (isInvestmentAuto(a.type)) {
      // currentBalance è già la somma autoritativa delle tx (auto-recalc)
      return { ...a, displayBalance: a.currentBalance };
    }
    if (a.balanceLastEditedAt) {
      // Ramo 2: manual override per-account
      return {
        ...a,
        displayBalance: a.currentBalance + (perAnchorSumMap.get(a.id) ?? 0),
      };
    }
    // Ramo 3: auto-live (nuovo conto o reset to auto)
    return {
      ...a,
      displayBalance: a.currentBalance + (totalSumMap.get(a.id) ?? 0),
    };
  });
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
