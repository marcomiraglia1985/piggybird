"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, formatDate } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { useWidgetSettings } from "@/lib/widget-settings";
import { WidgetSettingsPopover } from "./widget-settings-popover";

type Tx = {
  id: string;
  date: string;
  amount: number;
  beneficiary: string | null;
  notes: string | null;
  isJoint: boolean;
  accountId: string;
  account: { name: string; emoji: string | null };
  category: { emoji: string; name: string } | null;
};

type AccountOpt = { id: string; name: string; emoji: string | null };

type Settings = { limit: number; accountId: string | null };
const DEFAULTS: Settings = { limit: 8, accountId: null };
const LIMIT_OPTIONS = [5, 8, 10, 15, 25];

export function RecentTransactions({
  transactions,
  accounts,
}: {
  transactions: Tx[];
  accounts: AccountOpt[];
}) {
  const [opts, setOpts, reset] = useWidgetSettings("recent-tx", DEFAULTS);

  const filtered = useMemo(() => {
    let list = transactions;
    if (opts.accountId) list = list.filter((t) => t.accountId === opts.accountId);
    return list.slice(0, opts.limit);
  }, [transactions, opts.accountId, opts.limit]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimenti recenti</CardTitle>
        <div className="flex items-center gap-1">
          <WidgetSettingsPopover title="Movimenti recenti" onReset={reset}>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Quanti mostrarne
              </label>
              <div className="flex flex-wrap gap-1">
                {LIMIT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setOpts({ limit: n })}
                    className={`h-7 px-2.5 rounded border text-xs ${
                      opts.limit === n
                        ? "border-violet-500/50 bg-violet-500/10 text-[var(--color-violet-text)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Conto
              </label>
              <select
                value={opts.accountId ?? ""}
                onChange={(e) => setOpts({ accountId: e.target.value || null })}
                className="w-full h-8 rounded bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs focus:outline-none focus:border-violet-500/50"
              >
                <option value="">Tutti i conti</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji ?? "💳"} {a.name}
                  </option>
                ))}
              </select>
            </div>
          </WidgetSettingsPopover>
          <Link
            href={
              opts.accountId
                ? `/movimenti?account=${opts.accountId}`
                : "/movimenti"
            }
            className="inline-flex items-center gap-1 text-xs text-[var(--color-fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            Tutti <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)] py-4 text-center">
            Nessun movimento per i filtri attuali.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]/60 -mx-1">
            {filtered.map((t) => {
              const positive = t.amount > 0;
              return (
                <li key={t.id} className="flex items-center gap-3 px-1 py-2.5">
                  <span className="size-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-base shrink-0">
                    {t.category?.emoji ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">
                        {t.beneficiary || t.notes || t.category?.name || "—"}
                      </span>
                      {t.isJoint && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Cointestato
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-fg-subtle)]">
                      {formatDate(t.date, { day: "numeric", month: "short" })} · {t.account.name}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-medium tabular-nums shrink-0 ${
                      positive ? "text-emerald-400" : "text-[var(--color-fg)]"
                    }`}
                  >
                    {positive ? "+" : ""}{formatEUR(t.amount)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
