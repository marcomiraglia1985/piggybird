"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 6;

export function YearTabs({
  years,
  currentYear,
}: {
  years: number[];
  currentYear: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const buildHref = (y: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("year", y.toString());
    return `${pathname}?${next.toString()}`;
  };
  // Window start: indice del primo anno visibile in `years` desc.
  // Calcolo iniziale: se l'anno corrente è dentro i primi MAX_VISIBLE, parto da 0.
  // Se è più indietro (anno passato selezionato), centro la finestra su di esso.
  const initialStart = (() => {
    const idx = years.indexOf(currentYear);
    if (idx < 0 || idx < MAX_VISIBLE) return 0;
    return Math.max(0, Math.min(years.length - MAX_VISIBLE, idx - Math.floor(MAX_VISIBLE / 2)));
  })();
  const [start, setStart] = useState(initialStart);

  const visible = years.slice(start, start + MAX_VISIBLE);
  const canGoNewer = start > 0;
  const canGoOlder = start + MAX_VISIBLE < years.length;

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
      {canGoNewer && (
        <button
          type="button"
          onClick={() => setStart((s) => Math.max(0, s - 1))}
          className="px-1 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)] rounded-md"
          title="Anni più recenti"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      )}
      {visible.map((y) => (
        <Link
          key={y}
          href={buildHref(y)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-colors",
            currentYear === y
              ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
              : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          {y}
        </Link>
      ))}
      {canGoOlder && (
        <button
          type="button"
          onClick={() => setStart((s) => Math.min(years.length - MAX_VISIBLE, s + 1))}
          className="px-1 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)] rounded-md"
          title="Anni più vecchi"
        >
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
