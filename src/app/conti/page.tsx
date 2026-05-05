import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowUpRight, Plus, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, cn } from "@/lib/utils";
import { BalanceEditor } from "@/components/conti/balance-editor";
import { SortableAccountsGrid } from "@/components/conti/sortable-accounts-grid";
import { FreezeToggle } from "@/components/conti/freeze-toggle";
import { ClosedAccountActions } from "@/components/conti/closed-account-actions";
import { getFreezeState, getDisplayBalances } from "@/lib/account-freeze";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  liquid: "Liquidità",
  savings: "Risparmi",
  cash: "Contante",
  joint: "Cointestato",
  investment: "Investimenti",
  credit: "Crediti",
  friendsplit: "Friendsplit",
};

const TYPE_COLORS: Record<string, string> = {
  liquid: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
  savings: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
  cash: "from-zinc-500/20 to-zinc-500/5 border-zinc-500/20",
  joint: "from-pink-500/20 to-pink-500/5 border-pink-500/20",
  investment: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
  credit: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
};

function shareLabel(share: number): string | null {
  if (share >= 1) return null;
  if (Math.abs(share - 2 / 3) < 0.01) return "2/3";
  if (Math.abs(share - 1 / 2) < 0.01) return "1/2";
  if (Math.abs(share - 1 / 3) < 0.01) return "1/3";
  return `${(share * 100).toFixed(0)}%`;
}

export default async function ContiPage() {
  const allAccountsRaw = await prisma.account.findMany({
    orderBy: [{ active: "desc" }, { displayOrder: "asc" }],
  });
  // Conteggio tx per account: utile per visibilità (link a /movimenti
  // filtrato) e per abilitare la cancellazione hard solo per conti vuoti.
  const txCounts = await prisma.transaction.groupBy({
    by: ["accountId"],
    _count: { _all: true },
  });
  const txCountByAccount: Record<string, number> = {};
  for (const t of txCounts) txCountByAccount[t.accountId] = t._count._all;

  // Per i conti type=investment lo storico "vero" delle operazioni è in
  // CryptoTrade / StockTrade (legati per `platform`, non per accountId).
  // Sommiamo questi conteggi al txCount così la card mostra il totale dei
  // movimenti reali del broker.
  const [cryptoTradesByPlat, stockTradesByPlat] = await Promise.all([
    prisma.cryptoTrade.groupBy({ by: ["platform"], _count: { _all: true } }),
    prisma.stockTrade.groupBy({ by: ["platform"], _count: { _all: true } }),
  ]);
  const cryptoTradesByPlatMap = new Map(
    cryptoTradesByPlat.map((b) => [b.platform, b._count._all]),
  );
  const stockTradesByPlatMap = new Map(
    stockTradesByPlat.map((b) => [b.platform, b._count._all]),
  );
  const freezeState = await getFreezeState();
  // Inietta `displayBalance` su ogni account: in modalità Frozen è uguale al
  // currentBalance; in Live = currentBalance + tx confermate dopo frozenAt.
  const allAccounts = await getDisplayBalances(allAccountsRaw);

  // Investment table: aggregati cross-broker per /investimenti page. Su /conti
  // mostriamo i conti type=investment (le "posizioni broker") direttamente come
  // card. `investTotal` è la fonte autorevole degli investimenti (allineata col
  // KPI hero della dashboard) e va usata nella header summary; i singoli conti
  // investment usano la propria currentBalance per la card individuale.
  const investments = await prisma.investment.findMany();
  const investTotal = investments.reduce((s, i) => s + i.currentValue, 0);

  // Provider con credential API configurata (per badge "API attiva" sulle card).
  const apiCreds = await prisma.apiCredential.findMany({ select: { provider: true } });
  const apiActiveProviders = new Set(apiCreds.map((c) => c.provider));

  // Routing investment universale: provider-first (stabile vs rename Account),
  // poi fallback name-match per provider="generic" (Revolut Trading, Fineco,
  // broker custom). Niente hard-code di nomi specifici nel routing.
  function findInvestmentForAccount(account: {
    name: string;
    provider: string;
  }): (typeof investments)[number] | null {
    // Provider-based match: stabile anche se l'utente rinomina l'Account
    if (account.provider === "binance") {
      return (
        investments.find(
          (i) => i.type === "crypto" && i.platform.toLowerCase().includes("binance"),
        ) ?? null
      );
    }
    if (account.provider === "revolut-x") {
      return (
        investments.find((i) => i.type === "crypto" && /revolut.*x/i.test(i.platform)) ??
        null
      );
    }
    // Generic provider: match per nome (Account.name = Investment.name di default)
    return (
      investments.find(
        (i) =>
          i.name === account.name ||
          i.platform.toLowerCase() === account.name.toLowerCase(),
      ) ?? null
    );
  }

  // Subtype dell'Account investment (stocks/crypto/metals/etf).
  function inferInvestmentSubtype(account: { name: string; provider: string }): string | null {
    if (account.provider === "binance" || account.provider === "revolut-x") return "crypto";
    return findInvestmentForAccount(account)?.type ?? null;
  }

  // Conteggio trade per account investment (BUY/SELL stockTrade + cryptoTrade).
  // I Transaction records sui conti investment sono solo deposit/withdraw
  // verso il broker, non vengono contati come "movimenti del broker".
  function combinedTxCount(account: { id: string; name: string; type: string; provider: string }): number {
    if (account.type !== "investment") return txCountByAccount[account.id] ?? 0;
    const inv = findInvestmentForAccount(account);
    if (!inv) return 0;
    const cryptoCount = cryptoTradesByPlatMap.get(inv.platform) ?? 0;
    const stockCount = stockTradesByPlatMap.get(inv.platform) ?? 0;
    return cryptoCount + stockCount;
  }

  // Link "movimenti →" per conti investment. Routing per inv.type → URL
  // dedicato. Disambiguazione crypto: Binance vs Revolut-X via provider.
  function investmentDetailHref(account: {
    name: string;
    type: string;
    provider: string;
  }): string | null {
    if (account.type !== "investment") return null;
    const inv = findInvestmentForAccount(account);
    if (!inv) return null;
    if (inv.type === "crypto") {
      return account.provider === "revolut-x"
        ? "/investimenti/crypto-revolut"
        : "/investimenti/crypto";
    }
    if (inv.type === "stocks") return "/investimenti/stocks";
    return null;
  }

  const active = allAccounts
    .filter((a) => a.active)
    .map((a) => ({
      ...a,
      investmentSubtype:
        a.type === "investment" ? inferInvestmentSubtype(a) : null,
      apiActive: apiActiveProviders.has(a.provider),
    }));
  const closed = allAccounts.filter((a) => !a.active);

  const grouped = active.reduce<Record<string, typeof active>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {});

  const effective = (a: { displayBalance: number; ownershipShare: number }) =>
    a.displayBalance * a.ownershipShare;
  const totalsByType = Object.fromEntries(
    Object.entries(grouped).map(([type, accs]) => [type, accs.reduce((s, a) => s + effective(a), 0)]),
  );
  // grandTotal escluse friendsplit (separate) e investment (usiamo investTotal
  // dalla Investment table — single source of truth NW-aligned). Le card
  // investimento sono visibili ma il loro currentBalance NON entra nel totale
  // header per evitare double-count con investTotal.
  const grandTotal = active
    .filter((a) => a.type !== "friendsplit" && a.type !== "investment")
    .reduce((s, a) => s + effective(a), 0);
  const friendsplitTotal = (grouped.friendsplit ?? []).reduce((s, a) => s + a.displayBalance, 0);

  const isEmpty = active.length === 0 && closed.length === 0 && investments.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="size-16 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
          <Wallet className="size-7 text-[var(--fg-muted)]" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Nessun conto ancora</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Aggiungi il tuo primo conto per iniziare a tracciare i movimenti.
            Potrai sempre importare lo storico via CSV o Excel.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/conti/nuovo"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" /> Crea primo conto
          </Link>
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--surface)] transition-colors"
          >
            Importa da CSV/Excel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conti</h1>
          <p className="text-sm text-[var(--fg-muted)] mt-0.5">
            {active.length} conti attivi · Totale{" "}
            <span className="font-medium text-[var(--fg)]">{formatEUR(grandTotal + investTotal)}</span>
          </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--fg-subtle)]">
          <span>
            Liquidità + Cointestato + Contante:{" "}
            <span className="font-medium text-[var(--fg-muted)] tabular-nums">
              {formatEUR(
                (totalsByType.liquid ?? 0) + (totalsByType.joint ?? 0) + (totalsByType.cash ?? 0),
              )}
            </span>
          </span>
          <span>
            Risparmi:{" "}
            <span className="font-medium text-amber-400 tabular-nums">
              {formatEUR(totalsByType.savings ?? 0)}
            </span>
          </span>
          <span>
            Investimenti:{" "}
            <span className="font-medium text-violet-400 tabular-nums">{formatEUR(investTotal)}</span>
          </span>
          {friendsplitTotal !== 0 && (
            <span>
              Friendsplit:{" "}
              <span
                className={cn(
                  "font-medium tabular-nums",
                  friendsplitTotal > 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {friendsplitTotal > 0 ? "+" : ""}{formatEUR(friendsplitTotal)}
              </span>
            </span>
          )}
        </div>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <FreezeToggle
            initialFrozen={freezeState.frozen}
            initialFrozenAt={freezeState.frozenAt?.toISOString() ?? null}
          />
          <Link
            href="/conti/nuovo"
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
          >
            <Plus className="size-4" />
            Nuovo conto
          </Link>
        </div>
      </header>

      {(() => {
        // Liquidità unificata: liquid + joint + cash sotto un'unica sezione
        const liquidityTypes = ["liquid", "joint", "cash"];
        const liquiditySections: Array<[string, typeof active]> = [
          [
            "liquid",
            liquidityTypes.flatMap((t) => grouped[t] ?? []),
          ],
        ];
        const otherSections = Object.entries(grouped).filter(
          ([type]) => type !== "friendsplit" && !liquidityTypes.includes(type),
        );
        const sections = [...liquiditySections, ...otherSections];
        return sections.map(([type, accs]) => {
          // Per "investment" usiamo investTotal (Investment table = single
          // source of truth NW-aligned) anche se i singoli conti possono
          // avere currentBalance leggermente disallineati.
          const total =
            type === "liquid"
              ? liquidityTypes.reduce((s, t) => s + (totalsByType[t] ?? 0), 0)
              : type === "investment"
                ? investTotal
                : (totalsByType[type] ?? 0);
          return (
            <section key={type}>
              <div className="flex items-baseline justify-between mb-3 px-1">
                <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
                  {TYPE_LABEL[type] ?? type}
                </h2>
                <span className="text-sm tabular-nums text-[var(--fg-muted)]">
                  {formatEUR(total)}
                </span>
              </div>
              <SortableAccountsGrid
                initial={accs.map((a) => ({
                  ...a,
                  txCount: combinedTxCount(a),
                  tradesHref: investmentDetailHref(a),
                }))}
                locked={!freezeState.frozen}
              />
            </section>
          );
        });
      })()}

      {/* Friendsplit — card cliccabili con dare/avere */}
      {grouped.friendsplit && grouped.friendsplit.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
              Friendsplit (dare/avere)
            </h2>
            <span className="text-sm tabular-nums text-[var(--fg-muted)]">
              {formatEUR(totalsByType.friendsplit ?? 0)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {grouped.friendsplit.map((a) => {
              const positive = a.displayBalance > 0;
              const settled = Math.abs(a.displayBalance) < 0.01;
              return (
                <Link
                  key={a.id}
                  href="/friendsplit"
                  className={`block group relative overflow-hidden rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${
                    positive
                      ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-[var(--surface)] to-emerald-500/5 hover:border-emerald-500/50"
                      : settled
                        ? "border-[var(--border)] bg-[var(--surface)]"
                        : "border-rose-500/30 bg-gradient-to-br from-rose-500/15 via-[var(--surface)] to-rose-500/5 hover:border-rose-500/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
                      {a.emoji ?? "🤝"}
                    </div>
                    <ArrowUpRight className="size-4 text-[var(--fg-muted)] group-hover:text-[var(--fg)] transition-colors" />
                  </div>
                  <div className="text-sm text-[var(--fg-muted)]">{a.name.replace("Friendsplit ", "")}</div>
                  <div
                    className={`text-2xl font-semibold tabular-nums mt-1 ${
                      positive ? "text-emerald-400" : settled ? "" : "text-rose-400"
                    }`}
                  >
                    {positive ? "+" : ""}{formatEUR(a.displayBalance)}
                  </div>
                  <div className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
                    {settled ? "in pari" : positive ? "sei a credito" : "sei a debito"}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section className="opacity-60">
          <div className="flex items-baseline justify-between mb-3 px-1">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
              Chiusi / Migrati
            </h2>
            <span className="text-xs text-[var(--fg-subtle)]">
              Solo per movimenti storici
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {closed.map((a) => {
              const txN = txCountByAccount[a.id] ?? 0;
              return (
                <div
                  key={a.id}
                  className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
                      {a.emoji ?? "💳"}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)]">
                      Chiuso
                    </span>
                  </div>
                  <div className="text-sm text-[var(--fg-muted)] truncate mb-1">{a.name}</div>
                  <Link
                    href={`/movimenti?account=${a.id}`}
                    className="text-[11px] text-violet-400 hover:underline mb-3 inline-block"
                  >
                    {txN} {txN === 1 ? "movimento" : "movimenti"} →
                  </Link>
                  <div className="flex items-center justify-end">
                    <ClosedAccountActions
                      accountId={a.id}
                      accountName={a.name}
                      txCount={txN}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
