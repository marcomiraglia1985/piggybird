import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatEUR, formatMonth } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function MonthSummary({
  income,
  expense,
  date,
}: {
  income: number;
  expense: number;
  date: Date;
}) {
  const net = income + expense;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mese corrente</CardTitle>
        <span className="text-xs text-[var(--color-fg-subtle)] capitalize">{formatMonth(date)}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mb-1.5">
              <ArrowUpRight className="size-3.5" />
              Entrate
            </div>
            <div className="text-xl font-semibold tabular-nums">{formatEUR(income)}</div>
          </div>
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium mb-1.5">
              <ArrowDownRight className="size-3.5" />
              Uscite
            </div>
            <div className="text-xl font-semibold tabular-nums">{formatEUR(expense)}</div>
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
          <span className="text-sm text-[var(--color-fg-muted)]">Netto</span>
          <span className={`text-lg font-semibold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {net >= 0 ? "+" : ""}{formatEUR(net)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
