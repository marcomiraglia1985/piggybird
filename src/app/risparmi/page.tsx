import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, formatDate } from "@/lib/utils";
import Link from "next/link";
import { PiggyBank, ArrowUpRight, TrendingUp, Plus, Info } from "lucide-react";
import { EditSavingsButton } from "@/components/risparmi/edit-savings-dialog";
import { SavingsCharts } from "@/components/risparmi/savings-charts";

export const dynamic = "force-dynamic";

export default async function RisparmiPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const sp = await searchParams;
  const PAGE_SIZE = 25;
  const limit = sp.limit ? Math.max(PAGE_SIZE, parseInt(sp.limit, 10)) : PAGE_SIZE;

  const accounts = await prisma.account.findMany({
    where: { type: "savings", active: true },
    orderBy: { displayOrder: "asc" },
  });
  const accountIds = accounts.map((a) => a.id);

  const totalSaldo = accounts.reduce((s, a) => s + a.currentBalance, 0);

  const totalCount = accountIds.length
    ? await prisma.transaction.count({ where: { accountId: { in: accountIds } } })
    : 0;

  const transactions = accountIds.length
    ? await prisma.transaction.findMany({
        where: { accountId: { in: accountIds } },
        orderBy: { date: "desc" },
        take: limit,
        include: { account: true, category: true },
      })
    : [];

  // Interessi: aggrego tx con cat "Interessi" per conto
  const interessiCat = await prisma.category.findFirst({
    where: { name: "Interessi", group: "income" },
  });
  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const last365 = new Date(now);
  last365.setDate(last365.getDate() - 365);

  const interessiByAccount: Record<
    string,
    { total: number; last30: number; last365: number; count: number; lastTx: { date: Date; amount: number } | null }
  > = {};
  if (interessiCat && accountIds.length > 0) {
    const allInteressi = await prisma.transaction.findMany({
      where: { accountId: { in: accountIds }, categoryId: interessiCat.id },
      orderBy: { date: "desc" },
    });
    for (const a of accounts) {
      interessiByAccount[a.id] = { total: 0, last30: 0, last365: 0, count: 0, lastTx: null };
    }
    for (const t of allInteressi) {
      const stats = interessiByAccount[t.accountId];
      if (!stats) continue;
      stats.total += t.amount;
      stats.count += 1;
      if (t.date.getTime() >= last30.getTime()) stats.last30 += t.amount;
      if (t.date.getTime() >= last365.getTime()) stats.last365 += t.amount;
      if (!stats.lastTx) stats.lastTx = { date: t.date, amount: t.amount };
    }
  }
  const interessiGrandTotal = Object.values(interessiByAccount).reduce(
    (s, x) => s + x.total,
    0,
  );
  const interessi30dGrand = Object.values(interessiByAccount).reduce(
    (s, x) => s + x.last30,
    0,
  );

  // Serie mensile saldo per ogni conto (ultimi 12 mesi).
  // Walk backward dal currentBalance: end-of-month[i] = end-of-month[i+1] - flow(i+1).
  const seriesByAccount: Record<string, { month: string; balance: number }[]> = {};
  if (accountIds.length > 0) {
    const allFlows = await prisma.transaction.findMany({
      where: { accountId: { in: accountIds } },
      select: { accountId: true, year: true, month: true, amount: true },
    });
    const flowMap = new Map<string, Map<string, number>>();
    for (const t of allFlows) {
      const key = `${t.year}-${String(t.month).padStart(2, "0")}`;
      if (!flowMap.has(t.accountId)) flowMap.set(t.accountId, new Map());
      const m = flowMap.get(t.accountId)!;
      m.set(key, (m.get(key) ?? 0) + t.amount);
    }
    const today = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    for (const a of accounts) {
      const flows = flowMap.get(a.id) ?? new Map<string, number>();
      const full: { month: string; balance: number }[] = new Array(12);
      let running = a.currentBalance;
      for (let i = 11; i >= 0; i--) {
        full[i] = { month: months[i], balance: running };
        running -= flows.get(months[i]) ?? 0;
      }
      // Tronca i mesi iniziali con saldo negativo: rappresentano un'epoca
      // in cui il conto non esisteva ancora (walk-backward attraversa i
      // depositi originali e finisce in negativo). Mantengo almeno un
      // punto a 0 prima del primo positivo per continuità visiva.
      const firstPositiveIdx = full.findIndex((p) => p.balance > 0);
      const trimmed =
        firstPositiveIdx <= 0
          ? full
          : [{ month: full[firstPositiveIdx - 1].month, balance: 0 }, ...full.slice(firstPositiveIdx)];
      seriesByAccount[a.id] = trimmed;
    }
  }

  // Group by month
  const byMonth = new Map<string, typeof transactions>();
  for (const t of transactions) {
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(t);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Risparmi</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Conti dedicati al risparmio — flussi e saldi.
          </p>
        </div>
        <Link
          href="/conti/nuovo?type=savings"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 transition-colors shrink-0"
        >
          <Plus className="size-4" />
          Nuovo conto
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Saldo totale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-amber-400">
              {formatEUR(totalSaldo)}
            </div>
            <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
              {accounts.length} cont{accounts.length === 1 ? "o" : "i"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1.5">
              <TrendingUp className="size-3 text-emerald-400" />
              Interessi maturati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-emerald-400">
              +{formatEUR(interessiGrandTotal)}
            </div>
            <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
              storico totale
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ultimi 30 giorni</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums text-emerald-400">
              +{formatEUR(interessi30dGrand)}
            </div>
            <div className="text-[11px] text-[var(--color-fg-subtle)] mt-1">
              ~{formatEUR((interessi30dGrand / 30) * 365)}/anno proiettato
            </div>
          </CardContent>
        </Card>
      </div>

      {accounts.length > 0 &&
        (!interessiCat ||
          accounts.some((a) => (interessiByAccount[a.id]?.count ?? 0) === 0)) && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs flex items-start gap-2">
            <Info className="size-4 mt-0.5 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <div className="font-medium text-amber-300">
                Come tracciare gli interessi
              </div>
              <div className="text-[var(--color-fg-muted)] leading-relaxed">
                Il primo movimento di interessi che importi (es. "Interest" da
                Revolut Savings) devi assegnarlo manualmente alla categoria{" "}
                <span className="font-medium">💰 Interessi</span> in{" "}
                <Link href="/movimenti" className="underline hover:text-amber-400">
                  /movimenti
                </Link>
                . Da lì in poi le tx con descrizione simile vengono riconosciute in
                automatico ad ogni nuovo import, e questa pagina si popola da sé.
                {!interessiCat && (
                  <>
                    {" "}
                    La categoria non esiste ancora: creala in{" "}
                    <Link
                      href="/categorie"
                      className="underline hover:text-amber-400"
                    >
                      /categorie
                    </Link>{" "}
                    sotto Entrate.
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      {accounts.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {accounts.map((a) => {
            const stats = interessiByAccount[a.id] ?? {
              total: 0,
              last30: 0,
              last365: 0,
              count: 0,
              lastTx: null,
            };
            // Yield % approssimato: (interessi 365g / saldo medio) — usiamo il saldo
            // attuale come proxy del saldo medio (semplificazione).
            const yieldPct =
              a.currentBalance > 0 && stats.last365 > 0
                ? (stats.last365 / a.currentBalance) * 100
                : null;
            const capitale = Math.max(0, a.currentBalance - stats.total);
            const series = seriesByAccount[a.id] ?? [];
            return (
              <Card key={a.id} className="p-0 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr] divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-border)]/60">
                  {/* Sezione sinistra: conto + saldo */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl shrink-0">
                        {a.emoji ?? "🐷"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium truncate">{a.name}</div>
                          <EditSavingsButton
                            account={{
                              id: a.id,
                              name: a.name,
                              emoji: a.emoji,
                              interestRateAnnual: a.interestRateAnnual,
                              notes: a.notes,
                            }}
                          />
                        </div>
                        <div className="text-xl font-semibold tabular-nums text-amber-400 mt-0.5">
                          {formatEUR(a.currentBalance)}
                        </div>
                        {a.interestRateAnnual != null && (
                          <div className="text-[10px] text-[var(--color-fg-subtle)] mt-1 inline-flex items-center gap-1">
                            <TrendingUp className="size-2.5 text-emerald-400/70" />
                            Tasso atteso {a.interestRateAnnual.toFixed(2)}%/anno
                          </div>
                        )}
                        {a.notes && (
                          <div className="text-[10px] text-[var(--color-fg-subtle)] mt-1 line-clamp-2">
                            {a.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Sezione destra: interessi */}
                  <div className="p-4 bg-emerald-500/[0.04] border-t sm:border-t-0">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="size-3.5 text-emerald-400" />
                      <span className="text-[11px] uppercase tracking-wider text-emerald-300/80 font-medium">
                        Interessi
                      </span>
                    </div>
                    {stats.count > 0 ? (
                      <div className="space-y-1.5">
                        <div className="text-lg font-semibold tabular-nums text-emerald-400">
                          +{formatEUR(stats.total)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="text-[var(--color-fg-subtle)]">30g</div>
                            <div className="tabular-nums text-emerald-300/90">
                              +{formatEUR(stats.last30)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[var(--color-fg-subtle)]">365g</div>
                            <div className="tabular-nums text-emerald-300/90">
                              +{formatEUR(stats.last365)}
                              {yieldPct != null && (
                                <span className="text-[10px] text-[var(--color-fg-subtle)] ml-1">
                                  ({yieldPct.toFixed(2)}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {stats.lastTx && (
                          <div className="text-[10px] text-[var(--color-fg-subtle)] pt-1 border-t border-[var(--color-border)]/40">
                            ultimo: +{formatEUR(stats.lastTx.amount)} il{" "}
                            {formatDate(stats.lastTx.date, {
                              day: "2-digit",
                              month: "short",
                              year: "2-digit",
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-[var(--color-fg-subtle)] py-1">
                        Nessun interesse maturato registrato.
                      </div>
                    )}
                  </div>
                  {/* Sezione destra: grafici */}
                  <SavingsCharts
                    accountId={a.id}
                    capitale={capitale}
                    interessi={stats.total}
                    series={series}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {accounts.length === 0 && (
        <Card>
          <CardContent>
            <div className="py-12 text-center space-y-3">
              <PiggyBank className="size-8 text-[var(--color-fg-subtle)] mx-auto" />
              <p className="text-sm text-[var(--color-fg-muted)]">
                Nessun conto risparmio attivo.
              </p>
              <Link
                href="/conti/nuovo"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20"
              >
                Aggiungi conto risparmio
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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
                  {monthOut < 0 && <span className="text-rose-400">{formatEUR(monthOut, { compact: true })}</span>}
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
                        {formatDate(t.date, { day: "numeric", month: "short" })} · {t.account.emoji ?? ""} {t.account.name}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-medium tabular-nums ${
                        t.amount > 0 ? "text-emerald-400" : "text-[var(--color-fg)]"
                      }`}
                    >
                      {t.amount > 0 ? "+" : ""}
                      {formatEUR(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {accounts.length > 0 && transactions.length === 0 && (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-[var(--color-fg-subtle)]">
                Nessun movimento registrato sui conti risparmio.
              </p>
            </CardContent>
          </Card>
        )}

        {totalCount > transactions.length && (
          <div className="text-center pt-2">
            <a
              href={`/risparmi?limit=${limit + PAGE_SIZE}`}
              className="text-xs text-amber-400 hover:underline"
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
              href="/risparmi"
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
