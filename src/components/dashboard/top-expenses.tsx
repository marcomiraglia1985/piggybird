import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/utils";

type ExpenseRow = {
  category: { id: string; emoji: string; name: string; group: string } | null;
  amount: number;
};

export function TopExpenses({ rows }: { rows: ExpenseRow[] }) {
  const total = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top spese del mese</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-fg-subtle)] py-4">
            Ancora nessuna spesa questo mese.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              if (!r.category) return null;
              const amount = Math.abs(r.amount);
              const pct = total > 0 ? (amount / total) * 100 : 0;
              return (
                <li key={r.category.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base">{r.category.emoji}</span>
                      <span className="text-sm truncate">{r.category.name}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      −{formatEUR(amount)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500/70 to-pink-500/40"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
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
