import { prisma } from "./prisma";

/** Per i conti il cui `currentBalance` riflette le tx (oggi: type="investment"),
 *  ricalcola il saldo dalla somma delle transazioni. Negli altri tipi il saldo
 *  è gestito manualmente dall'utente. */
export async function recalcInvestmentBalances(accountIds: string[]) {
  if (accountIds.length === 0) return;
  const accts = await prisma.account.findMany({
    where: { id: { in: accountIds }, type: "investment" },
    select: { id: true },
  });
  for (const a of accts) {
    const sum = await prisma.transaction.aggregate({
      where: { accountId: a.id },
      _sum: { amount: true },
    });
    await prisma.account.update({
      where: { id: a.id },
      data: { currentBalance: sum._sum.amount ?? 0 },
    });
  }
}
