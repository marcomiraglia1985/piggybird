"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Check,
  X,
  Archive,
  ArchiveRestore,
  GitMerge,
  Trash2,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MergeCategoryDialog } from "./merge-dialog";
import { useToast } from "@/components/ui/toast";

export type CategoryRow = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  type: string;
  displayOrder: number;
  estateId: string | null;
};

export type EstateInfo = { id: string; name: string; emoji: string | null; city: string | null };

export type Section = {
  /** Chiave univoca: "estate:<id>" oppure il nome del group */
  key: string;
  label: React.ReactNode;
  /** Quando un cat viene droppato in questa sezione, group viene settato a questo (se presente) */
  groupValue: string | null;
  /** Idem per estateId */
  estateId: string | null;
};

export function CategoriesBoard({
  initialCategories,
  estates,
  countMap,
  mode,
  archivedCount,
}: {
  initialCategories: CategoryRow[];
  estates: EstateInfo[];
  countMap: Record<string, number>;
  mode: "active" | "archived";
  archivedCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<CategoryRow[]>(initialCategories);
  const [mounted, setMounted] = useState(false);
  // Ordine top-level (macro: estates + gruppi standard)
  const [macroOrder, setMacroOrder] = useState<string[]>([]);
  // Ordine degli estate sub-sections DENTRO la macro estates
  const [estateOrder, setEstateOrder] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);
  useEffect(() => setItems(initialCategories), [initialCategories]);
  useEffect(() => {
    try {
      const m = localStorage.getItem("fp-categories-macro-order");
      if (m) {
        const arr = JSON.parse(m) as string[];
        if (Array.isArray(arr)) setMacroOrder(arr);
      }
      const e = localStorage.getItem("fp-categories-estate-order");
      if (e) {
        const arr = JSON.parse(e) as string[];
        if (Array.isArray(arr)) setEstateOrder(arr);
      }
    } catch {}
  }, []);

  function persistMacroOrder(next: string[]) {
    setMacroOrder(next);
    try {
      localStorage.setItem("fp-categories-macro-order", JSON.stringify(next));
    } catch {}
  }
  function persistEstateOrder(next: string[]) {
    setEstateOrder(next);
    try {
      localStorage.setItem("fp-categories-estate-order", JSON.stringify(next));
    } catch {}
  }

  const startSectionRef = useRef<Section | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Collision custom: prima pointerWithin (intuitive per drop su zone vuote),
  // fallback a rectIntersection se cursore esce momentaneamente da una rect.
  const collisionDetection: CollisionDetection = (args) => {
    const pointerColl = pointerWithin(args);
    if (pointerColl.length > 0) return pointerColl;
    const rectColl = rectIntersection(args);
    if (rectColl.length > 0) return rectColl;
    const first = getFirstCollision(rectColl);
    return first ? [{ id: first }] : [];
  };

  // Costruisci sezioni: prima estates (anche vuote), poi gruppi standard.
  const REGULAR_GROUPS: { key: string; label: string }[] = [
    { key: "income", label: "Entrate" },
    { key: "transfer", label: "Trasferimenti" },
    { key: "investments", label: "Investimenti" },
    { key: "casa", label: "Casa" },
    { key: "utenze", label: "Utenze" },
    { key: "banca", label: "Banca & Tasse" },
    { key: "food", label: "Cibo & Bar" },
    { key: "lifestyle", label: "Lifestyle" },
    { key: "transport", label: "Trasporti" },
    { key: "altri", label: "Altri" },
    { key: "paris", label: "Parigi (legacy)" },
  ];

  const sections: Section[] = [
    {
      key: "uncategorized",
      label: "🆕 Da categorizzare",
      groupValue: "uncategorized",
      estateId: null,
    },
    ...estates.map<Section>((e) => ({
      key: `estate:${e.id}`,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-violet-400 font-semibold">
            Estates
          </span>
          <span className="text-[var(--color-fg-subtle)]">·</span>
          <span className="text-violet-300 normal-case tracking-normal">
            {e.emoji ?? "🏠"} {e.name}
          </span>
        </span>
      ),
      groupValue: null,
      estateId: e.id,
    })),
    ...REGULAR_GROUPS.map<Section>((g) => ({
      key: g.key,
      label: g.label,
      groupValue: g.key,
      estateId: null,
    })),
  ];

  function categoriesIn(sec: Section): CategoryRow[] {
    if (sec.estateId) {
      return items
        .filter((c) => c.estateId === sec.estateId)
        .sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return items
      .filter((c) => !c.estateId && c.group === sec.groupValue)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  function findSectionFor(catId: string): Section | null {
    const cat = items.find((c) => c.id === catId);
    if (!cat) return null;
    if (cat.estateId) return sections.find((s) => s.estateId === cat.estateId) ?? null;
    return sections.find((s) => s.groupValue === cat.group) ?? null;
  }

  function findSectionByKey(key: string): Section | null {
    return sections.find((s) => s.key === key) ?? null;
  }

  function findContainer(id: string): Section | null {
    // id può essere un cat.id o una section.key
    const sec = findSectionByKey(id);
    if (sec) return sec;
    return findSectionFor(id);
  }

  async function persistMoved(catId: string, target: Section) {
    // Settiamo SEMPRE i campi della sezione target, senza diff vs cat corrente
    // (cat in state è già stato aggiornato da onDragOver, quindi il diff
    // sarebbe a zero e non persisterebbe nulla — bug fix).
    const patch: Record<string, unknown> = {};
    if (target.estateId !== null) {
      // Sezione estate: linka all'estate, lascia group invariato
      patch.estateId = target.estateId;
    } else {
      // Sezione macro-area: scollega da qualsiasi estate + setta group
      patch.estateId = null;
      if (target.groupValue !== null) patch.group = target.groupValue;
    }
    await fetch(`/api/categories/${catId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function persistReorder(sectionCats: CategoryRow[]) {
    if (sectionCats.length === 0) return;
    await fetch("/api/categories/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: sectionCats.map((c) => c.id) }),
    });
  }

  function onDragStart(e: DragStartEvent) {
    const start = findSectionFor(String(e.active.id));
    startSectionRef.current = start;
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aCont = findContainer(String(active.id));
    const oCont = findContainer(String(over.id));
    if (!aCont || !oCont || aCont.key === oCont.key) return;

    setItems((prev) => {
      const next = [...prev];
      const idx = next.findIndex((c) => c.id === active.id);
      if (idx < 0) return prev;
      const cat = { ...next[idx] };
      // Sposta nella nuova sezione
      cat.estateId = oCont.estateId;
      if (oCont.groupValue !== null) cat.group = oCont.groupValue;
      next[idx] = cat;
      return next;
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const startSection = startSectionRef.current;
    startSectionRef.current = null;
    if (!over) return;

    const cat = items.find((c) => c.id === active.id);
    if (!cat) return;

    // Sezione corrente del cat (post-onDragOver: già spostato in state).
    const currentSection = findSectionFor(String(active.id));
    if (!currentSection) return;

    const movedAcrossSections =
      startSection != null && startSection.key !== currentSection.key;

    if (movedAcrossSections) {
      // Cross-section: persist il patch (group/estateId).
      await persistMoved(cat.id, currentSection);
      toast({
        title: `"${cat.name}" spostata`,
        description: `Ora in: ${currentSection.key === "uncategorized" ? "Da categorizzare" : currentSection.key}`,
        variant: "success",
        duration: 2000,
      });
      router.refresh();
      return;
    }

    // Stesso section: prova reorder se over.id è un altro cat.
    if (active.id !== over.id) {
      const sectionCats = categoriesIn(currentSection);
      const oldIdx = sectionCats.findIndex((c) => c.id === active.id);
      const newIdx = sectionCats.findIndex((c) => c.id === over.id);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        const moved = arrayMove(sectionCats, oldIdx, newIdx);
        setItems((prev) => {
          const otherCats = prev.filter((c) => !moved.find((m) => m.id === c.id));
          return [...otherCats, ...moved.map((m, i) => ({ ...m, displayOrder: i }))];
        });
        await persistReorder(moved);
        toast({ title: "Ordine salvato", variant: "success", duration: 1500 });
      }
    }
  }

  // Sezione speciale "Da categorizzare" — placeholder per cat appena create.
  // Sempre in cima quando ha cat, fuori dal macroOrder. Non droppabile come
  // destinazione "intenzionale" (è una zona temporanea).
  const uncategorizedSection: Section = {
    key: "uncategorized",
    label: (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
          🆕 Da categorizzare
        </span>
      </span>
    ),
    groupValue: "uncategorized",
    estateId: null,
  };
  const uncategorizedCats = items.filter(
    (c) => c.group === "uncategorized" && !c.estateId,
  );

  // Filtra estate sections (sempre visibili) e group sections.
  const estateSections = sections.filter((s) => s.estateId !== null);
  const groupSections = sections.filter(
    (s) => s.estateId === null && s.groupValue !== "uncategorized",
  );

  // Estate visibili: in mode=archived solo quelli con cat archiviate; in
  // mode=active sempre tutti gli estate (come placeholder droppable).
  const visibleEstateSections = estateSections.filter((sec) => {
    if (mode === "archived") return categoriesIn(sec).length > 0;
    return true;
  });

  // Group sezioni visibili: con almeno una cat oppure "altri" sempre
  const visibleGroupSections = groupSections.filter((sec) => {
    if (mode === "archived") return categoriesIn(sec).length > 0;
    return categoriesIn(sec).length > 0 || sec.groupValue === "altri";
  });

  // Costruisci macros top-level. ESTATES è una macro speciale che contiene
  // i singoli estate sub-section (se ci sono).
  type MacroEntry =
    | { kind: "estates"; key: "estates"; label: string; subs: Section[] }
    | { kind: "group"; key: string; label: string; section: Section };

  const macroEntries: MacroEntry[] = [];
  if (visibleEstateSections.length > 0) {
    // Riordina gli estate sub-section secondo estateOrder
    const orderedEstates = applyOrder(visibleEstateSections, estateOrder);
    macroEntries.push({
      kind: "estates",
      key: "estates",
      label: "Estates",
      subs: orderedEstates,
    });
  }
  for (const g of visibleGroupSections) {
    macroEntries.push({ kind: "group", key: g.key, label: groupLabelFor(g), section: g });
  }

  // Riordina top-level macros con macroOrder
  const orderedMacros = applyMacroOrder(macroEntries, macroOrder);

  function applyOrder<T extends { key: string }>(arr: T[], order: string[]): T[] {
    if (order.length === 0) return arr;
    const map = new Map(arr.map((x) => [x.key, x]));
    const out: T[] = [];
    const used = new Set<string>();
    for (const k of order) {
      const x = map.get(k);
      if (x) {
        out.push(x);
        used.add(k);
      }
    }
    for (const x of arr) if (!used.has(x.key)) out.push(x);
    return out;
  }

  function applyMacroOrder(arr: MacroEntry[], order: string[]): MacroEntry[] {
    if (order.length === 0) return arr;
    const map = new Map(arr.map((x) => [x.key, x]));
    const out: MacroEntry[] = [];
    const used = new Set<string>();
    for (const k of order) {
      const x = map.get(k);
      if (x) {
        out.push(x);
        used.add(k);
      }
    }
    for (const x of arr) if (!used.has(x.key)) out.push(x);
    return out;
  }

  function groupLabelFor(s: Section): string {
    const r = REGULAR_GROUPS.find((g) => g.key === s.key);
    return r?.label ?? s.key;
  }

  function moveMacro(key: string, direction: -1 | 1) {
    const current = orderedMacros.map((m) => m.key);
    const idx = current.indexOf(key);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistMacroOrder(next);
  }

  function moveEstate(key: string, direction: -1 | 1) {
    const estatesMacro = orderedMacros.find((m) => m.kind === "estates");
    if (!estatesMacro || estatesMacro.kind !== "estates") return;
    const current = estatesMacro.subs.map((s) => s.key);
    const idx = current.indexOf(key);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistEstateOrder(next);
  }

  function renderSectionContent(sec: Section) {
    const cats = categoriesIn(sec);
    return (
      <DroppableSection key={sec.key} section={sec}>
        <SortableContext items={cats.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-h-[100px]">
            {cats.length === 0 ? (
              <EmptySectionPlaceholder section={sec} />
            ) : (
              cats.map((c) => (
                <SortableCard
                  key={c.id}
                  cat={c}
                  count={countMap[c.id] ?? 0}
                  mode={mode}
                  allCategories={items}
                  onLocalUpdate={(patch) =>
                    setItems((prev) =>
                      prev.map((p) => (p.id === c.id ? { ...p, ...patch } : p)),
                    )
                  }
                  onRemoveFromList={() =>
                    setItems((prev) => prev.filter((p) => p.id !== c.id))
                  }
                />
              ))
            )}
          </div>
        </SortableContext>
      </DroppableSection>
    );
  }

  const showUncategorized = uncategorizedCats.length > 0;

  return (
    <>
      {!mounted ? (
        // SSR fallback (no arrows, no drag)
        <div className="space-y-6">
          {showUncategorized && (
            <SectionView
              key="uncategorized"
              section={uncategorizedSection}
              cats={uncategorizedCats}
              countMap={countMap}
              mode={mode}
            />
          )}
          {orderedMacros.map((m) =>
            m.kind === "estates" ? (
              <div key="estates" className="space-y-4">
                <h2 className="text-base font-semibold uppercase tracking-wider text-violet-300 px-1">
                  Estates
                </h2>
                {m.subs.map((s) => {
                  const cats = categoriesIn(s);
                  return (
                    <SectionView key={s.key} section={s} cats={cats} countMap={countMap} mode={mode} />
                  );
                })}
              </div>
            ) : (
              <SectionView
                key={m.key}
                section={m.section}
                cats={categoriesIn(m.section)}
                countMap={countMap}
                mode={mode}
              />
            ),
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="space-y-6">
            {showUncategorized && (
              <motion.div
                key="uncategorized"
                layout
                transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
                className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <h2 className="text-base font-semibold uppercase tracking-wider text-amber-300 inline-flex items-center gap-2">
                    🆕 Da categorizzare
                    <span className="text-[10px] text-amber-200/70 normal-case tracking-normal">
                      {uncategorizedCats.length}
                    </span>
                  </h2>
                  <span className="text-[10px] text-amber-200/60 normal-case tracking-normal">
                    Trascina giù in una macro-area o un Estate
                  </span>
                </div>
                {renderSectionContent(uncategorizedSection)}
              </motion.div>
            )}
            {orderedMacros.map((m, mIdx) => {
              const canMacroUp = mIdx > 0;
              const canMacroDown = mIdx < orderedMacros.length - 1;
              if (m.kind === "estates") {
                return (
                  <motion.div
                    key="estates"
                    layout
                    transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
                    className="space-y-4"
                  >
                    <MacroHeader
                      label="Estates"
                      onMoveUp={() => moveMacro("estates", -1)}
                      onMoveDown={() => moveMacro("estates", 1)}
                      canMoveUp={canMacroUp}
                      canMoveDown={canMacroDown}
                    />
                    {m.subs.map((s, sIdx) => {
                      const cats = categoriesIn(s);
                      const canEstateUp = sIdx > 0;
                      const canEstateDown = sIdx < m.subs.length - 1;
                      return (
                        <div key={s.key} className="space-y-2 pl-2">
                          <SectionHeader
                            section={s}
                            count={cats.length}
                            onMoveUp={() => moveEstate(s.key, -1)}
                            onMoveDown={() => moveEstate(s.key, 1)}
                            canMoveUp={canEstateUp}
                            canMoveDown={canEstateDown}
                          />
                          {renderSectionContent(s)}
                        </div>
                      );
                    })}
                  </motion.div>
                );
              }
              const cats = categoriesIn(m.section);
              return (
                <motion.div
                  key={m.key}
                  layout
                  transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
                  className="space-y-2"
                >
                  <SectionHeader
                    section={m.section}
                    count={cats.length}
                    onMoveUp={() => moveMacro(m.key, -1)}
                    onMoveDown={() => moveMacro(m.key, 1)}
                    canMoveUp={canMacroUp}
                    canMoveDown={canMacroDown}
                  />
                  {renderSectionContent(m.section)}
                </motion.div>
              );
            })}
          </div>
        </DndContext>
      )}
    </>
  );
}

function MacroHeader({
  label,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          title="Sposta macro su"
          className="size-4 inline-flex items-center justify-center rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronUp className="size-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          title="Sposta macro giù"
          className="size-4 inline-flex items-center justify-center rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronDown className="size-3" />
        </button>
      </div>
      <h2 className="text-base font-semibold uppercase tracking-wider text-violet-300">
        {label}
      </h2>
    </div>
  );
}

function SectionHeader({
  section,
  count,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  section: Section;
  count: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      {(onMoveUp || onMoveDown) && (
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Sposta sezione su"
            className="size-4 inline-flex items-center justify-center rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Sposta sezione giù"
            className="size-4 inline-flex items-center justify-center rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronDown className="size-3" />
          </button>
        </div>
      )}
      <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-fg-muted)] inline-flex items-center gap-2">
        {section.label}
        <span className="text-[10px] text-[var(--color-fg-subtle)] normal-case tracking-normal">
          {count} {count === 1 ? "categoria" : "categorie"}
        </span>
      </h2>
    </div>
  );
}

function DroppableSection({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.key });
  return (
    <motion.section
      ref={setNodeRef}
      layout
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
      className={cn(
        "rounded-lg p-2 transition-colors",
        isOver && "bg-violet-500/5 ring-1 ring-violet-500/30",
      )}
    >
      {children}
    </motion.section>
  );
}

function EmptySectionPlaceholder({ section }: { section: Section }) {
  return (
    <div className="col-span-full text-center py-6 text-[11px] text-[var(--color-fg-subtle)] border border-dashed border-[var(--color-border)] rounded-lg">
      {section.estateId
        ? "Nessuna categoria collegata a questo immobile. Trascina qui una categoria o creane una nuova."
        : "Nessuna categoria. Trascina qui una categoria per metterla in questo gruppo."}
    </div>
  );
}

function SectionView({
  section,
  cats,
  countMap,
}: {
  section: Section;
  cats: CategoryRow[];
  countMap: Record<string, number>;
  mode: "active" | "archived";
}) {
  // SSR fallback: no arrows (vengono mostrati solo dopo mount)
  return (
    <section>
      <SectionHeader section={section} count={cats.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cats.length === 0 ? (
          <EmptySectionPlaceholder section={section} />
        ) : (
          cats.map((c) => {
            const cnt = countMap[c.id] ?? 0;
            return (
            <Card key={c.id} className="p-4">
              <CardContent className="space-y-0">
                <div className="flex items-center gap-3">
                  <span className="size-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-xl">
                    {c.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={
                          c.type === "income"
                            ? "income"
                            : c.type === "investment"
                              ? "invest"
                              : c.type === "transfer"
                                ? "neutral"
                                : "expense"
                        }
                      >
                        {c.type}
                      </Badge>
                      {cnt === 0 ? (
                        <span className="text-[11px] text-[var(--color-fg-subtle)]">{cnt} mov.</span>
                      ) : (
                        <Link
                          href={`/movimenti?cat=${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-colors"
                          title={`Apri i ${cnt} movimenti di "${c.name}" filtrati`}
                        >
                          {cnt} mov.
                          <ArrowUpRight className="size-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>
    </section>
  );
}

function SortableCard({
  cat,
  count,
  mode,
  allCategories,
  onLocalUpdate,
  onRemoveFromList,
}: {
  cat: CategoryRow;
  count: number;
  mode: "active" | "archived";
  allCategories: CategoryRow[];
  onLocalUpdate?: (patch: Partial<CategoryRow>) => void;
  onRemoveFromList?: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [emoji, setEmoji] = useState(cat.emoji);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    const newName = name.trim();
    const newEmoji = emoji.trim();
    if (!newName || !newEmoji) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName, emoji: newEmoji }),
      });
      if (res.ok) {
        onLocalUpdate?.({ name: newName, emoji: newEmoji });
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(cat.name);
    setEmoji(cat.emoji);
    setEditing(false);
  }

  async function toggleActive() {
    setBusy(true);
    try {
      const target = mode === "active" ? false : true;
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: target }),
      });
      if (res.ok) {
        onRemoveFromList?.();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteCat() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteOpen(false);
        onRemoveFromList?.();
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  const allForMerge = allCategories.map((c) => ({
    id: c.id,
    emoji: c.emoji,
    name: c.name,
    type: c.type,
    group: c.group,
    active: mode === "active",
  }));

  return (
    <div
      ref={setNodeRef}
      style={style}
      id={`cat-${cat.id}`}
      {...(editing ? {} : { ...attributes, ...listeners })}
      className={cn(
        "group rounded-2xl outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
        editing ? "" : "cursor-grab active:cursor-grabbing select-none",
        isDragging && "z-10 opacity-80 shadow-2xl",
      )}
      title={editing ? undefined : "Trascina per riordinare o spostare in altra sezione"}
    >
      <Card className="p-4 relative">
        {!editing && (
          <>
            <GripVertical className="absolute right-2 top-2 size-3 text-[var(--fg-subtle)] opacity-0 group-hover:opacity-60 pointer-events-none" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-7 top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
              title="Modifica categoria"
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleActive();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={busy}
              className="absolute right-12 top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-30"
              title={
                mode === "active"
                  ? "Archivia categoria (la nascondi dai picker, conservi storia)"
                  : "Riattiva categoria"
              }
            >
              {mode === "active" ? (
                <Archive className="size-3" />
              ) : (
                <ArchiveRestore className="size-3" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMergeOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-[68px] top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-violet-300 hover:bg-violet-500/10"
              title="Unisci con un'altra categoria (merge)"
            >
              <GitMerge className="size-3" />
            </button>
            {mode === "archived" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute right-[91px] top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-rose-400 hover:bg-rose-500/10"
                title="Elimina categoria definitivamente"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </>
        )}
        <CardContent className="space-y-0">
          <div
            className="flex items-center gap-3"
            onPointerDown={editing ? (e) => e.stopPropagation() : undefined}
          >
            {editing ? (
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                autoFocus
                className="size-10 rounded-xl bg-[var(--surface-2)] border border-violet-500/40 text-xl text-center focus:outline-none"
              />
            ) : (
              <span className="size-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-xl">
                {cat.emoji}
              </span>
            )}
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                    else if (e.key === "Escape") cancel();
                  }}
                  className="w-full h-7 bg-[var(--surface-2)] border border-violet-500/40 rounded px-2 text-sm font-medium focus:outline-none"
                />
              ) : (
                <div className="text-sm font-medium truncate">{cat.name}</div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={
                    cat.type === "income"
                      ? "income"
                      : cat.type === "investment"
                        ? "invest"
                        : cat.type === "transfer"
                          ? "neutral"
                          : "expense"
                  }
                >
                  {cat.type}
                </Badge>
                {editing || count === 0 ? (
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">{count} mov.</span>
                ) : (
                  <Link
                    href={`/movimenti?cat=${cat.id}`}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-colors"
                    title={`Apri i ${count} movimenti di "${cat.name}" filtrati`}
                  >
                    {count} mov.
                    <ArrowUpRight className="size-2.5" />
                  </Link>
                )}
              </div>
            </div>
            {editing && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={save}
                  disabled={saving}
                  className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400"
                >
                  <Check className="size-3" />
                </button>
                <button
                  onClick={cancel}
                  className="size-6 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)]"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <MergeCategoryDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        source={{
          id: cat.id,
          emoji: cat.emoji,
          name: cat.name,
          type: cat.type,
          group: cat.group,
          active: mode === "active",
        }}
        allCategories={allForMerge}
        txCount={count}
      />

      <AnimatePresence>
        {deleteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deleting && setDeleteOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Trash2 className="size-5 text-rose-400" />
                  Elimina categoria
                </h2>
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-2">
                  <span className="size-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-lg">
                    {cat.emoji}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{cat.name}</div>
                    <div className="text-[11px] text-[var(--color-fg-subtle)]">
                      {count} movimenti collegati
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs space-y-1.5"
                style={{ color: "var(--color-rose-text)" }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-medium">Operazione irreversibile</div>
                    <ul
                      className="list-disc list-inside text-[11px] space-y-0.5"
                      style={{ color: "var(--color-rose-text-soft)" }}
                    >
                      {count > 0 && (
                        <li>
                          {count} transazion{count === 1 ? "e" : "i"} perderann
                          {count === 1 ? "o" : "o"} l'etichetta categoria. Saldi conto invariati.
                        </li>
                      )}
                      <li>La categoria viene cancellata definitivamente dal database.</li>
                      <li>
                        Se vuoi conservare la storia, valuta <strong>Unisci</strong> verso un'altra
                        categoria invece.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={deleteCat}
                  disabled={deleting}
                  className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Cancello…" : "Elimina"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
