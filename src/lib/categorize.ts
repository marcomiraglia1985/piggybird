import { prisma } from "./prisma";

/**
 * Suggerisce una categoria per una nuova transazione basandosi
 * sullo storico: cerca transazioni passate con beneficiario simile
 * e prende la categoria più frequente.
 */
export async function suggestCategoryByDescription(
  description: string,
): Promise<string | null> {
  const norm = description.trim();
  if (!norm) return null;

  // 1. Match esatto
  const exact = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      OR: [{ beneficiary: { equals: norm } }, { notes: { equals: norm } }],
      categoryId: { not: null },
    },
    _count: true,
    orderBy: { _count: { categoryId: "desc" } },
    take: 1,
  });
  if (exact[0]?.categoryId) return exact[0].categoryId;

  // 2. Match prefisso (3+ caratteri)
  if (norm.length >= 4) {
    const prefix = norm.slice(0, 8);
    const fuzzy = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        OR: [{ beneficiary: { startsWith: prefix } }, { notes: { startsWith: prefix } }],
        categoryId: { not: null },
      },
      _count: true,
      orderBy: { _count: { categoryId: "desc" } },
      take: 1,
    });
    if (fuzzy[0]?.categoryId) return fuzzy[0].categoryId;
  }

  return null;
}

/**
 * Suggerisce in batch: prende un set di descrizioni uniche e
 * restituisce una mappa description -> categoryId.
 */
export async function suggestCategoriesBatch(
  descriptions: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(descriptions.map((d) => d.trim()).filter(Boolean))];
  // Esegue lookup in parallelo a piccoli batch per non saturare
  const concurrency = 8;
  for (let i = 0; i < unique.length; i += concurrency) {
    const slice = unique.slice(i, i + concurrency);
    const results = await Promise.all(slice.map((d) => suggestCategoryByDescription(d)));
    slice.forEach((d, idx) => {
      const id = results[idx];
      if (id) out.set(d, id);
    });
  }
  return out;
}
