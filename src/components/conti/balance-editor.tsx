"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X, AlertTriangle, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatEUR, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

export function BalanceEditor({
  accountId,
  initialBalance,
  ownershipShare,
  locked = false,
}: {
  accountId: string;
  initialBalance: number;
  ownershipShare: number;
  /** Quando true (saldi live), l'editor è disabilitato e mostra un hint. */
  locked?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialBalance.toString());
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const effective = initialBalance * ownershipShare;

  async function save() {
    const num = parseFloat(value.replace(",", "."));
    if (!isFinite(num)) {
      setEditing(false);
      setValue(initialBalance.toString());
      return;
    }
    if (Math.abs(num - initialBalance) < 0.001) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentBalance: num }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast({
          title: "Saldo non aggiornato",
          description: j?.error ?? "Errore di salvataggio.",
          variant: "error",
        });
        throw new Error("save failed");
      }
      const j = await res.json().catch(() => null);
      const delta = num - initialBalance;
      toast({
        title: `Saldo aggiornato: ${formatEUR(num)}`,
        description: j?.adjustmentTx
          ? `Movimento di rettifica creato (${delta >= 0 ? "+" : ""}${formatEUR(delta)}).`
          : undefined,
        variant: "success",
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      setEditing(false);
      router.refresh();
    } catch {
      setValue(initialBalance.toString());
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(initialBalance.toString());
    setEditing(false);
  }

  if (editing) {
    const numValue = parseFloat(value.replace(",", "."));
    const delta = isFinite(numValue) ? numValue - initialBalance : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              else if (e.key === "Escape") cancel();
            }}
            className="text-2xl font-semibold tabular-nums bg-[var(--surface-2)] border border-violet-500/50 rounded-md px-2 py-0.5 w-40 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={saving}
            className="size-7 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            title="Salva (Invio)"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="size-7 inline-flex items-center justify-center rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            title="Annulla (Esc)"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {Math.abs(delta) > 0.001 && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400 max-w-xs">
            <AlertTriangle className="size-3 mt-0.5 shrink-0" />
            <span>
              Verrà creato un movimento di rettifica{" "}
              <span className="font-semibold tabular-nums">
                {delta > 0 ? "+" : ""}
                {formatEUR(delta)}
              </span>{" "}
              💸 Unknown
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={() => !locked && setEditing(true)}
        disabled={locked}
        title={
          locked
            ? "Saldi live: il valore si aggiorna dai movimenti. Per modificare a mano, switcha su 'Conti congelati' in alto."
            : undefined
        }
        className={cn(
          "text-2xl font-semibold tabular-nums rounded-md px-2 py-0.5 -mx-2 transition-colors text-left inline-flex items-center gap-1.5",
          locked
            ? "cursor-not-allowed opacity-90"
            : "hover:bg-[var(--surface-2)]",
        )}
      >
        {formatEUR(effective)}
        {locked ? (
          <Lock className="size-3 text-[var(--color-fg-subtle)] -translate-y-1.5" />
        ) : (
          <Pencil className="size-3 opacity-0 group-hover:opacity-50 -translate-y-1.5 transition-opacity" />
        )}
      </button>
      <AnimatePresence>
        {justSaved && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -right-7 top-1.5"
          >
            <Check className="size-4 text-emerald-400" />
          </motion.span>
        )}
      </AnimatePresence>
      {ownershipShare < 1 && (
        <div className="text-[11px] text-[var(--fg-subtle)] tabular-nums mt-0.5">
          Saldo conto: {formatEUR(initialBalance)}
        </div>
      )}
    </div>
  );
}
