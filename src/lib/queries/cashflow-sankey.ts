import { prisma } from "@/lib/prisma";

export type SankeyNode = {
  /** ID univoco usato come riferimento dai link. */
  id: string;
  /** Etichetta visuale (es. "🏠 Casa €1,234"). */
  label: string;
  /** Tipo: income (sinistra), group (centro), category (destra), savings (out). */
  kind: "income" | "group" | "category" | "savings" | "deficit";
  emoji?: string;
  /** Valore totale che attraversa questo nodo (= sum dei link in/out). */
  value: number;
};

export type SankeyLink = {
  source: string;
  target: string;
  value: number;
};

export type SankeyData = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  meta: {
    totalIncome: number;
    totalExpense: number;
    netSavings: number; // positivo = surplus, negativo = deficit
    txCount: number;
    periodLabel: string;
  };
};

export type Period = "currentMonth" | "currentYear" | "trailing12Months";
export type ViewMode = "groups" | "detailed";

/**
 * Aggregato dati per il widget Cashflow Sankey.
 *
 * Modalità:
 *   - "groups"    (default, 2-stage): Entrate → Gruppi spesa + Risparmi
 *   - "detailed"  (3-stage): Entrate → Gruppi → Top 5 categorie per gruppo + "Altre"
 *
 * Esclusioni di default per pulizia (toggle via opts):
 *   - Transfer interni (transferGroupId set): non rappresentano flusso vero
 *   - Capex (categorie type=investment): distorce il "where does money go" mensile
 *   - Rettifiche 💸 Unknown: artefatti contabili, non spese reali
 */
export async function getCashflowSankeyData(opts: {
  period: Period;
  viewMode: ViewMode;
  includeCapex?: boolean;
  includeTransfers?: boolean;
  includeRettifiche?: boolean;
}): Promise<SankeyData> {
  const { startDate, endDate, periodLabel } = resolvePeriod(opts.period);

  const txs = await prisma.transaction.findMany({
    where: {
      confirmed: true,
      date: { gte: startDate, lte: endDate },
      ...(opts.includeTransfers ? {} : { transferGroupId: null }),
    },
    include: { category: true },
  });

  // Filtra capex e rettifiche se non richiesti
  const usableTxs = txs.filter((t) => {
    if (!t.category) return false;
    if (t.category.type === "transfer") return false;
    if (!opts.includeCapex && t.category.type === "investment") return false;
    if (
      !opts.includeRettifiche &&
      t.category.name.toLowerCase().includes("rettifica")
    )
      return false;
    if (
      !opts.includeRettifiche &&
      t.category.name.toLowerCase().includes("unknown")
    )
      return false;
    return true;
  });

  // Separa income / expense
  let totalIncome = 0;
  let totalExpense = 0;
  // Per gruppo expense: { group: { total, byCategory: [{name, emoji, amount}] } }
  type GroupAgg = { total: number; cats: Map<string, { emoji: string; total: number }> };
  const expenseByGroup = new Map<string, GroupAgg>();

  for (const tx of usableTxs) {
    if (!tx.category) continue;
    const amount = tx.amount;
    if (tx.category.type === "income" || amount > 0) {
      // Considera tutto il positivo come entrata (anche se categorizzato male)
      totalIncome += amount;
    } else if (amount < 0) {
      totalExpense += -amount; // converti a positivo
      const g = tx.category.group;
      let agg = expenseByGroup.get(g);
      if (!agg) {
        agg = { total: 0, cats: new Map() };
        expenseByGroup.set(g, agg);
      }
      agg.total += -amount;
      const catKey = `${tx.category.emoji} ${tx.category.name}`;
      const cat = agg.cats.get(catKey) ?? { emoji: tx.category.emoji, total: 0 };
      cat.total += -amount;
      agg.cats.set(catKey, cat);
    }
  }

  const netSavings = totalIncome - totalExpense;

  // Build Sankey nodes/links
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Stage 1: Entrate (1 nodo aggregato)
  const incomeNode: SankeyNode = {
    id: "income",
    label: "Entrate",
    kind: "income",
    emoji: "💰",
    value: totalIncome,
  };
  nodes.push(incomeNode);

  // Ordina i gruppi per total desc
  const sortedGroups = [...expenseByGroup.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  );

  // Stage 2: Gruppi expense
  for (const [group, agg] of sortedGroups) {
    nodes.push({
      id: `group:${group}`,
      label: capitalize(group),
      kind: "group",
      value: agg.total,
    });
    links.push({ source: "income", target: `group:${group}`, value: agg.total });
  }

  // Risparmio (o deficit)
  if (netSavings > 0) {
    nodes.push({
      id: "savings",
      label: "Risparmi",
      kind: "savings",
      emoji: "🪺",
      value: netSavings,
    });
    links.push({ source: "income", target: "savings", value: netSavings });
  } else if (netSavings < -0.01) {
    nodes.push({
      id: "deficit",
      label: "Deficit (intacca patrimonio)",
      kind: "deficit",
      emoji: "⚠️",
      value: -netSavings,
    });
    // Deficit: l'expense supera l'income — visualizziamo come "patrimonio precedente"
    // come fonte aggiuntiva nel income.
    incomeNode.value += -netSavings;
    links.push({
      source: "deficit",
      target: "income",
      value: -netSavings,
    });
  }

  // Stage 3: top 5 categorie per gruppo + "Altre" (solo se viewMode=detailed)
  if (opts.viewMode === "detailed") {
    for (const [group, agg] of sortedGroups) {
      const catsArr = [...agg.cats.entries()].sort(
        (a, b) => b[1].total - a[1].total,
      );
      const top = catsArr.slice(0, 5);
      const rest = catsArr.slice(5);

      for (const [catName, cat] of top) {
        const catId = `cat:${group}:${catName}`;
        nodes.push({
          id: catId,
          label: catName,
          kind: "category",
          emoji: cat.emoji,
          value: cat.total,
        });
        links.push({ source: `group:${group}`, target: catId, value: cat.total });
      }
      if (rest.length > 0) {
        const restTotal = rest.reduce((s, [, c]) => s + c.total, 0);
        const otherId = `cat:${group}:other`;
        nodes.push({
          id: otherId,
          label: `Altre (${rest.length})`,
          kind: "category",
          value: restTotal,
        });
        links.push({
          source: `group:${group}`,
          target: otherId,
          value: restTotal,
        });
      }
    }
  }

  return {
    nodes,
    links,
    meta: {
      totalIncome,
      totalExpense,
      netSavings,
      txCount: usableTxs.length,
      periodLabel,
    },
  };
}

function resolvePeriod(p: Period): {
  startDate: Date;
  endDate: Date;
  periodLabel: string;
} {
  const now = new Date();
  if (p === "currentMonth") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const monthName = now.toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });
    return {
      startDate: start,
      endDate: end,
      periodLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1),
    };
  }
  if (p === "currentYear") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    return {
      startDate: start,
      endDate: end,
      periodLabel: String(now.getFullYear()),
    };
  }
  // trailing12Months
  const start = new Date(now);
  start.setMonth(start.getMonth() - 12);
  return { startDate: start, endDate: now, periodLabel: "Ultimi 12 mesi" };
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
