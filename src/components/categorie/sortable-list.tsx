"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GripVertical, Pencil, Check, X, Archive, ArchiveRestore, GitMerge, Trash2, AlertTriangle, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MergeCategoryDialog } from "./merge-dialog";
import { useToast } from "@/components/ui/toast";

type Category = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  type: string;
  displayOrder: number;
};

type AllCategory = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  type: string;
  active: boolean;
};

export function CategorieSortableList({
  initial,
  countMap,
  mode = "active",
  allCategories = [],
}: {
  initial: Category[];
  countMap: Record<string, number>;
  mode?: "active" | "archived";
  allCategories?: AllCategory[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Sync items quando il server rinvia nuove `initial` (es. dopo router.refresh()
  // post-edit/rename). Senza questo lo state interno resta sul snapshot iniziale.
  useEffect(() => {
    setItems(initial);
  }, [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    const res = await fetch("/api/categories/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: next.map((i) => i.id) }),
    });
    if (res.ok) {
      toast({ title: "Ordine categorie salvato", variant: "success", duration: 2000 });
    } else {
      toast({ title: "Errore nel salvare l'ordine", variant: "error" });
    }
    router.refresh();
  }

  // SSR fallback: render statico senza dnd-kit (gli aria-describedby numerati
  // di useSortable causano hydration mismatch con N contesti). Dopo mount,
  // attiva drag-drop.
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((c) => (
          <StaticItem key={c.id} cat={c} count={countMap[c.id] ?? 0} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((c) => (
            <SortableItem
              key={c.id}
              cat={c}
              count={countMap[c.id] ?? 0}
              mode={mode}
              allCategories={allCategories}
              onRemoveFromList={() =>
                setItems((prev) => prev.filter((p) => p.id !== c.id))
              }
              onLocalUpdate={(patch) =>
                setItems((prev) => prev.map((p) => (p.id === c.id ? { ...p, ...patch } : p)))
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function StaticItem({ cat, count }: { cat: Category; count: number }) {
  return (
    <Card className="p-4 relative">
      <CardContent className="space-y-0">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-xl">
            {cat.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{cat.name}</div>
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
              <span className="text-[11px] text-[var(--color-fg-subtle)]">{count} mov.</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableItem({
  cat,
  count,
  mode,
  allCategories,
  onLocalUpdate,
  onRemoveFromList,
}: {
  cat: Category;
  count: number;
  mode: "active" | "archived";
  allCategories: AllCategory[];
  onLocalUpdate?: (patch: Partial<Category>) => void;
  onRemoveFromList?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [emoji, setEmoji] = useState(cat.emoji);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        // La card non appartiene più a questa view
        onRemoveFromList?.();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const newName = name.trim();
    const newEmoji = emoji.trim();
    if (!newName || !newEmoji) {
      setSaveError("Nome ed emoji sono obbligatori");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName, emoji: newEmoji }),
      });
      if (res.ok) {
        onLocalUpdate?.({ name: newName, emoji: newEmoji });
        setEditing(false);
        setSaveError(null);
        toast({ title: `Categoria "${newName}" aggiornata`, variant: "success" });
        router.refresh();
      } else {
        const j = await res.json().catch(() => null);
        setSaveError(j?.error ?? `Errore (${res.status})`);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(cat.name);
    setEmoji(cat.emoji);
    setSaveError(null);
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(editing ? {} : { ...attributes, ...listeners })}
      className={`group ${editing ? "" : "cursor-grab active:cursor-grabbing select-none"} ${isDragging ? "z-10 opacity-80 shadow-2xl" : ""}`}
      title={editing ? undefined : "Trascina per riordinare"}
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
          <div className="flex items-center gap-3" onPointerDown={editing ? (e) => e.stopPropagation() : undefined}>
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
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">
                    {count} mov.
                  </span>
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
                  className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 disabled:opacity-50"
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
          {editing && saveError && (
            <div className="mt-2 text-[11px] text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
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
        allCategories={allCategories}
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

              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-300 space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-medium">Operazione irreversibile</div>
                    <ul className="list-disc list-inside text-[11px] text-rose-200/90 space-y-0.5">
                      {count > 0 && (
                        <li>
                          {count} transazion{count === 1 ? "e" : "i"} perderann{count === 1 ? "o" : "o"} l'etichetta categoria (categoryId &rarr; null). Saldi conto invariati.
                        </li>
                      )}
                      <li>
                        La categoria viene cancellata definitivamente dal database.
                      </li>
                      <li>
                        Se vuoi conservare la storia, valuta <strong>Unisci</strong> verso un'altra categoria invece.
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
