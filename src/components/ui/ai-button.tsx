"use client";

import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Bottone "AI Powered" standardizzato per tutta la app.
 *
 * Identità visiva: gradient warm sunset (amber→orange→rose) che richiama
 * l'icona Moneybird (lovebird+maialino).
 *
 * Animazioni:
 *   - Hover: gradient lentamente fluttua + shimmer luminoso attraversa
 *     il bottone + l'icona Sparkles "twinkle" (rotazione + scale)
 *   - Hover + mouse move: spotlight scuro radiale segue il cursore
 *   - Click: scale pulse + burst ring radiale → sensazione "AI attivata"
 *
 * Filosofia: SEMPRE on-demand, click-to-trigger, riconoscibile, identico
 * ovunque venga usato.
 */

type Variant = "default" | "subtle" | "icon";
type Size = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: Variant;
  size?: Size;
  /** Tooltip per la variant "icon" (sempre richiesto per accessibility) */
  tooltip?: string;
  children?: ReactNode;
};

export function AIButton({
  loading,
  variant = "default",
  size = "md",
  tooltip,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const [activated, setActivated] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    setActivated(true);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setActivated(false), 700);
    onClick?.(e);
  }

  // Spotlight tracking via CSS vars on DOM (no React re-render per mousemove)
  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    btn.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  const base = cn(
    "ai-btn relative inline-flex items-center gap-1.5 font-medium transition-all overflow-hidden",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:[animation:none]",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
    activated && "ai-btn-activated",
  );

  const sizeClasses =
    size === "sm"
      ? "h-9 px-3 text-xs rounded-lg"
      : "h-10 px-4 text-sm rounded-lg";

  const variantClasses =
    variant === "default"
      ? "ai-btn-default bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-md shadow-orange-500/25 hover:shadow-orange-500/45"
      : variant === "subtle"
        ? "ai-btn-subtle bg-gradient-to-br from-amber-500/[0.08] via-orange-500/[0.10] to-rose-500/[0.10] border border-orange-500/30 text-orange-300 hover:border-orange-500/50"
        : ""; // "icon" — vedi sotto

  if (variant === "icon") {
    return (
      <button
        ref={btnRef}
        type="button"
        disabled={isDisabled}
        title={tooltip}
        aria-label={tooltip ?? "AI action"}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        className={cn(
          base,
          "ai-btn-subtle size-7 inline-flex items-center justify-center rounded-md",
          "bg-orange-500/10 border border-orange-500/30 text-orange-300",
          "hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-200",
          className,
        )}
        {...rest}
      >
        <span className="ai-spotlight" aria-hidden />
        {loading ? (
          <Loader2 className="size-3.5 animate-spin relative z-10" />
        ) : (
          <Sparkles className="ai-sparkle size-3.5 relative z-10" />
        )}
      </button>
    );
  }

  return (
    <button
      ref={btnRef}
      type="button"
      disabled={isDisabled}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      className={cn(base, sizeClasses, variantClasses, className)}
      {...rest}
    >
      <span className="ai-spotlight" aria-hidden />
      {loading ? (
        <Loader2 className="size-3.5 animate-spin relative z-10" />
      ) : (
        <Sparkles className="ai-sparkle size-3.5 relative z-10" />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

/**
 * Badge "AI Powered" (label only, non-interactive).
 * Stessa identità del bottone, ma senza animazioni hover/click.
 */
export function AIBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-gradient-to-br from-amber-500/10 via-orange-500/[0.12] to-rose-500/[0.10] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-orange-300",
        className,
      )}
    >
      <Sparkles className="size-2.5" />
      AI Powered
    </span>
  );
}
