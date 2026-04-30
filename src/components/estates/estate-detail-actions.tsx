"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Link2, ArrowUpRight } from "lucide-react";
import { AddEstateDialog, type EstateEditInput } from "./add-estate-dialog";

export function EstateDetailActions({ estate }: { estate: EstateEditInput }) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        href={`/movimenti?assignTo=${estate.id}`}
        className="group inline-flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border border-violet-500/30 text-xs font-medium text-violet-300 hover:from-violet-500/[0.18] hover:to-indigo-500/[0.10] hover:border-violet-500/50 hover:text-violet-200 transition-colors"
      >
        <span className="size-5 inline-flex items-center justify-center rounded-md bg-violet-500/20 border border-violet-500/30">
          <Link2 className="size-3" />
        </span>
        Assegna movimenti
        <ArrowUpRight className="size-3.5 text-violet-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </Link>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        title="Modifica immobile"
        className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-border-strong)] transition-colors"
      >
        <Pencil className="size-3.5" />
        Modifica
      </button>
      <AddEstateDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        estate={estate}
      />
    </div>
  );
}
