import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { TransactionsTable } from "@/components/movimenti/transactions-table";
import { RecurrenceAlertBanner } from "@/components/movimenti/recurrence-alert-banner";
import { AutoCategorizeButton } from "@/components/movimenti/auto-categorize-button";
import { Repeat, ArrowUpRight, Receipt, Upload, Plus, Brush } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MovimentiPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    account?: string;
    cat?: string;
    q?: string;
    limit?: string;
    assignTo?: string;
  }>;
}) {
  const sp = await searchParams;
  const year = sp.year ? parseInt(sp.year, 10) : undefined;
  const accountId = sp.account;
  const categoryId = sp.cat;
  const q = sp.q?.trim();
  const assignToEstateId = sp.assignTo;
  const PAGE_SIZE = 200;
  const limit = sp.limit ? Math.max(PAGE_SIZE, parseInt(sp.limit, 10)) : PAGE_SIZE;

  const where: Parameters<typeof prisma.transaction.findMany>[0] = {};
  // /movimenti mostra TUTTE le tx di tutti i conti. Quelle non-personali
  // (cointestato, investimenti, friendsplit, credit) sono evidenziate da un
  // badge inline accanto al nome conto.
  where.where = {};
  if (year) where.where.year = year;
  if (accountId) where.where.accountId = accountId;
  if (categoryId) where.where.categoryId = categoryId;
  if (q) {
    where.where.OR = [
      { beneficiary: { contains: q } },
      { notes: { contains: q } },
    ];
  }

  const totalCount = await prisma.transaction.count({ where: where.where });

  // Empty state: nessuna tx in tutto il DB e nessun filtro attivo. Se ci sono
  // filtri ma 0 match, lascia che la TransactionsTable mostri il suo "no
  // results" (con i filtri attuali da rimuovere).
  const hasFilters = !!(year || accountId || categoryId || q);
  if (!hasFilters && totalCount === 0) {
    const accountCount = await prisma.account.count();
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="size-16 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
          <Receipt className="size-7 text-[var(--fg-muted)]" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Nessun movimento ancora</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {accountCount === 0
              ? "Prima crea un conto, poi importa lo storico o aggiungi i movimenti uno per uno."
              : "Importa lo storico via CSV/Excel, oppure aggiungi un movimento a mano."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {accountCount === 0 ? (
            <Link
              href="/conti/nuovo"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="size-4" /> Crea primo conto
            </Link>
          ) : (
            <>
              <Link
                href="/import"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Upload className="size-4" /> Importa CSV/Excel
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const [transactions, accounts, categories, years, estates] = await Promise.all([
    prisma.transaction.findMany({
      ...where,
      orderBy: { date: "desc" },
      take: limit,
      // Includiamo anche l'estate della category (per mostrare "🏠 Affitto · Paris"
      // sulle tx categorizzate come estate-linked anche se non hanno tx.estateId).
      include: { account: true, category: { include: { estate: true } }, estate: true },
    }),
    prisma.account.findMany({ where: { active: true }, orderBy: { displayOrder: "asc" } }),
    // Tutte le categorie (anche archiviate). Le archiviate vanno in fondo
    // ai dropdown nella sezione "Obsolete" — restano filtrabili/selezionabili
    // per movimenti storici.
    prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.transaction.findMany({
      where: { isJoint: false },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    prisma.realEstate.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, emoji: true },
    }),
  ]);

  // Carica le controparti dei transfer (per mostrare "Conto A → Conto B")
  const transferGroupIds = transactions
    .map((t) => t.transferGroupId)
    .filter((id): id is string => !!id);
  const counterparts =
    transferGroupIds.length > 0
      ? await prisma.transaction.findMany({
          where: { transferGroupId: { in: transferGroupIds } },
          include: { account: true },
        })
      : [];
  const counterpartByGroup = new Map<string, { id: string; account: { name: string; emoji: string | null } }[]>();
  for (const c of counterparts) {
    if (!c.transferGroupId) continue;
    const arr = counterpartByGroup.get(c.transferGroupId) ?? [];
    arr.push({ id: c.id, account: c.account });
    counterpartByGroup.set(c.transferGroupId, arr);
  }
  const transferCounterpart = new Map<string, { name: string; emoji: string | null }>();
  for (const t of transactions) {
    if (!t.transferGroupId) continue;
    const group = counterpartByGroup.get(t.transferGroupId) ?? [];
    const other = group.find((g) => g.id !== t.id);
    if (other) transferCounterpart.set(t.id, other.account);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimenti</h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            Tutte le tue transazioni, filtrabili e ricercabili.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AutoCategorizeButton categories={categories} estates={estates} />
          <Link
            href="/movimenti/beneficiari"
            title="Pulisci varianti beneficiari (consolida nomi simili)"
            className="group inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border border-violet-500/30 text-xs font-medium text-violet-300 hover:from-violet-500/[0.18] hover:to-indigo-500/[0.10] hover:border-violet-500/50 hover:text-violet-200 transition-colors"
          >
            <span className="size-5 inline-flex items-center justify-center rounded-md bg-violet-500/20 border border-violet-500/30">
              <Brush className="size-3" />
            </span>
            Pulisci beneficiari
            <ArrowUpRight className="size-3.5 text-violet-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
          <a
            href="/movimenti/ricorrenze"
            className="group inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border border-violet-500/30 text-xs font-medium text-violet-300 hover:from-violet-500/[0.18] hover:to-indigo-500/[0.10] hover:border-violet-500/50 hover:text-violet-200 transition-colors"
          >
            <span className="size-5 inline-flex items-center justify-center rounded-md bg-violet-500/20 border border-violet-500/30">
              <Repeat className="size-3" />
            </span>
            Ricorrenze
            <ArrowUpRight className="size-3.5 text-violet-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        </div>
      </header>
      <RecurrenceAlertBanner />
      <TransactionsTable
        transactions={transactions.map((t) => ({
          ...t,
          transferCounterpart: transferCounterpart.get(t.id) ?? null,
        }))}
        accounts={accounts}
        categories={categories}
        estates={estates}
        years={years.map((y) => y.year)}
        filters={{ year, accountId, categoryId, q }}
        totalCount={totalCount}
        currentLimit={limit}
        pageSize={PAGE_SIZE}
        assignToEstateId={assignToEstateId}
      />
    </div>
  );
}
