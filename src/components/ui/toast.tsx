"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms di permanenza (default 3500). null = sticky finché non viene chiuso. */
  duration?: number | null;
};

type Toast = ToastInput & { id: string };

type ToastFn = (input: ToastInput | string) => string;

type ToastContextValue = {
  toast: ToastFn;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() richiede <ToastProvider>.");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((input) => {
    const data: ToastInput =
      typeof input === "string" ? { title: input } : input;
    const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...data, id }]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed z-50 right-4 bottom-4 flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const variant = toast.variant ?? "success";
  useEffect(() => {
    if (toast.duration === null) return;
    const ms = toast.duration ?? 3500;
    const id = setTimeout(onDismiss, ms);
    return () => clearTimeout(id);
  }, [toast.duration, onDismiss]);

  const Icon =
    variant === "success" ? CheckCircle2 : variant === "error" ? AlertTriangle : Info;
  const accentClass =
    variant === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : variant === "error"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
        : "border-violet-500/40 bg-violet-500/10 text-violet-400";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      role="status"
      className="pointer-events-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl p-3 flex items-start gap-3"
    >
      <div
        className={cn(
          "size-8 rounded-lg border flex items-center justify-center shrink-0",
          accentClass,
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{toast.title}</div>
        {toast.description && (
          <div className="text-[11px] text-[var(--fg-muted)] mt-0.5">
            {toast.description}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="size-6 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
        aria-label="Chiudi notifica"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}
