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

/**
 * Default expense + income categories universali. Seedate la prima volta che
 * un utente non ha NESSUNA categoria expense/income (= primo accesso). Naming
 * neutro inglese per essere usabile con qualsiasi locale finché non parte la
 * i18n vera (categorie restano editabili dall'utente).
 */
const DEFAULT_INCOME_CATEGORIES = [
  { emoji: "💼", name: "Salary", order: 1 },
  { emoji: "💰", name: "Interest", order: 2 },
  { emoji: "🎁", name: "Other income", order: 3 },
];
const DEFAULT_EXPENSE_CATEGORIES = [
  { emoji: "🍔", name: "Food & Groceries", order: 11 },
  { emoji: "🍽️", name: "Restaurants", order: 12 },
  { emoji: "🏠", name: "Housing", order: 13 },
  { emoji: "💡", name: "Utilities", order: 14 },
  { emoji: "🚗", name: "Transport", order: 15 },
  { emoji: "⛽", name: "Fuel", order: 16 },
  { emoji: "💊", name: "Health", order: 17 },
  { emoji: "👕", name: "Clothing", order: 18 },
  { emoji: "🎬", name: "Entertainment", order: 19 },
  { emoji: "✈️", name: "Travel", order: 20 },
  { emoji: "🎓", name: "Education", order: 21 },
  { emoji: "📱", name: "Subscriptions", order: 22 },
  { emoji: "🏦", name: "Bank fees", order: 23 },
  { emoji: "🛍️", name: "Shopping", order: 24 },
];
const DEFAULT_TRANSFER_CATEGORIES = [
  { emoji: "↔️", name: "Transfer", order: 901 },
];

export async function ensureDefaultBaseCategories(): Promise<void> {
  // Idempotente: se l'utente ha già qualunque categoria expense/income, skip.
  const existing = await prisma.category.count({
    where: { type: { in: ["income", "expense"] } },
  });
  if (existing > 0) return;
  await prisma.category.createMany({
    data: [
      ...DEFAULT_INCOME_CATEGORIES.map((c) => ({
        emoji: c.emoji,
        name: c.name,
        group: "income",
        type: "income",
        displayOrder: c.order,
        active: true,
      })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        emoji: c.emoji,
        name: c.name,
        group: "expense",
        type: "expense",
        displayOrder: c.order,
        active: true,
      })),
      ...DEFAULT_TRANSFER_CATEGORIES.map((c) => ({
        emoji: c.emoji,
        name: c.name,
        group: "transfer",
        type: "transfer",
        displayOrder: c.order,
        active: true,
      })),
    ],
  });
}
