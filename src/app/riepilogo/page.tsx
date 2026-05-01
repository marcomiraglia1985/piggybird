import { prisma } from "@/lib/prisma";
import { formatEUR, cn } from "@/lib/utils";
import Link from "next/link";
import { CompareYearSelect } from "@/components/riepilogo/compare-year-select";
import { YearTabs } from "@/components/riepilogo/year-tabs";
import { MatrixTable, type GroupRow } from "@/components/riepilogo/matrix-table";

export const dynamic = "force-dynamic";

type View = "personale" | "cointestato" | "combinato";

export default async function RiepilogoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; view?: View; all?: string; cmp?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? parseInt(sp.year, 10) : now.getFullYear();
  const compareYear = sp.cmp ? parseInt(sp.cmp, 10) : year - 1;
  const view: View = sp.view === "personale" || sp.view === "cointestato" ? sp.view : "combinato";
  const showAll = sp.all === "1";

  // Filtro isJoint per la view
  const jointFilter =
    view === "personale" ? { isJoint: false }
    : view === "cointestato" ? { isJoint: true }
    : {};

  // Escludo le tx sull'account "tecnico" Investimenti: sono il lato IN del
  // transfer pair degli acquisti investimento. Il lato OUT (sul conto bancario)
  // resta visibile nel gruppo "investments" e rappresenta i soldi messi via.
  const investmentAccount = await prisma.account.findUnique({
    where: { name: "Investimenti" },
  });
  const accountFilter = investmentAccount
    ? { accountId: { not: investmentAccount.id } }
    : {};

  const [transactions, prevYearTxs, categories, allYears, estates] = await Promise.all([
    prisma.transaction.findMany({
      where: { year, ...jointFilter, ...accountFilter },
      include: { category: true },
    }),
    prisma.transaction.findMany({
      where: { year: compareYear, ...jointFilter, ...accountFilter },
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.transaction.findMany({
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

  // Mappa cat.id → cat.estateId (per auto-link via categoria)
  const catEstateMap = new Map<string, string | null>();
  for (const c of categories) catEstateMap.set(c.id, c.estateId ?? null);

  // "Effective estateId" per una tx: esplicito su tx.estateId vince,
  // altrimenti eredita da category.estateId.
  function effectiveEstateId(t: { estateId: string | null; categoryId: string | null }): string | null {
    if (t.estateId) return t.estateId;
    if (t.categoryId) return catEstateMap.get(t.categoryId) ?? null;
    return null;
  }

  // Helper: una tx è "realizzata" (impatta il saldo reale) se è confermata
  // E la sua data è già passata. Le altre (future date o unconfirmed) sono
  // "previste" — mostrate ma escluse dal netto reale.
  const nowMs = now.getTime();
  const isRealized = (t: { confirmed: boolean; date: Date }) =>
    t.confirmed && t.date.getTime() <= nowMs;

  // Build TRE matrici: rows = category, cols = months 1..12.
  //   - `matrix` (DISPLAY total): include TUTTE le tx (realizzate + previste).
  //   - `matrixFuture` (DISPLAY future-only per cell): solo previste, usata dal
  //     client per applicare opacity/italic alla cella se è solo previsioni.
  //   - `matrixForNetto` (CALCOLO netto reale): solo realizzate, escluse anche
  //     le estate-linked (già contate via estateMonthly) per non doppiare.
  const matrix = new Map<string, number[]>();
  const matrixFuture = new Map<string, number[]>();
  const matrixForNetto = new Map<string, number[]>();
  for (const c of categories) {
    matrix.set(c.id, new Array(12).fill(0));
    matrixFuture.set(c.id, new Array(12).fill(0));
    matrixForNetto.set(c.id, new Array(12).fill(0));
  }
  for (const t of transactions) {
    if (!t.categoryId) continue;
    const arr = matrix.get(t.categoryId);
    if (arr) arr[t.month - 1] += t.amount;
    if (!isRealized(t)) {
      const arrF = matrixFuture.get(t.categoryId);
      if (arrF) arrF[t.month - 1] += t.amount;
    }
    // Per il netto, escludo le tx estate-linked (già in estateMatrix) e le
    // tx future/unconfirmed (non ancora avvenute).
    if (effectiveEstateId(t)) continue;
    if (!isRealized(t)) continue;
    const arrN = matrixForNetto.get(t.categoryId);
    if (arrN) arrN[t.month - 1] += t.amount;
  }

  // Estate matrix: somma per estate per mese (totali).
  // Tutte le tx legate all'estate (incluse capex come Acquisto) finiscono
  // nel cashflow del /riepilogo perché impattano davvero il bank balance.
  // L'esclusione capex avviene solo nella estate detail page.
  // Anche qui: distinguiamo `estateMatrix` (display, tutte) da
  // `estateMatrixFuture` (per opacity), e `estateMonthlyRealized` (solo per netto).
  const estateMatrix = new Map<string, number[]>();
  const estateMatrixFuture = new Map<string, number[]>();
  for (const e of estates) {
    estateMatrix.set(e.id, new Array(12).fill(0));
    estateMatrixFuture.set(e.id, new Array(12).fill(0));
  }
  const estateMonthly = new Array(12).fill(0);
  const estateMonthlyFuture = new Array(12).fill(0);
  const estateMonthlyRealized = new Array(12).fill(0);
  for (const t of transactions) {
    const eid = effectiveEstateId(t);
    if (!eid) continue;
    const arr = estateMatrix.get(eid);
    if (arr) arr[t.month - 1] += t.amount;
    estateMonthly[t.month - 1] += t.amount;
    if (isRealized(t)) {
      estateMonthlyRealized[t.month - 1] += t.amount;
    } else {
      const arrF = estateMatrixFuture.get(eid);
      if (arrF) arrF[t.month - 1] += t.amount;
      estateMonthlyFuture[t.month - 1] += t.amount;
    }
  }
  const estateGrand = estateMonthly.reduce((a, b) => a + b, 0);

  const ALL_GROUPS = [
    "transfer",
    "income",
    "investments",
    "paris",
    "casa",
    "utenze",
    "banca",
    "food",
    "lifestyle",
    "transport",
    "altri",
  ];

  // In cointestato non esistono entrate, investimenti o spese Parigi:
  // il conto serve solo a tracciare le spese famigliari condivise.
  const HIDDEN_IN_COINTESTATO = new Set(["income", "investments", "paris"]);
  const groups =
    view === "cointestato"
      ? ALL_GROUPS.filter((g) => !HIDDEN_IN_COINTESTATO.has(g))
      : ALL_GROUPS;
  const groupLabels: Record<string, string> = {
    income: "Entrate",
    investments: "Investimenti",
    paris: "Spese Parigi",
    casa: "Casa",
    utenze: "Utenze Italia",
    banca: "Banca & Tasse",
    food: "Cibo & Bar",
    lifestyle: "Lifestyle",
    transport: "Trasporti",
    altri: "Altri",
    transfer: "Giroconti (escluso dal netto)",
  };

  // Netto: somma entrate/spese reali. Escluso transfer e investimenti
  // (che non sono spese: i soldi restano tuoi, in altra forma).
  // Estates count → contribuiscono al netto come cashflow normale.
  const transferCatIds = new Set(categories.filter((c) => c.type === "transfer").map((c) => c.id));
  const investmentCatIds = new Set(
    categories.filter((c) => c.type === "investment").map((c) => c.id),
  );
  const visibleCatIds = new Set(categories.filter((c) => groups.includes(c.group)).map((c) => c.id));
  const monthlyTotals = new Array(12).fill(0);
  const monthlyInvestito = new Array(12).fill(0);
  for (const [catId, arr] of matrixForNetto) {
    if (transferCatIds.has(catId)) continue;
    if (investmentCatIds.has(catId)) {
      arr.forEach((v, i) => {
        monthlyInvestito[i] += v;
      });
      continue;
    }
    if (!visibleCatIds.has(catId)) continue;
    arr.forEach((v, i) => {
      monthlyTotals[i] += v;
    });
  }
  // Aggiungi il cashflow REALIZZATO degli estates al netto (esclude future)
  for (let i = 0; i < 12; i++) monthlyTotals[i] += estateMonthlyRealized[i];
  const grandTotal = monthlyTotals.reduce((a, b) => a + b, 0);

  // Proiezione: somma future tx (incluse estate-linked) per cell. Mostrata
  // come riga sotto al netto + greyed nelle celle.
  const monthlyTotalsFuture = new Array(12).fill(0);
  for (const [catId, arr] of matrixFuture) {
    if (transferCatIds.has(catId)) continue;
    if (investmentCatIds.has(catId)) continue;
    if (!visibleCatIds.has(catId)) continue;
    arr.forEach((v, i) => {
      monthlyTotalsFuture[i] += v;
    });
  }
  for (let i = 0; i < 12; i++) monthlyTotalsFuture[i] += estateMonthlyFuture[i];
  const grandInvestito = monthlyInvestito.reduce((a, b) => a + b, 0);

  // === Costruisci i GroupRow per il client component ===
  const investmentCats = categories.filter((c) => c.type === "investment");
  const investmentRows = investmentCats
    .map((c) => {
      const arr = matrix.get(c.id) ?? new Array(12).fill(0);
      const arrF = matrixFuture.get(c.id) ?? new Array(12).fill(0);
      const total = arr.reduce((a, b) => a + b, 0);
      return { id: c.id, emoji: c.emoji, label: c.name, monthly: arr, monthlyFuture: arrF, total };
    })
    .filter((r) => showAll || r.total !== 0 || r.monthly.some((v) => v !== 0));

  // Per gli estates mostriamo SEMPRE tutti gli estates active (no filter
  // per total!=0): sono entità "fisse" del patrimonio, l'utente si aspetta
  // di vederle tutte anche se non hanno cashflow nel periodo. Per le
  // categorie il filter resta (altrimenti troppo rumore).
  const estateRows = estates.map((e) => {
    const arr = estateMatrix.get(e.id) ?? new Array(12).fill(0);
    const arrF = estateMatrixFuture.get(e.id) ?? new Array(12).fill(0);
    const total = arr.reduce((a, b) => a + b, 0);
    return {
      id: e.id,
      emoji: e.emoji ?? "🏠",
      label: e.name,
      monthly: arr,
      monthlyFuture: arrF,
      total,
      href: `/estates/${e.id}`,
    };
  });

  const matrixGroups: GroupRow[] = [];

  // Transfer in cima (separato)
  if (groups.includes("transfer")) {
    const transferCats = categories.filter((c) => c.group === "transfer");
    const rows = transferCats
      .map((c) => {
        const arr = matrix.get(c.id) ?? new Array(12).fill(0);
        const arrF = matrixFuture.get(c.id) ?? new Array(12).fill(0);
        const total = arr.reduce((a, b) => a + b, 0);
        return { id: c.id, emoji: c.emoji, label: c.name, monthly: arr, monthlyFuture: arrF, total };
      })
      .filter((r) => showAll || r.total !== 0 || r.monthly.some((v) => v !== 0));
    if (rows.length > 0 || showAll) {
      const groupMonthly = new Array(12).fill(0);
      const groupMonthlyFuture = new Array(12).fill(0);
      for (const r of rows) {
        r.monthly.forEach((v, i) => (groupMonthly[i] += v));
        r.monthlyFuture.forEach((v, i) => (groupMonthlyFuture[i] += v));
      }
      matrixGroups.push({
        id: "transfer",
        label: groupLabels.transfer,
        tone: "transfer",
        collapsible: true,
        defaultExpanded: false,
        headerMonthly: groupMonthly,
        headerMonthlyFuture: groupMonthlyFuture,
        headerTotal: groupMonthly.reduce((a, b) => a + b, 0),
        rows,
        separateAfter: true,
      });
    }
  }

  // Helper per costruire un gruppo "normale" (non-collapsible) da un group id.
  function buildNormalGroup(g: string) {
    const groupCats = categories.filter((c) => c.group === g);
    const rows = groupCats
      .map((c) => {
        const arr = matrix.get(c.id) ?? new Array(12).fill(0);
        const arrF = matrixFuture.get(c.id) ?? new Array(12).fill(0);
        const total = arr.reduce((a, b) => a + b, 0);
        return { id: c.id, emoji: c.emoji, label: c.name, monthly: arr, monthlyFuture: arrF, total };
      })
      .filter((r) => showAll || r.total !== 0 || r.monthly.some((v) => v !== 0));
    if (rows.length === 0 && !showAll) return null;
    const groupMonthly = new Array(12).fill(0);
    const groupMonthlyFuture = new Array(12).fill(0);
    for (const r of rows) {
      r.monthly.forEach((v, i) => (groupMonthly[i] += v));
      r.monthlyFuture.forEach((v, i) => (groupMonthlyFuture[i] += v));
    }
    return {
      id: g,
      label: groupLabels[g] ?? g,
      tone: (g === "income" ? "income" : "neutral") as GroupRow["tone"],
      collapsible: false,
      defaultExpanded: true,
      headerMonthly: groupMonthly,
      headerMonthlyFuture: groupMonthlyFuture,
      headerTotal: groupMonthly.reduce((a, b) => a + b, 0),
      rows,
    } satisfies GroupRow;
  }

  // Ordine richiesto: Transfer → Entrate → Estates → Investimenti → resto.
  // (Estates e Investimenti sono entrambi collapsible, default chiuso.)
  if (groups.includes("income")) {
    const incomeGroup = buildNormalGroup("income");
    if (incomeGroup) matrixGroups.push(incomeGroup);
  }

  if (estateRows.length > 0 || (showAll && estates.length > 0)) {
    matrixGroups.push({
      id: "estates",
      label: "Estates",
      tone: "estates",
      collapsible: true,
      defaultExpanded: false,
      headerMonthly: estateMonthly,
      headerMonthlyFuture: estateMonthlyFuture,
      headerTotal: estateGrand,
      rows: estateRows,
    });
  }

  if (groups.includes("investments") && (investmentRows.length > 0 || showAll)) {
    // Future per investments: somma future tx delle cat type=investment
    const investmentMonthlyFuture = new Array(12).fill(0);
    for (const c of investmentCats) {
      const arrF = matrixFuture.get(c.id) ?? new Array(12).fill(0);
      arrF.forEach((v, i) => (investmentMonthlyFuture[i] += v));
    }
    matrixGroups.push({
      id: "investments",
      label: "Investimenti",
      tone: "investments",
      collapsible: true,
      defaultExpanded: false,
      headerMonthly: monthlyInvestito,
      headerMonthlyFuture: investmentMonthlyFuture,
      headerTotal: grandInvestito,
      rows: investmentRows,
    });
  }

  // Tutti gli altri gruppi normali (Casa, Utenze, ecc.) DOPO.
  const REMAINING_NORMAL = ["paris", "casa", "utenze", "banca", "food", "lifestyle", "transport", "altri"];
  for (const g of REMAINING_NORMAL) {
    if (!groups.includes(g)) continue;
    const built = buildNormalGroup(g);
    if (built) matrixGroups.push(built);
  }

  // === Confronto YTD: stesso periodo (gen 1 → giorno corrente) anno corrente vs precedente ===
  // Solo movimenti EFFETTIVAMENTE avvenuti (confirmed=true). Le entrate/uscite
  // future programmate (confirmed=false) non concorrono.
  const isCurrentYear = year === now.getFullYear();
  // Cutoff: "fino a oggi" per l'anno corrente, "fino al stesso giorno dell'anno X" per il precedente
  const curCutoff = isCurrentYear
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    : new Date(year, 11, 31, 23, 59, 59, 999);
  const prevCutoff = isCurrentYear
    ? new Date(compareYear, now.getMonth(), now.getDate(), 23, 59, 59, 999)
    : new Date(compareYear, 11, 31, 23, 59, 59, 999);

  function aggregate(txs: typeof transactions, cutoff: Date) {
    const cutoffMs = cutoff.getTime();
    let income = 0,
      expense = 0,
      invested = 0;
    for (const t of txs) {
      if (t.date.getTime() > cutoffMs) continue;
      if (!t.confirmed) continue;
      if (!t.categoryId) continue;
      const cat = categories.find((c) => c.id === t.categoryId);
      if (!cat) continue;
      if (cat.type === "transfer") continue;
      if (cat.type === "investment") {
        invested += t.amount;
        continue;
      }
      if (t.amount > 0) income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, net: income + expense, invested };
  }
  const cur = aggregate(transactions, curCutoff);
  const prev = aggregate(prevYearTxs, prevCutoff);
  function pct(a: number, b: number): number | null {
    if (b === 0) return null;
    return (a - b) / Math.abs(b);
  }
  const compare = {
    income: { cur: cur.income, prev: prev.income, pct: pct(cur.income, prev.income) },
    expense: { cur: cur.expense, prev: prev.expense, pct: pct(cur.expense, prev.expense) },
    net: { cur: cur.net, prev: prev.net, pct: pct(cur.net, prev.net) },
    invested: { cur: cur.invested, prev: prev.invested, pct: pct(cur.invested, prev.invested) },
  };
  const hasPrevData = prevYearTxs.length > 0;

  function buildLink(params: Record<string, string | undefined>) {
    const u = new URLSearchParams();
    if (year) u.set("year", year.toString());
    if (view !== "combinato") u.set("view", view);
    if (showAll) u.set("all", "1");
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) u.delete(k);
      else u.set(k, v);
    }
    return `/riepilogo?${u.toString()}`;
  }

  const VIEW_LABELS: Record<View, string> = {
    combinato: "Combinato",
    personale: "Personale",
    cointestato: "Cointestato",
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Riepilogo {year}{" "}
            <span className="text-base text-[var(--fg-muted)] font-normal">· {VIEW_LABELS[view]}</span>
          </h1>
          <p className="text-sm text-[var(--fg-muted)] mt-0.5">
            {view === "cointestato"
              ? "Spese condivise (account Cointestato, importi pieni)"
              : view === "combinato"
              ? "Personali + cointestato sommati"
              : "Solo movimenti personali (esclude cointestato)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
              <Link
                key={v}
                href={buildLink({ view: v === "combinato" ? undefined : v })}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  view === v
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                )}
              >
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </div>
          <YearTabs
            years={allYears.map((y) => y.year)}
            currentYear={year}
          />
        </div>
      </header>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href={buildLink({ all: showAll ? undefined : "1" })}
          className={cn(
            "text-xs px-3 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5",
            showAll
              ? "bg-violet-500/10 border-violet-500/30 text-violet-300"
              : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          {showAll ? "✓ Mostra anche righe vuote" : "Mostra anche righe vuote"}
        </Link>
        <div className="text-xs text-[var(--fg-muted)] flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span>{transactions.length} movimenti</span>
          <span>
            netto{" "}
            <span
              className={cn(
                "font-medium tabular-nums",
                grandTotal >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {formatEUR(grandTotal)}
            </span>
          </span>
          {grandInvestito !== 0 && (
            <span>
              investito{" "}
              <span className="font-medium tabular-nums text-violet-300">
                {formatEUR(grandInvestito)}
              </span>
            </span>
          )}
        </div>
      </div>

      {hasPrevData && (() => {
        const cutoffLabel = curCutoff.toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        return (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)] px-1 leading-none flex items-baseline gap-1.5 flex-wrap">
              <span>Ad oggi · {cutoffLabel} · VS Anno</span>
              <CompareYearSelect
                current={compareYear}
                available={allYears.map((y) => y.year).sort((a, b) => b - a)}
                excludeYear={year}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <CompareCard
                label="Entrate"
                cur={compare.income.cur}
                prev={compare.income.prev}
                pct={compare.income.pct}
                year={compareYear}
                tone="emerald"
              />
              <CompareCard
                label="Spese"
                cur={Math.abs(compare.expense.cur)}
                prev={Math.abs(compare.expense.prev)}
                pct={compare.expense.pct == null ? null : -compare.expense.pct}
                year={compareYear}
                tone="rose"
                invertGood
              />
              <CompareCard
                label="Cashflow"
                cur={compare.net.cur}
                prev={compare.net.prev}
                pct={compare.net.pct}
                year={compareYear}
                tone="violet"
              />
              <CompareCard
                label="Investito"
                cur={Math.abs(compare.invested.cur)}
                prev={Math.abs(compare.invested.prev)}
                pct={compare.invested.pct == null ? null : -compare.invested.pct}
                year={compareYear}
                tone="violet"
              />
            </div>
          </div>
        );
      })()}

      <MatrixTable
        groups={matrixGroups}
        monthlyTotals={monthlyTotals}
        monthlyTotalsFuture={monthlyTotalsFuture}
        grandTotal={grandTotal}
      />
    </div>
  );
}

function CompareCard({
  label,
  cur,
  prev,
  pct,
  year,
  tone,
  invertGood,
}: {
  label: string;
  cur: number;
  prev: number;
  pct: number | null;
  year: number;
  tone: "emerald" | "rose" | "violet";
  /** Per le spese: pct positivo = MENO spese = buono. Inverte la logica colore. */
  invertGood?: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    violet: "text-violet-300",
  };
  let pctColor = "text-[var(--fg-muted)]";
  let pctLabel = "—";
  if (pct != null) {
    const isGood = invertGood ? pct >= 0 : pct >= 0;
    pctColor = isGood ? "text-emerald-400" : "text-rose-400";
    pctLabel = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
  }
  return (
    <div className="surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-[var(--fg-muted)] mb-1">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", tones[tone])}>
        {formatEUR(cur, { compact: true })}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 text-[11px]">
        <span className={cn("tabular-nums font-medium", pctColor)}>{pctLabel}</span>
        <span className="text-[var(--fg-subtle)]">
          vs {year} ({formatEUR(prev, { compact: true })})
        </span>
      </div>
    </div>
  );
}
