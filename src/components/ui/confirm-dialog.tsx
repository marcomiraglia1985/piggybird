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
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" usa accenti rose per azioni distruttive (cancellazioni). */
  variant?: "default" | "danger";
};

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm() richiede <ConfirmProvider> nel tree.");
  }
  return ctx;
}

type DialogState = ConfirmOptions & { resolve: (answer: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const options: ConfirmOptions =
      typeof opts === "string" ? { title: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (answer: boolean) => {
      setState((prev) => {
        if (!prev) return null;
        prev.resolve(answer);
        return null;
      });
    },
    [],
  );

  // ESC = cancel, Enter = conferma. Cattura solo quando il dialog è aperto.
  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const isDanger = state?.variant === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => close(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "size-10 rounded-xl border flex items-center justify-center shrink-0",
                    isDanger
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  )}
                >
                  <AlertTriangle className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    id="confirm-dialog-title"
                    className="text-base font-semibold tracking-tight"
                  >
                    {state.title}
                  </h2>
                  {state.description && (
                    <div className="text-sm text-[var(--fg-muted)] mt-1.5 whitespace-pre-line">
                      {state.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="h-9 px-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-sm hover:border-[var(--border-strong)]"
                >
                  {state.cancelLabel ?? "Annulla"}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  autoFocus
                  className={cn(
                    "h-9 px-4 rounded-lg text-sm font-medium",
                    isDanger
                      ? "bg-rose-500 text-white hover:bg-rose-600"
                      : "bg-violet-500 text-white hover:bg-violet-600",
                  )}
                >
                  {state.confirmLabel ?? "Conferma"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
