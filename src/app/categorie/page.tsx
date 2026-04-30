import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CategoriesBoard } from "@/components/categorie/categories-board";
import { NewCategoryButton } from "@/components/categorie/new-category-button";
import { Archive } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CategoriePage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const [allCategories, counts, estates] = await Promise.all([
    prisma.category.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      _count: true,
    }),
    prisma.realEstate.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, emoji: true, city: true },
    }),
  ]);
  const archivedCount = allCategories.filter((c) => !c.active).length;
  const filtered = showArchived
    ? allCategories.filter((c) => !c.active)
    : allCategories.filter((c) => c.active);

  const countMap: Record<string, number> = {};
  for (const c of counts) {
    if (c.categoryId) countMap[c.categoryId] = c._count;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Categorie
            {showArchived && (
              <span className="text-base text-[var(--color-fg-muted)] font-normal">
                {" "}· archiviate
              </span>
            )}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)] mt-0.5">
            {filtered.length} {showArchived ? "archiviate" : "attive"}
            {!showArchived && archivedCount > 0 && ` · ${archivedCount} archiviate nascoste`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showArchived ? (
            <Link
              href="/categorie"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)]"
            >
              <Archive className="size-3.5" />
              Torna alle attive
            </Link>
          ) : archivedCount > 0 ? (
            <Link
              href="/categorie?archived=1"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)]"
            >
              <Archive className="size-3.5" />
              Mostra archiviate ({archivedCount})
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--color-surface-2)]/40 border border-[var(--color-border)]/40 text-xs text-[var(--color-fg-subtle)]/60 cursor-not-allowed"
              title="Nessuna categoria archiviata"
            >
              <Archive className="size-3.5" />
              Archivio vuoto
            </span>
          )}
          <NewCategoryButton disabled={showArchived} />
        </div>
      </header>

      <CategoriesBoard
        initialCategories={filtered.map((c) => ({
          id: c.id,
          emoji: c.emoji,
          name: c.name,
          group: c.group,
          type: c.type,
          displayOrder: c.displayOrder,
          estateId: c.estateId ?? null,
        }))}
        estates={estates}
        countMap={countMap}
        mode={showArchived ? "archived" : "active"}
        archivedCount={archivedCount}
      />
    </div>
  );
}
