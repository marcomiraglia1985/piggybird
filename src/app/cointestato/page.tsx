import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, formatDate } from "@/lib/utils";
import { CointestatoEditButton } from "@/components/cointestato/edit-cointestato";
import { getDisplayBalances } from "@/lib/account-freeze";

export const dynamic = "force-dynamic";

export default async function CointestatoPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const sp = await searchParams;
  const PAGE_SIZE = 25;
  const limit = sp.limit ? Math.max(PAGE_SIZE, parseInt(sp.limit, 10)) : PAGE_SIZE;

  const totalCount = await prisma.transaction.count({ where: { isJoint: true } });
  const transactions = await prisma.transaction.findMany({
    where: { isJoint: true },
    orderBy: { date: "desc" },
    take: limit,
    include: { account: true, category: true },
  });

  const accountRaw = await prisma.account.findFirst({
    where: { type: "joint", active: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  // displayBalance = currentBalance + tx confermate dopo frozenAt (Live mode),
  // così la card "Saldo" si allinea a /conti.
  const [account] = accountRaw ? await getDisplayBalances([accountRaw]) : [null];

  // Totali calcolati su TUTTE le tx (count via aggregate, non solo le visibili)
  const allAggregates = await prisma.transaction.aggregate({
    where: { isJoint: true, amount: { gt: 0 } },
    _sum: { amount: true },
  });
  const allOutAgg = await prisma.transaction.aggregate({
    where: { isJoint: true, amount: { lt: 0 } },
    _sum: { amount: true },
  });
  const totalIn = allAggregates._sum.amount ?? 0;
  const totalOut = allOutAgg._sum.amount ?? 0;

  // Group by month
  const byMonth = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(t);
  }

  const sharePct = account
    ? Math.round(account.ownershipShare * 1000) / 10
    : null;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {account?.name ?? "Cointestato"}
            </h1>
            {account && (
              <CointestatoEditButton
                account={{
                  id: account.id,
                  name: account.name,
                  ownershipShare: account.ownershipShare,
                }}
              />
            )}
          </div>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Spese dal conto condiviso
          </p>
        </div>
        <Link
          href="/conti/nuovo?type=joint"
          className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
        >
          <Plus className="size-4" />
          Nuovo cointestato
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Saldo</span>
              {sharePct != null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium normal-case tracking-normal">
                  Quota {sharePct}%
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {formatEUR(account?.displayBalance ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Entrate totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-emerald-400">
              +{formatEUR(totalIn)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Uscite totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-rose-400">
              {formatEUR(totalOut)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {[...byMonth.entries()].map(([key, txs]) => {
          const [y, m] = key.split("-");
          const date = new Date(parseInt(y), parseInt(m) - 1, 1);
          const monthIn = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
          const monthOut = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-medium capitalize text-[var(--color-fg-muted)]">
                  {date.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                </h3>
                <div className="flex gap-3 text-xs tabular-nums">
                  {monthIn > 0 && <span className="text-emerald-400">+{formatEUR(monthIn, { compact: true })}</span>}
                  <span className="text-rose-400">{formatEUR(monthOut, { compact: true })}</span>
                </div>
              </div>
              <div className="surface divide-y divide-[var(--color-border)]/60">
                {txs.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="size-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-base shrink-0">
                      {t.category?.emoji ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.beneficiary || t.notes || t.category?.name || "—"}</div>
                      <div className="text-[11px] text-[var(--color-fg-subtle)]">
                        {formatDate(t.date, { day: "numeric", month: "short" })}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 justify-end shrink-0">
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          t.amount > 0 ? "text-emerald-400" : "text-[var(--color-fg)]"
                        }`}
                      >
                        {t.amount > 0 ? "+" : ""}{formatEUR(t.amount)}
                      </span>
                      {/* Solo entrate hanno questo slot 24px → effetto "libro
                          contabile": entrate spostate a sx, uscite flush a dx. */}
                      {t.amount > 0 && (
                        <span className="size-6 inline-block" aria-hidden />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {transactions.length === 0 && (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-[var(--color-fg-subtle)]">
                Nessun movimento cointestato registrato.
              </p>
            </CardContent>
          </Card>
        )}

        {totalCount > transactions.length && (
          <div className="text-center pt-2">
            <a
              href={`/cointestato?limit=${limit + PAGE_SIZE}`}
              className="text-xs text-violet-400 hover:underline"
            >
              Mostra altri {Math.min(PAGE_SIZE, totalCount - transactions.length)} movimenti
            </a>
            <div className="text-[10px] text-[var(--color-fg-subtle)] mt-1">
              {transactions.length} di {totalCount} visualizzati
            </div>
          </div>
        )}
        {limit > PAGE_SIZE && (
          <div className="text-center">
            <a
              href="/cointestato"
              className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              Torna ai {PAGE_SIZE} più recenti
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
