"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";
import { useMemo } from "react";
import { useWidgetSettings } from "@/lib/widget-settings";
import { WidgetSettingsPopover } from "./widget-settings-popover";

type Account = {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  currentBalance: number;
  ownershipShare: number;
  displayOrder?: number;
};

const TYPE_LABEL: Record<string, string> = {
  liquid: "Liquidità",
  savings: "Risparmi",
  cash: "Contante",
  joint: "Cointestato",
  investment: "Investimenti",
  credit: "Crediti",
};

type SortKey = "displayOrder" | "alpha" | "balanceDesc" | "balanceAsc";
type Settings = { sort: SortKey };
const DEFAULTS: Settings = { sort: "displayOrder" };

const SORT_LABEL: Record<SortKey, string> = {
  displayOrder: "Ordine personalizzato (come /conti)",
  alpha: "Alfabetico",
  balanceDesc: "Saldo: dal più alto",
  balanceAsc: "Saldo: dal più basso",
};

function shareLabel(share: number): string | null {
  if (share >= 1) return null;
  // Common fractions
  if (Math.abs(share - 2 / 3) < 0.01) return "2/3";
  if (Math.abs(share - 1 / 2) < 0.01) return "1/2";
  if (Math.abs(share - 1 / 3) < 0.01) return "1/3";
  return `${(share * 100).toFixed(0)}%`;
}

export function AccountsList({ accounts }: { accounts: Account[] }) {
  const [opts, setOpts, reset] = useWidgetSettings("accounts-list", DEFAULTS);
  const sorted = useMemo(() => {
    const arr = [...accounts];
    switch (opts.sort) {
      case "alpha":
        arr.sort((a, b) => a.name.localeCompare(b.name, "it"));
        break;
      case "balanceDesc":
        arr.sort(
          (a, b) => b.currentBalance * b.ownershipShare - a.currentBalance * a.ownershipShare,
        );
        break;
      case "balanceAsc":
        arr.sort(
          (a, b) => a.currentBalance * a.ownershipShare - b.currentBalance * b.ownershipShare,
        );
        break;
      default:
        arr.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }
    return arr;
  }, [accounts, opts.sort]);
  const totalEffective = sorted.reduce((s, a) => s + a.currentBalance * a.ownershipShare, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conti</CardTitle>
        <div className="flex items-center gap-1">
          <WidgetSettingsPopover title="Conti" onReset={reset}>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Ordina per
              </label>
              <div className="space-y-1">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOpts({ sort: key })}
                    className={`w-full text-left px-2 py-1.5 rounded border text-xs ${
                      opts.sort === key
                        ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {SORT_LABEL[key]}
                  </button>
                ))}
              </div>
            </div>
          </WidgetSettingsPopover>
          <span className="text-xs text-[var(--fg-subtle)]">{sorted.length} attivi</span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {sorted.map((a) => {
            const effective = a.currentBalance * a.ownershipShare;
            const pct = totalEffective > 0 ? (effective / totalEffective) * 100 : 0;
            const share = shareLabel(a.ownershipShare);
            return (
              <li key={a.id} className="group">
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-base shrink-0">
                      {a.emoji ?? "💳"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">{a.name}</span>
                        {share && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium shrink-0">
                            {share}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--fg-subtle)] uppercase tracking-wider">
                        {TYPE_LABEL[a.type] ?? a.type}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums">
                      {formatEUR(effective, { compact: effective > 999 })}
                    </div>
                    {share && (
                      <div className="text-[10px] text-[var(--fg-subtle)] tabular-nums">
                        di {formatEUR(a.currentBalance, { compact: true })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500/60 to-indigo-500/40"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
