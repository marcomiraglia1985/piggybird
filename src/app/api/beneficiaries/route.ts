import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET: lista beneficiari unici dal DB con categoria top per ciascuno.
 * Usato dal modal "Nuovo movimento" per autocomplete + auto-fill categoria.
 *
 * Output: { beneficiaries: [{ name, count, topCategoryId, topCategoryEmoji, topCategoryName }] }
 *   - count = quante tx con quel beneficiary
 *   - topCategoryId = categoria più frequente per quel beneficiary (null se sempre null)
 */
export async function GET() {
  // Una sola query groupBy su (beneficiary, categoryId): aggrega tutto
  const grouped = await prisma.transaction.groupBy({
    by: ["beneficiary", "categoryId"],
    where: { beneficiary: { not: null } },
    _count: { _all: true },
  });

  // Aggrega in JS: per ogni beneficiary, totale tx + map categoryId → count
  const map = new Map<
    string,
    { total: number; cats: Map<string, number> }
  >();
  for (const row of grouped) {
    const b = row.beneficiary?.trim();
    if (!b) continue;
    const entry = map.get(b) ?? { total: 0, cats: new Map() };
    entry.total += row._count._all;
    if (row.categoryId) {
      entry.cats.set(
        row.categoryId,
        (entry.cats.get(row.categoryId) ?? 0) + row._count._all,
      );
    }
    map.set(b, entry);
  }

  // Trova top categoryId per ogni beneficiary, e ordina per total desc
  const items = Array.from(map.entries())
    .map(([name, { total, cats }]) => {
      let topCatId: string | null = null;
      let topCount = 0;
      for (const [catId, count] of cats) {
        if (count > topCount) {
          topCatId = catId;
          topCount = count;
        }
      }
      return { name, count: total, topCategoryId: topCatId };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 500);

  // Enrich con info categoria (emoji + nome)
  const categories = await prisma.category.findMany({
    select: { id: true, emoji: true, name: true },
  });
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const beneficiaries = items.map((b) => {
    const cat = b.topCategoryId ? catMap.get(b.topCategoryId) : null;
    return {
      name: b.name,
      count: b.count,
      topCategoryId: b.topCategoryId,
      topCategoryEmoji: cat?.emoji ?? null,
      topCategoryName: cat?.name ?? null,
    };
  });

  return NextResponse.json({ beneficiaries });
}
