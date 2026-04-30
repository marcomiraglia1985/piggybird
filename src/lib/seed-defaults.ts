import { prisma } from "./prisma";

/**
 * Default investment categories. Seeded la prima volta che un utente apre
 * /investimenti se NESSUNA categoria con type=investment esiste ancora.
 * Idempotente: se le cat ci sono già, non fa nulla.
 *
 * Disinvestimento serve a tracciare i prelievi dal conto investimento
 * (positivo) come opposto dei buy "Stocks" (negativo). La somma algebrica
 * dà l'effettivo capitale netto investito.
 */
const DEFAULT_INVESTMENT_CATEGORIES = [
  { emoji: "📈", name: "Stocks", order: 201 },
  { emoji: "🚀", name: "Crypto", order: 202 },
  { emoji: "💰", name: "Metals", order: 203 },
  { emoji: "📊", name: "ETF", order: 204 },
  { emoji: "📤", name: "Disinvestimento", order: 205 },
];

export async function ensureDefaultInvestmentCategories(): Promise<void> {
  const count = await prisma.category.count({
    where: { type: "investment", group: "investments" },
  });
  if (count > 0) return;
  await prisma.category.createMany({
    data: DEFAULT_INVESTMENT_CATEGORIES.map((c) => ({
      emoji: c.emoji,
      name: c.name,
      group: "investments",
      type: "investment",
      displayOrder: c.order,
      active: true,
    })),
  });
}
