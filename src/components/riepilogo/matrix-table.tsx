"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatEUR, cn } from "@/lib/utils";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export type SubRow = {
  id: string;
  emoji: string;
  label: string;
  monthly: number[];
  total: number;
  href?: string;
};

export type GroupRow = {
  id: string;
  label: string;
  tone: "transfer" | "investments" | "estates" | "expense" | "income" | "neutral";
  collapsible: boolean;
  defaultExpanded: boolean;
  /** Monthly totals + grand total mostrati sulla header row (aggregato) */
  headerMonthly: number[];
  headerTotal: number;
  rows: SubRow[];
  /** Border separatrice forte sotto al gruppo (es. transfer in cima) */
  separateAfter?: boolean;
};

const TONE_TEXT: Record<GroupRow["tone"], string> = {
  transfer: "text-[var(--fg-muted)]",
  investments: "text-violet-300",
  estates: "text-amber-300",
  expense: "text-rose-400",
  income: "text-emerald-400",
  neutral: "",
};

const TONE_HEADER_BG: Record<GroupRow["tone"], string> = {
  transfer: "bg-[var(--surface-2)]/40",
  investments: "bg-violet-500/[0.06]",
  estates: "bg-amber-500/[0.06]",
  expense: "bg-[var(--surface-2)]/40",
  income: "bg-[var(--surface-2)]/40",
  neutral: "bg-[var(--surface-2)]/40",
};

function rowAmountColor(v: number, tone: GroupRow["tone"]): string {
  if (tone === "transfer") return "text-[var(--fg-muted)]";
  if (tone === "investments") return v === 0 ? "text-[var(--fg-subtle)]" : "text-violet-300";
  if (tone === "estates") {
    if (v === 0) return "text-[var(--fg-subtle)]";
    return v > 0 ? "text-emerald-400" : "text-rose-400";
  }
  if (v === 0) return "text-[var(--fg-subtle)]";
  return v > 0 ? "text-emerald-400" : "text-rose-400";
}

export function MatrixTable({
  groups,
  monthlyTotals,
  grandTotal,
}: {
  groups: GroupRow[];
  monthlyTotals: number[];
  grandTotal: number;
}) {
  // Stato per ogni gruppo collapsible
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) {
      if (g.collapsible) init[g.id] = g.defaultExpanded;
    }
    return init;
  });

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-[var(--fg-subtle)] border-b border-[var(--border)]">
            <th className="px-3 py-3 text-left font-medium sticky left-0 bg-[var(--surface)] z-10 min-w-[220px]">
              Categoria
            </th>
            {MONTHS.map((m) => (
              <th key={m} className="px-2 py-3 text-right font-medium tabular-nums">
                {m}
              </th>
            ))}
            <th className="px-3 py-3 text-right font-medium">Totale</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isExpanded = g.collapsible ? expanded[g.id] : true;
            const headerBgClass = TONE_HEADER_BG[g.tone];
            const headerTextClass =
              g.tone === "transfer"
                ? "text-[var(--fg-muted)]"
                : g.tone === "investments"
                  ? "text-violet-300"
                  : g.tone === "estates"
                    ? "text-amber-300"
                    : "text-[var(--fg-muted)]";

            return (
              <GroupRows
                key={g.id}
                group={g}
                isExpanded={!!isExpanded}
                onToggle={() => toggle(g.id)}
                headerBgClass={headerBgClass}
                headerTextClass={headerTextClass}
              />
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-[var(--border-strong)] bg-[var(--surface-2)]/60">
            <td className="px-3 py-3 font-medium sticky left-0 bg-[var(--surface-2)]/95 z-10">
              Netto
            </td>
            {monthlyTotals.map((v, i) => (
              <td
                key={i}
                className={cn(
                  "px-2 py-3 text-right tabular-nums text-xs font-medium",
                  v > 0 && "text-emerald-400",
                  v < 0 && "text-rose-400",
                )}
              >
                {v === 0 ? "—" : formatEUR(v, { compact: true })}
              </td>
            ))}
            <td
              className={cn(
                "px-3 py-3 text-right tabular-nums font-semibold",
                grandTotal >= 0 ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {formatEUR(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  isExpanded,
  onToggle,
  headerBgClass,
  headerTextClass,
}: {
  group: GroupRow;
  isExpanded: boolean;
  onToggle: () => void;
  headerBgClass: string;
  headerTextClass: string;
}) {
  const headerHasAmount = group.headerTotal !== 0 || group.headerMonthly.some((v) => v !== 0);

  return (
    <>
      <tr
        className={cn(
          headerBgClass,
          group.collapsible && "cursor-pointer hover:bg-[var(--surface-2)]/70 transition-colors",
          group.separateAfter && !isExpanded && "border-b-2 border-[var(--border-strong)]",
        )}
        onClick={group.collapsible ? onToggle : undefined}
      >
        <td
          className={cn(
            "px-3 py-2 font-medium text-xs uppercase tracking-wider sticky left-0 z-10",
            headerBgClass.replace("/[0.06]", "/[0.95]").replace("/40", "/95"),
            headerTextClass,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            {group.collapsible && (
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            )}
            {group.label}
          </span>
        </td>
        {group.headerMonthly.map((v, i) => (
          <td
            key={i}
            className={cn(
              "px-2 py-2 text-right tabular-nums text-xs font-medium",
              rowAmountColor(v, group.tone),
            )}
          >
            {v === 0 ? "—" : formatEUR(v, { compact: true })}
          </td>
        ))}
        <td
          className={cn(
            "px-3 py-2 text-right tabular-nums text-xs font-semibold",
            !headerHasAmount && "text-[var(--fg-subtle)]",
            headerHasAmount && rowAmountColor(group.headerTotal, group.tone),
          )}
        >
          {!headerHasAmount ? "—" : formatEUR(group.headerTotal, { compact: true })}
        </td>
      </tr>

      {isExpanded &&
        group.rows.map((r, idx) => {
          const isLast = idx === group.rows.length - 1;
          const labelCell = (
            <span className="inline-flex items-center gap-2">
              <span>{r.emoji}</span>
              <span className="text-xs">{r.label}</span>
            </span>
          );
          return (
            <tr
              key={r.id}
              className={cn(
                "border-b border-[var(--border)]/50",
                group.separateAfter && isLast && "border-b-2 border-[var(--border-strong)]",
              )}
            >
              <td className="px-3 py-2 sticky left-0 bg-[var(--bg)]/95 z-10">
                {r.href ? (
                  <Link
                    href={r.href}
                    className="hover:text-violet-300 transition-colors"
                  >
                    {labelCell}
                  </Link>
                ) : (
                  labelCell
                )}
              </td>
              {r.monthly.map((v, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-2 py-2 text-right tabular-nums text-xs",
                    rowAmountColor(v, group.tone),
                  )}
                >
                  {v === 0 ? "—" : formatEUR(v, { compact: true })}
                </td>
              ))}
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums text-xs font-medium",
                  rowAmountColor(r.total, group.tone),
                )}
              >
                {r.total === 0 ? "—" : formatEUR(r.total, { compact: true })}
              </td>
            </tr>
          );
        })}
    </>
  );
}
