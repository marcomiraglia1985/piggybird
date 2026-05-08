"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Fragment, useTransition, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useCategoryGroups } from "@/lib/category-groups";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Check,
  ChevronDown,
  CalendarClock,
  Pencil,
  Trash2,
  Repeat,
  CheckSquare,
} from "lucide-react";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { CategoryPicker } from "./category-picker";
import { EditEntrataDialog } from "./edit-entrata-dialog";
import { SavedFilters } from "./saved-filters";

type Tx = {
  id: string;
  date: Date;
  amount: number;
  beneficiary: string | null;
  notes: string | null;
  transferGroupId?: string | null;
  transferCounterpart?: { name: string; emoji: string | null } | null;
  recurrenceGroupId?: string | null;
  confirmed: boolean;
  account: { id: string; name: string; emoji: string | null; type: string };
  category: { id: string; emoji: string; name: string } | null;
  estateId?: string | null;
  estate?: { id: string; name: string; emoji: string | null } | null;
};

type Account = { id: string; name: string; type: string; emoji: string | null };
type Category = {
  id: string;
  emoji: string;
  name: string;
  group: string;
  estateId?: string | null;
  displayOrder?: number;
  active?: boolean;
};
type Estate = { id: string; name: string; emoji: string | null };

export function TransactionsTable({
  transactions,
  accounts,
  categories,
  estates,
  years,
  filters,
  totalCount,
  currentLimit,
  pageSize,
  assignToEstateId,
}: {
  transactions: Tx[];
  accounts: Account[];
  categories: Category[];
  estates: Estate[];
  years: number[];
  filters: { year?: number; accountId?: string; categoryId?: string; q?: string };
  totalCount: number;
  currentLimit: number;
  pageSize: number;
  assignToEstateId?: string;
}) {
  const assignToEstate = assignToEstateId
    ? estates.find((e) => e.id === assignToEstateId) ?? null
    : null;

  // Raggruppa le cat secondo l'ordine personalizzato dell'utente da
  // /categorie (estates prima, poi macro-aree). Usate dal bulk-edit select
  // e dal CategoryPicker per coerenza UX.
  const categoryGroups = useCategoryGroups(categories, estates);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(filters.q ?? "");

  // Local override per modifiche inline (optimistic). Mappa txId -> categoryId attesa.
  const [localCat, setLocalCat] = useState<Map<string, string | null>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [showFuture, setShowFuture] = useState(false);
  const [editingTx, setEditingTx] = useState<Tx | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(!!assignToEstate);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [bulkAccountId, setBulkAccountId] = useState<string>("");
  const [bulkEstateId, setBulkEstateId] = useState<string>("");

  function toggleSel(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function applyBulk(field: "categoryId" | "accountId" | "estateId", value: string | null) {
    if (selected.size === 0) return;
    setBulkApplying(true);
    try {
      await fetch("/api/transactions/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected], data: { [field]: value } }),
      });
      setSelected(new Set());
      setBulkCategoryId("");
      setBulkAccountId("");
      setBulkEstateId("");
      router.refresh();
    } finally {
      setBulkApplying(false);
    }
  }

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBulkApplying(true);
    try {
      await fetch("/api/transactions/bulk", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      setSelected(new Set());
      setBulkDeleteOpen(false);
      router.refresh();
    } finally {
      setBulkApplying(false);
    }
  }
  const [confirmingTx, setConfirmingTx] = useState<Tx | null>(null);
  const [confirmingSaving, setConfirmingSaving] = useState(false);
  const [deletingTx, setDeletingTx] = useState<Tx | null>(null);
  const [deletingSaving, setDeletingSaving] = useState(false);

  async function deleteTx(
    t: Tx,
    scope: "single" | "fromThis" | "wholeRecurrence" = "single",
  ) {
    setDeletingSaving(true);
    try {
      if (scope === "fromThis" && t.recurrenceGroupId) {
        // Cancella tx cliccata + tutte le successive (anche se scadute).
        const d = new Date(t.date);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const res = await fetch(
          `/api/transactions/recurrence/${t.recurrenceGroupId}?from=${iso}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Errore eliminazione ricorrenza");
      } else if (scope === "wholeRecurrence" && t.recurrenceGroupId) {
        // Cancella TUTTA la ricorrenza, storica + futura.
        const res = await fetch(
          `/api/transactions/recurrence/${t.recurrenceGroupId}?from=all`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Errore eliminazione ricorrenza");
      } else {
        const res = await fetch(`/api/transactions/${t.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Errore eliminazione");
      }
      setDeletingTx(null);
      router.refresh();
    } catch {
      // resta aperto
    } finally {
      setDeletingSaving(false);
    }
  }

  async function confirmMovimento(t: Tx) {
    setConfirmingSaving(true);
    try {
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/transactions/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, date: iso }),
      });
      if (!res.ok) throw new Error("Errore conferma");
      setConfirmingTx(null);
      router.refresh();
    } catch {
      // resta aperto, l'utente vedrà il bottone ancora attivo
    } finally {
      setConfirmingSaving(false);
    }
  }

  const updateCategory = useCallback(
    async (txId: string, newCategoryId: string | null) => {
      setSavingId(txId);
      setLocalCat((prev) => {
        const next = new Map(prev);
        next.set(txId, newCategoryId);
        return next;
      });
      try {
        const res = await fetch(`/api/transactions/${txId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ categoryId: newCategoryId }),
        });
        if (!res.ok) throw new Error("save failed");
        setJustSaved(txId);
        setTimeout(() => setJustSaved((c) => (c === txId ? null : c)), 1500);
        // Refresh server data in background per riallineare tutto
        startTransition(() => router.refresh());
      } catch {
        // Rollback
        setLocalCat((prev) => {
          const next = new Map(prev);
          next.delete(txId);
          return next;
        });
      } finally {
        setSavingId(null);
      }
    },
    [router],
  );

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  // Debounced search: applica la query 300ms dopo che l'utente ha smesso di digitare
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchValue === (filters.q ?? "")) return;
    debounceRef.current = setTimeout(() => {
      setParam("q", searchValue || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // Separa movimenti contabilizzati (past) da quelli ancora pianificati (future).
  // Un movimento è "futuro" se non è ancora confermato (programmato in attesa)
  // OPPURE se la data è oltre oggi. Se confirmed=false e date<=oggi → "scaduto".
  const { past, future, overdueCount } = useMemo(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const past: Tx[] = [];
    const future: Tx[] = [];
    let overdueCount = 0;
    for (const t of transactions) {
      const d = new Date(t.date);
      const isFutureDate = d.getTime() > endOfToday.getTime();
      if (!t.confirmed || isFutureDate) {
        future.push(t);
        if (!t.confirmed && !isFutureDate) overdueCount++;
      } else {
        past.push(t);
      }
    }
    future.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { past, future, overdueCount };
  }, [transactions]);

  const futureIn = future.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const futureOut = future.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

  // Raggruppa past per mese (insert header rows nel <tbody>).
  const pastByMonth = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const t of past) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].map(([key, txs]) => {
      const [y, m] = key.split("-");
      const monthIn = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const monthOut = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      return {
        key,
        date: new Date(parseInt(y), parseInt(m) - 1, 1),
        txs,
        monthIn,
        monthOut,
      };
    });
  }, [past]);

  return (
    <div className="space-y-4">
      {assignToEstate && (
        <div className="rounded-2xl border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.12] via-[var(--color-surface)] to-indigo-500/[0.06] p-4 flex items-center gap-3 flex-wrap">
          <span className="size-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-lg shrink-0">
            {assignToEstate.emoji ?? "🏢"}
          </span>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-semibold text-violet-200">
              Modalità assegnazione a {assignToEstate.name}
            </div>
            <p className="text-[11px] text-[var(--color-fg-muted)] mt-0.5">
              Seleziona i movimenti da collegare e clicca <strong>"Assegna a {assignToEstate.name}"</strong> nella toolbar che compare sotto. Le ricorrenze passate e future si aggiornano insieme.
            </p>
          </div>
          <a
            href="/movimenti"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            <X className="size-3" />
            Esci
          </a>
        </div>
      )}

      <div className="surface p-4 space-y-4">
        <SavedFilters />
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--color-fg-subtle)]" />
            <input
              type="text"
              placeholder="Cerca beneficiario o nota…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setParam("q", searchValue);
              }}
              className="w-full h-9 pl-9 pr-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus:border-violet-500/50"
            />
            {searchValue && (
              <button
                onClick={() => {
                  setSearchValue("");
                  setParam("q", undefined);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[var(--color-surface)]"
              >
                <X className="size-3.5 text-[var(--color-fg-subtle)]" />
              </button>
            )}
          </div>

          <Select
            value={filters.year?.toString() ?? "all"}
            onChange={(v) => setParam("year", v === "all" ? undefined : v)}
            options={[
              { value: "all", label: "Tutti gli anni" },
              ...years.map((y) => ({ value: y.toString(), label: y.toString() })),
            ]}
          />
          <Select
            value={filters.accountId ?? "all"}
            onChange={(v) => setParam("account", v === "all" ? undefined : v)}
            options={[
              { value: "all", label: "Tutti i conti" },
              ...accounts.map((a) => ({ value: a.id, label: `${a.emoji ?? ""} ${a.name}`.trim() })),
            ]}
          />
          <select
            value={filters.categoryId ?? "all"}
            onChange={(e) => setParam("cat", e.target.value === "all" ? undefined : e.target.value)}
            className="h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 text-sm focus:outline-none focus:border-violet-500/50 cursor-pointer"
          >
            <option value="all">Tutte le categorie</option>
            {categoryGroups.map((g) =>
              g.isMacroHeader ? (
                <option key={g.key} disabled value={`__header_${g.key}`}>
                  ━━━ {g.label} ━━━
                </option>
              ) : g.isMacroFooter ? (
                <option key={g.key} disabled value={`__footer_${g.key}`}>
                  ━━━━━━━━━━━━━━━━━━━━━
                </option>
              ) : (
                <optgroup key={g.key} label={g.label}>
                  {g.cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
          <button
            type="button"
            onClick={() => {
              setBulkMode((v) => !v);
              if (bulkMode) setSelected(new Set());
            }}
            className={cn(
              "h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors border",
              bulkMode
                ? "bg-violet-500/15 border-violet-500/40 text-violet-300"
                : "bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
            )}
            title="Attiva selezione multipla"
          >
            <CheckSquare className="size-3.5" />
            {bulkMode ? "Esci da selezione" : "Seleziona"}
          </button>
        </div>

      </div>

      {future.length > 0 && (
        <div
          className={cn(
            "rounded-xl border overflow-hidden",
            overdueCount > 0
              ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] to-violet-500/[0.04]"
              : "border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-indigo-500/[0.04]",
          )}
        >
          <button
            type="button"
            onClick={() => setShowFuture((s) => !s)}
            className={cn(
              "w-full px-4 py-3 flex items-center justify-between transition-colors",
              overdueCount > 0
                ? "hover:bg-amber-500/[0.05]"
                : "hover:bg-violet-500/[0.04]",
            )}
          >
            <div className="flex items-center gap-3">
              <CalendarClock
                className={cn(
                  "size-4",
                  overdueCount > 0 ? "text-amber-400" : "text-violet-400",
                )}
              />
              <div className="text-left">
                <div className="text-sm font-medium">
                  Cashflow futuro
                  {overdueCount > 0 && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {overdueCount} scadut{overdueCount === 1 ? "o" : "i"}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[var(--fg-subtle)]">
                  {future.length} movimenti pianificati · primo{" "}
                  {formatDate(new Date(future[0].date), { day: "2-digit", month: "short" })} · ultimo{" "}
                  {formatDate(new Date(future[future.length - 1].date), {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs tabular-nums">
              <span className="text-emerald-400">+{formatEUR(futureIn, { compact: true })}</span>
              <span className="text-rose-400">{formatEUR(futureOut, { compact: true })}</span>
              <span className="font-medium">
                {futureIn + futureOut >= 0 ? "+" : ""}
                {formatEUR(futureIn + futureOut, { compact: true })}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-[var(--fg-muted)] transition-transform",
                  showFuture && "rotate-180",
                )}
              />
            </div>
          </button>
          <AnimatePresence initial={false}>
            {showFuture && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-violet-500/15">
                  <table className="w-full text-sm">
                    <tbody>
                      {future.map((t) => {
                        const isTransfer = !!t.transferGroupId;
                        const isOverdue =
                          !t.confirmed && new Date(t.date).getTime() <= Date.now();
                        const canConfirm = !t.confirmed && !isTransfer;
                        return (
                          <tr
                            key={t.id}
                            className={cn(
                              "border-b border-[var(--border)]/30 last:border-0",
                              isOverdue && "bg-amber-500/[0.06]",
                            )}
                          >
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    isOverdue ? "text-amber-400 font-medium" : "text-[var(--fg-muted)]",
                                  )}
                                >
                                  {formatDate(t.date, {
                                    day: "2-digit",
                                    month: "short",
                                    year: "2-digit",
                                  })}
                                </span>
                                {isOverdue && (
                                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                                    scaduto
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              {isTransfer ? "↔️" : t.category?.emoji ?? "—"}
                            </td>
                            <td className="px-4 py-2 max-w-[240px]">
                              <div className="truncate text-xs">
                                {t.beneficiary || t.notes || "—"}
                                {t.estate && (
                                  <span className="ml-1.5 text-[var(--fg-subtle)]">
                                    · {t.estate.emoji ?? "🏠"} {t.estate.name}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-xs">
                              <span className="text-[var(--fg-muted)]">
                                {t.account.emoji ?? "💳"} {t.account.name}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "px-4 py-2 text-right whitespace-nowrap tabular-nums text-xs font-medium",
                                isTransfer
                                  ? "text-violet-400"
                                  : t.amount > 0
                                    ? "text-emerald-400"
                                    : "text-[var(--fg)]",
                              )}
                            >
                              <div className="inline-flex items-center gap-2 justify-end">
                                {t.recurrenceGroupId && (
                                  <Repeat
                                    className="size-3 text-violet-400 shrink-0"
                                    aria-label="Ricorrente"
                                  />
                                )}
                                <span>
                                  {t.amount > 0 ? "+" : ""}
                                  {formatEUR(t.amount)}
                                </span>
                                {!isTransfer && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingTx(t)}
                                    className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-subtle)] hover:text-[var(--fg)]"
                                    title="Modifica"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                )}
                                {canConfirm && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingTx(t)}
                                    className="size-6 inline-flex items-center justify-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                                    title="Conferma movimento (sposta a oggi)"
                                  >
                                    <Check className="size-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeletingTx(t)}
                                  className="size-6 inline-flex items-center justify-center rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                                  title="Cancella movimento"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-14 z-20 surface p-3 flex items-center gap-3 flex-wrap border-violet-500/40 bg-violet-500/[0.06]">
          <span className="text-sm font-medium inline-flex items-center gap-1.5">
            <CheckSquare className="size-4 text-violet-400" />
            {selected.size} selezionati
          </span>
          {assignToEstate && (
            <button
              onClick={() => applyBulk("estateId", assignToEstate.id)}
              disabled={bulkApplying}
              className="h-8 px-3 rounded-lg bg-violet-500 text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-violet-600 disabled:opacity-50"
            >
              {assignToEstate.emoji ?? "🏢"} Assegna a {assignToEstate.name}
            </button>
          )}
          <select
            value={bulkCategoryId}
            onChange={(e) => {
              setBulkCategoryId(e.target.value);
              if (e.target.value) applyBulk("categoryId", e.target.value);
            }}
            disabled={bulkApplying}
            className="h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs"
          >
            <option value="">→ Cambia categoria…</option>
            {categoryGroups.map((g) =>
              g.isMacroHeader ? (
                <option key={g.key} disabled value={`__header_${g.key}`}>
                  ━━━ {g.label} ━━━
                </option>
              ) : g.isMacroFooter ? (
                <option key={g.key} disabled value={`__footer_${g.key}`}>
                  ━━━━━━━━━━━━━━━━━━━━━
                </option>
              ) : (
                <optgroup key={g.key} label={g.label}>
                  {g.cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
          <select
            value={bulkAccountId}
            onChange={(e) => {
              setBulkAccountId(e.target.value);
              if (e.target.value) applyBulk("accountId", e.target.value);
            }}
            disabled={bulkApplying}
            className="h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs"
          >
            <option value="">→ Cambia conto…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji ?? "💳"} {a.name}
              </option>
            ))}
          </select>
          {estates.length > 0 && (
            <select
              value={bulkEstateId}
              onChange={(e) => {
                setBulkEstateId(e.target.value);
                if (e.target.value === "__none__") applyBulk("estateId", null);
                else if (e.target.value) applyBulk("estateId", e.target.value);
              }}
              disabled={bulkApplying}
              className="h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-2 text-xs"
            >
              <option value="">→ Assegna a immobile…</option>
              {estates.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emoji ?? "🏠"} {e.name}
                </option>
              ))}
              <option value="__none__">✕ Rimuovi assegnazione</option>
            </select>
          )}
          <button
            onClick={() => setBulkDeleteOpen(true)}
            disabled={bulkApplying}
            className="h-8 px-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs inline-flex items-center gap-1.5 hover:bg-rose-500/20"
          >
            <Trash2 className="size-3" />
            Cancella tutti
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto h-8 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs"
          >
            Annulla
          </button>
        </div>
      )}

      <div className={cn("surface overflow-hidden transition-opacity", isPending && "opacity-60")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-fg-subtle)] border-b border-[var(--color-border)]">
                {bulkMode && (
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={past.length > 0 && selected.size === past.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(past.map((t) => t.id)));
                        else setSelected(new Set());
                      }}
                      className="size-4 accent-violet-500"
                      title="Seleziona tutto"
                    />
                  </th>
                )}
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Beneficiario</th>
                <th className="px-4 py-3 font-medium">Conto</th>
                <th className="px-4 py-3 font-medium text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {pastByMonth.map(({ key, date, txs, monthIn, monthOut }) => (
                <Fragment key={key}>
                  <tr className="bg-[var(--surface-2)]/40 border-b border-[var(--border)]/40">
                    <td
                      colSpan={bulkMode ? 6 : 5}
                      className="px-4 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-medium capitalize text-[var(--color-fg-muted)]">
                          {date.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                        </h3>
                        <div className="flex gap-3 text-[11px] tabular-nums">
                          {monthIn > 0 && (
                            <span className="text-emerald-400">
                              +{formatEUR(monthIn, { compact: true })}
                            </span>
                          )}
                          {monthOut < 0 && (
                            <span className="text-rose-400">
                              {formatEUR(monthOut, { compact: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                  {txs.map((t, i) => {
                const isTransfer = !!t.transferGroupId;
                return (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.005, 0.4), duration: 0.3 }}
                    className={cn(
                      "group border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/40 transition-colors",
                      isTransfer && "bg-violet-500/[0.03]",
                      selected.has(t.id) && "bg-violet-500/10",
                    )}
                  >
                    {bulkMode && (
                      <td className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleSel(t.id)}
                          className="size-4 accent-violet-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--fg-muted)]">
                      {formatDate(t.date, { day: "2-digit", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      {isTransfer && t.transferCounterpart?.name === "Investimenti" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{t.category?.emoji ?? "📈"}</span>
                          <span className="text-xs text-violet-400">
                            Investito · {t.category?.name ?? ""}
                          </span>
                        </span>
                      ) : isTransfer ? (
                        <span className="inline-flex items-center gap-1.5 text-violet-400">
                          <span>↔️</span>
                          <span className="text-xs">Transfer</span>
                        </span>
                      ) : (
                        <CategoryEditor
                          tx={t}
                          categories={categories}
                          estates={estates}
                          localCat={localCat}
                          savingId={savingId}
                          justSaved={justSaved}
                          onChange={(catId) => updateCategory(t.id, catId)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      {isTransfer && t.transferCounterpart ? (
                        <div className="text-xs">
                          <span className="text-[var(--fg-muted)]">
                            {t.amount < 0 ? "verso " : "da "}
                          </span>
                          <span>{t.transferCounterpart.emoji}</span>{" "}
                          <span className="font-medium">{t.transferCounterpart.name}</span>
                          {t.beneficiary && (
                            <div className="text-[11px] text-[var(--fg-subtle)] truncate mt-0.5">
                              {t.beneficiary}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="truncate">{t.beneficiary || t.notes || "—"}</div>
                          {t.notes && t.beneficiary && (
                            <div className="text-[11px] text-[var(--fg-subtle)] truncate">{t.notes}</div>
                          )}
                          {t.estate && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/30 text-violet-300">
                              {t.estate.emoji ?? "🏠"} {t.estate.name}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <AccountBadge account={t.account} allAccounts={accounts} />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium",
                        isTransfer
                          ? "text-violet-400"
                          : t.amount > 0
                            ? "text-emerald-400"
                            : "text-[var(--fg)]",
                      )}
                    >
                      <div className="inline-flex items-center gap-2 justify-end">
                        <span>
                          {t.amount > 0 ? "+" : ""}
                          {formatEUR(t.amount)}
                        </span>
                        {!isTransfer && (
                          <button
                            type="button"
                            onClick={() => setEditingTx(t)}
                            className="size-6 inline-flex items-center justify-center rounded hover:bg-[var(--surface-2)] text-[var(--fg-subtle)] hover:text-[var(--fg)] opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Modifica movimento"
                          >
                            <Pencil className="size-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {past.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--color-fg-subtle)]">
            Nessun movimento corrisponde ai filtri.
          </div>
        )}
        {totalCount > transactions.length && (
          <div className="py-3 text-center border-t border-[var(--color-border)] flex flex-col items-center gap-1">
            <button
              onClick={() => setParam("limit", String(currentLimit + pageSize))}
              className="text-xs text-violet-400 hover:underline"
            >
              Mostra altri {Math.min(pageSize, totalCount - transactions.length)} movimenti
            </button>
            <span className="text-[10px] text-[var(--color-fg-subtle)]">
              {transactions.length} di {totalCount} visualizzati
            </span>
          </div>
        )}
        {currentLimit > pageSize && (
          <div className="py-2 text-center border-t border-[var(--color-border)]">
            <button
              onClick={() => setParam("limit", undefined)}
              className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              Torna ai {pageSize} più recenti
            </button>
          </div>
        )}
      </div>

      <EditEntrataDialog
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        tx={editingTx}
        accounts={accounts}
      />

      <AnimatePresence>
        {deletingTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deletingSaving && setDeletingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <h2 className="text-lg font-semibold">Cancellare il movimento?</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Beneficiario</span>
                  <span className="font-medium">{deletingTx.beneficiary || "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Importo</span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      deletingTx.amount > 0 ? "text-emerald-400" : "text-[var(--fg)]",
                    )}
                  >
                    {deletingTx.amount > 0 ? "+" : ""}
                    {formatEUR(deletingTx.amount)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Data</span>
                  <span className="tabular-nums">
                    {formatDate(deletingTx.date, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Conto</span>
                  <span>
                    {deletingTx.account.emoji ?? "💳"} {deletingTx.account.name}
                  </span>
                </div>
                {deletingTx.transferGroupId && (
                  <div className="text-xs text-amber-400 pt-1 border-t border-[var(--border)]">
                    ⚠️ È un transfer: verranno cancellate ENTRAMBE le righe (entrata e uscita).
                  </div>
                )}
                {deletingTx.recurrenceGroupId && (
                  <div className="text-xs text-violet-400 pt-1 border-t border-[var(--border)]">
                    🔁 Fa parte di una ricorrenza. Puoi cancellare solo questa o tutte
                    quelle future.
                  </div>
                )}
              </div>
              <p className="text-xs text-[var(--fg-subtle)]">
                L&apos;operazione è irreversibile.
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => deleteTx(deletingTx, "single")}
                    disabled={deletingSaving}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    {deletingSaving ? "Cancello…" : "Cancella solo questa"}
                  </button>
                  <button
                    onClick={() => setDeletingTx(null)}
                    disabled={deletingSaving}
                    className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                  >
                    Annulla
                  </button>
                </div>
                {deletingTx.recurrenceGroupId && (
                  <button
                    onClick={() => deleteTx(deletingTx, "fromThis")}
                    disabled={deletingSaving}
                    className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 text-sm font-medium disabled:opacity-50 hover:bg-rose-500/25"
                  >
                    <Trash2 className="size-4" />
                    Cancella questa + tutte le successive della ricorrenza
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {confirmingTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !confirmingSaving && setConfirmingTx(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <h2 className="text-lg font-semibold">Confermi il movimento?</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Beneficiario</span>
                  <span className="font-medium">{confirmingTx.beneficiary || "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Importo</span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      confirmingTx.amount > 0 ? "text-emerald-400" : "text-[var(--fg)]",
                    )}
                  >
                    {confirmingTx.amount > 0 ? "+" : ""}
                    {formatEUR(confirmingTx.amount)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Conto</span>
                  <span className="font-medium">
                    {confirmingTx.account.emoji ?? "💳"} {confirmingTx.account.name}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--fg-muted)]">Data programmata</span>
                  <span className="text-[var(--fg-muted)] tabular-nums">
                    {formatDate(confirmingTx.date, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex justify-between gap-4 pt-2 border-t border-[var(--border)]">
                  <span className="text-[var(--fg-muted)]">→ Nuova data (oggi)</span>
                  <span className="font-medium tabular-nums">
                    {formatDate(new Date(), {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[var(--fg-subtle)]">
                Conferma solo se il movimento è effettivamente avvenuto. Verrà spostato nei
                movimenti contabilizzati con la data di oggi.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => confirmMovimento(confirmingTx)}
                  disabled={confirmingSaving}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  <Check className="size-4" />
                  {confirmingSaving ? "Confermo…" : "Sì, conferma"}
                </button>
                <button
                  onClick={() => setConfirmingTx(null)}
                  disabled={confirmingSaving}
                  className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                >
                  Annulla
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bulkDeleteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !bulkApplying && setBulkDeleteOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Trash2 className="size-5 text-rose-400" />
                  Cancellare {selected.size} movimenti?
                </h2>
                <button
                  onClick={() => setBulkDeleteOpen(false)}
                  disabled={bulkApplying}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div
                className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs"
                style={{ color: "var(--color-rose-text)" }}
              >
                <div className="flex items-start gap-2">
                  <Trash2 className="size-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-medium">Operazione irreversibile</div>
                    <ul
                      className="list-disc list-inside text-[11px] space-y-0.5"
                      style={{ color: "var(--color-rose-text-soft)" }}
                    >
                      <li>
                        {selected.size}{" "}
                        {selected.size === 1 ? "movimento verrà cancellato" : "movimenti verranno cancellati"} definitivamente
                      </li>
                      <li>
                        I transfer (giroconti) cancellano <strong>entrambi i lati</strong> del transfer
                      </li>
                      <li>
                        I saldi conto NON vengono ricalcolati automaticamente — se erano congelati, restano congelati col valore attuale
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setBulkDeleteOpen(false)}
                  disabled={bulkApplying}
                  className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkApplying}
                  className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {bulkApplying ? "Cancello…" : `Cancella ${selected.size}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ACCOUNT_TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  joint: { label: "Cointestato", cls: "bg-pink-500/10 border-pink-500/30 text-pink-300" },
  friendsplit: { label: "Friendsplit", cls: "bg-amber-500/10 border-amber-500/30 text-amber-300" },
  investment: { label: "Investimenti", cls: "bg-violet-500/10 border-violet-500/30 text-violet-300" },
  credit: { label: "Crediti", cls: "bg-blue-500/10 border-blue-500/30 text-blue-300" },
};

function AccountBadge({
  account,
  allAccounts,
}: {
  account: { name: string; emoji: string | null; type: string };
  allAccounts: Account[];
}) {
  const def = ACCOUNT_TYPE_BADGE[account.type];
  // Conti personali (liquid/cash/savings, ecc.) → testo normale
  if (!def) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span>{account.emoji ?? "💳"}</span>
        <span className="text-[var(--fg-muted)]">{account.name}</span>
      </span>
    );
  }
  // Conti speciali → solo badge (no testo ridondante).
  // Se più account dello stesso tipo, aggiungo il disambiguatore.
  const sameTypePeers = allAccounts.filter((a) => a.type === account.type);
  let label = def.label;
  if (sameTypePeers.length > 1) {
    let suffix = account.name.trim();
    // Strip del prefisso "Friendsplit " se presente nel nome
    const prefixLower = `${def.label.toLowerCase()} `;
    if (suffix.toLowerCase().startsWith(prefixLower)) {
      suffix = suffix.slice(def.label.length).trim();
    }
    if (suffix && suffix.toLowerCase() !== def.label.toLowerCase()) {
      label = `${def.label} · ${suffix}`;
    } else {
      label = account.name;
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span>{account.emoji ?? "💳"}</span>
      <span
        className={cn(
          "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border font-medium",
          def.cls,
        )}
      >
        {label}
      </span>
    </span>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 text-sm focus:outline-none focus:border-violet-500/50 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CategoryEditor({
  tx,
  categories,
  estates,
  localCat,
  savingId,
  justSaved,
  onChange,
}: {
  tx: Tx;
  categories: Category[];
  estates: Estate[];
  localCat: Map<string, string | null>;
  savingId: string | null;
  justSaved: string | null;
  onChange: (categoryId: string | null) => void;
}) {
  const overridden = localCat.has(tx.id);
  const effectiveCatId = overridden ? localCat.get(tx.id) ?? null : tx.category?.id ?? null;
  const effectiveCat = effectiveCatId ? categories.find((c) => c.id === effectiveCatId) : null;
  const isSaving = savingId === tx.id;
  const wasJustSaved = justSaved === tx.id;

  return (
    <div className="relative inline-flex items-center gap-1.5 group">
      <span className="shrink-0">{effectiveCat?.emoji ?? "—"}</span>
      <CategoryPicker
        value={effectiveCatId}
        categories={categories}
        estates={estates}
        disabled={isSaving}
        onChange={onChange}
      />
      {wasJustSaved && <Check className="size-3 text-emerald-400 shrink-0" />}
    </div>
  );
}
