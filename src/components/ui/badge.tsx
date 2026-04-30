import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type BadgeVariant = "default" | "income" | "expense" | "invest" | "savings" | "neutral";

const variants: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-surface-2)] text-[var(--color-fg)] border-[var(--color-border)]",
  income: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  expense: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  invest: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  savings: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  neutral: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
