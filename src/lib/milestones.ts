/**
 * Definizione condivisa dei milestone tier del Liquid Net Worth.
 * Usata sia dal widget Milestones che da NetWorthChart (per i dot dorati
 * sopra la curva quando il toggle "Mostra sul grafico" è attivo).
 */

export type Tier = {
  amount: number;
  emoji: string;
  label: string;
};

type Row = {
  unlockAt: number;
  tiers: Tier[];
  endgame?: boolean;
};

export const MILESTONE_ROWS: Row[] = [
  {
    unlockAt: 0,
    tiers: [
      { amount: 1_000, emoji: "🌱", label: "Seedling" },
      { amount: 5_000, emoji: "🌿", label: "Sprout" },
      { amount: 10_000, emoji: "🌳", label: "Sapling" },
    ],
  },
  {
    unlockAt: 10_000,
    tiers: [
      { amount: 25_000, emoji: "🥉", label: "Bronze" },
      { amount: 50_000, emoji: "🥈", label: "Silver" },
      { amount: 100_000, emoji: "🥇", label: "Gold" },
    ],
  },
  {
    unlockAt: 100_000,
    tiers: [
      { amount: 250_000, emoji: "🏆", label: "Trophy" },
      { amount: 500_000, emoji: "💎", label: "Diamond" },
      { amount: 1_000_000, emoji: "👑", label: "Crown" },
    ],
  },
  {
    unlockAt: 1_000_000,
    tiers: [
      { amount: 2_000_000, emoji: "🚀", label: "Rocket" },
      { amount: 5_000_000, emoji: "✨", label: "Stardust" },
      { amount: 10_000_000, emoji: "🪐", label: "Cosmos" },
    ],
  },
  {
    unlockAt: 10_000_000,
    endgame: true,
    tiers: [
      {
        amount: Number.POSITIVE_INFINITY,
        emoji: "🐉",
        label: "Endgame",
      },
    ],
  },
];

export const ALL_MILESTONE_TIERS: Tier[] = MILESTONE_ROWS.flatMap((r) => r.tiers).filter(
  (t) => Number.isFinite(t.amount),
);

/**
 * Per ogni tier finito, ritorna il primo punto della history in cui il NW
 * lo ha superato (con month ISO + amount). Utile per disegnare marker sul
 * chart o badge "sbloccato il …".
 */
export function findMilestoneUnlocks(
  history: { month: string; total: number }[],
): Array<{ tier: Tier; month: string; total: number }> {
  const out: Array<{ tier: Tier; month: string; total: number }> = [];
  for (const t of ALL_MILESTONE_TIERS) {
    const point = history.find((p) => p.total >= t.amount);
    if (point) out.push({ tier: t, month: point.month, total: point.total });
  }
  return out;
}
