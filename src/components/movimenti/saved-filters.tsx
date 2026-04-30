"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Filter = {
  id: string;
  name: string;
  emoji: string | null;
  query: string;
};

export function SavedFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");

  async function load() {
    const r = await fetch("/api/saved-filters");
    const j = await r.json();
    setFilters(j.filters ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  // Filtri attivi sono salvabili solo se ci sono parametri
  const hasActiveFilters =
    params.toString().length > 0 &&
    [...params.keys()].some((k) => ["year", "account", "cat", "q"].includes(k));

  async function save() {
    if (!name.trim()) return;
    const cleaned = new URLSearchParams();
    for (const k of ["year", "account", "cat", "q"]) {
      const v = params.get(k);
      if (v) cleaned.set(k, v);
    }
    await fetch("/api/saved-filters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        emoji: emoji.trim() || null,
        query: cleaned.toString(),
      }),
    });
    setNaming(false);
    setName("");
    setEmoji("");
    load();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Eliminare questo filtro salvato?", confirmLabel: "Elimina", variant: "danger" }))) return;
    await fetch(`/api/saved-filters/${id}`, { method: "DELETE" });
    load();
  }

  function applyFilter(f: Filter) {
    router.push(`${pathname}?${f.query}`);
  }

  if (filters.length === 0 && !hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const isActive = f.query === params.toString();
        return (
          <div
            key={f.id}
            className={`inline-flex items-center gap-1 rounded-full border text-xs h-7 pl-2.5 pr-1 ${
              isActive
                ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                : "bg-[var(--surface)] border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
            }`}
          >
            <button onClick={() => applyFilter(f)} className="inline-flex items-center gap-1">
              {f.emoji && <span>{f.emoji}</span>}
              <span>{f.name}</span>
            </button>
            <button
              onClick={() => remove(f.id)}
              className="size-5 inline-flex items-center justify-center rounded hover:bg-rose-500/20 text-[var(--fg-subtle)] hover:text-rose-400"
              title="Elimina filtro"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      {hasActiveFilters && !naming && (
        <button
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs hover:bg-violet-500/20"
        >
          <BookmarkPlus className="size-3" />
          Salva filtri attuali
        </button>
      )}
      {naming && (
        <div className="inline-flex items-center gap-1 h-7 rounded-full bg-[var(--surface)] border border-[var(--border)] pl-1 pr-1">
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🔥"
            maxLength={4}
            className="w-8 h-6 rounded text-center text-xs bg-transparent focus:outline-none"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              else if (e.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            placeholder="Nome filtro"
            autoFocus
            className="h-6 px-2 text-xs bg-transparent focus:outline-none w-32"
          />
          <button
            onClick={save}
            disabled={!name.trim()}
            className="size-5 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 disabled:opacity-50"
          >
            <Bookmark className="size-3" />
          </button>
          <button
            onClick={() => {
              setNaming(false);
              setName("");
              setEmoji("");
            }}
            className="size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)]"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
