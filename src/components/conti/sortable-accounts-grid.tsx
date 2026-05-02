"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Archive, X, AlertTriangle, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BalanceEditor } from "@/components/conti/balance-editor";
import { AccountSettingsPopover } from "@/components/conti/account-settings-popover";
import { useToast } from "@/components/ui/toast";

type Account = {
  id: string;
  name: string;
  type: string;
  emoji: string | null;
  currency: string;
  currentBalance: number;
  /** Saldo da mostrare: in modalità Frozen = currentBalance, in Live = currentBalance + tx confermate dopo frozenAt. */
  displayBalance?: number;
  ownershipShare: number;
  /** Provider esterno per gating integrazioni (generic | binance | revolut-x | ...) */
  provider?: string;
  /** Sottotipo per type=investment (stocks/crypto/metals/...) — usato per i colori card. */
  investmentSubtype?: string | null;
  /** True se il provider del conto ha una credential API configurata in Impostazioni → Integrazioni. */
  apiActive?: boolean;
  /** Conteggio movimenti collegati al conto.
   *  Per type=investment è il numero di trade (BUY/SELL) dal broker, non
   *  i Transaction records. */
  txCount?: number;
  /** Per type=investment: pagina di dettaglio dei trade (StockTrade/CryptoTrade)
   *  associata al broker (es. /investimenti/stocks). Se valorizzato, il link
   *  "X movimenti →" punta qui invece che a /movimenti?account=id. */
  tradesHref?: string | null;
};

const TYPE_TO_PAGE: Record<string, { href: string; label: string }> = {
  savings: { href: "/risparmi", label: "Vai a Risparmi" },
  investment: { href: "/investimenti", label: "Vai a Investimenti" },
  joint: { href: "/cointestato", label: "Vai a Cointestato" },
};

const TYPE_COLORS: Record<string, string> = {
  liquid: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
  savings: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
  cash: "from-zinc-500/20 to-zinc-500/5 border-zinc-500/20",
  joint: "from-pink-500/20 to-pink-500/5 border-pink-500/20",
  investment: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
  credit: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
};

// Override per type=investment con sottotipo specifico — coerente con i
// colori della pagina /investimenti (stocks azzurro, crypto viola).
const INVESTMENT_SUBTYPE_COLORS: Record<string, string> = {
  stocks: "from-sky-500/20 to-sky-500/5 border-sky-500/20",
  metals: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
  crypto: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
};

function cardColors(a: { type: string; investmentSubtype?: string | null }): string {
  if (a.type === "investment" && a.investmentSubtype) {
    return INVESTMENT_SUBTYPE_COLORS[a.investmentSubtype] ?? TYPE_COLORS.investment;
  }
  return TYPE_COLORS[a.type] ?? TYPE_COLORS.liquid;
}

function shareLabel(share: number): string | null {
  if (share >= 1) return null;
  if (Math.abs(share - 2 / 3) < 0.01) return "2/3";
  if (Math.abs(share - 1 / 2) < 0.01) return "1/2";
  if (Math.abs(share - 1 / 3) < 0.01) return "1/3";
  return `${(share * 100).toFixed(0)}%`;
}

export function SortableAccountsGrid({
  initial,
  locked = false,
}: {
  initial: Account[];
  /** True quando i conti sono in modalità Live (saldi derivati): editor disabilitato. */
  locked?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Sync state quando initial cambia (es. dopo router.refresh)
  useEffect(() => setItems(initial), [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    setItems(next);
    const res = await fetch("/api/accounts/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: next.map((i) => i.id) }),
    });
    if (res.ok) {
      toast({ title: "Ordine conti salvato", variant: "success", duration: 2000 });
    } else {
      toast({ title: "Errore nel salvare l'ordine", variant: "error" });
    }
    router.refresh();
  }

  // Pre-mount: render statico (no dnd-kit) per evitare hydration mismatch
  // dovuto agli aria-describedby="DndDescribedBy-N" generati con counter
  // globale tra contesti multipli (una grid per tipo conto).
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((a) => (
          <StaticCard key={a.id} a={a} />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <SortableCard key={a.id} a={a} locked={locked} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function StaticCard({ a }: { a: Account }) {
  const share = shareLabel(a.ownershipShare);
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${cardColors(a)} p-5`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
          {a.emoji ?? "💳"}
        </div>
        <div className="flex items-center gap-1.5">
          {a.apiActive && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium"
              title="API collegata: sync automatica attiva"
            >
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              API
            </span>
          )}
          {share && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">
              {share}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)]">
            {a.currency}
          </span>
        </div>
      </div>
      <div className="text-sm text-[var(--fg-muted)]">{a.name}</div>
      <div className="text-2xl font-semibold tabular-nums px-2 py-0.5 -mx-2">
        {(a.displayBalance ?? a.currentBalance * a.ownershipShare).toLocaleString("it-IT", {
          style: "currency",
          currency: "EUR",
        })}
      </div>
    </div>
  );
}

function SortableCard({ a, locked }: { a: Account; locked: boolean }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: a.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const share = shareLabel(a.ownershipShare);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  async function confirmClose() {
    setClosing(true);
    try {
      const res = await fetch(`/api/accounts/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) {
        setCloseOpen(false);
        router.refresh();
      }
    } finally {
      setClosing(false);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${cardColors(a)} p-5 cursor-grab active:cursor-grabbing select-none ${isDragging ? "z-10 opacity-80 shadow-2xl" : ""}`}
      title="Trascina per riordinare"
    >
      <GripVertical className="absolute right-2 top-2 size-3 text-[var(--fg-subtle)] opacity-0 group-hover:opacity-60 pointer-events-none transition-opacity" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setCloseOpen(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="Chiudi conto (lo nasconde dai picker, conserva storia)"
        className="absolute right-7 top-2 size-5 inline-flex items-center justify-center rounded text-[var(--fg-subtle)] opacity-0 group-hover:opacity-80 hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
      >
        <Archive className="size-3" />
      </button>
      <AccountSettingsPopover
        accountId={a.id}
        accountType={a.type}
        currentProviderId={a.provider ?? "generic"}
      />
      <AnimatePresence>
        {closeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !closing && setCloseOpen(false)}
            onPointerDown={(e) => e.stopPropagation()}
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
                  <Archive className="size-5 text-[var(--color-fg-muted)]" />
                  Chiudere il conto?
                </h2>
                <button
                  onClick={() => setCloseOpen(false)}
                  disabled={closing}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-2">
                  <span className="size-9 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-lg">
                    {a.emoji ?? "💳"}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-[var(--color-fg-subtle)]">
                      Saldo attuale: {a.currentBalance.toFixed(2)} €
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                <div
                  className="flex items-start gap-2 text-xs"
                  style={{ color: "var(--color-amber-text)" }}
                >
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <ul
                    className="list-disc list-inside space-y-0.5 text-[11px]"
                    style={{ color: "var(--color-amber-text-soft)" }}
                  >
                    <li>Sparirà dai dropdown di selezione conto in tutta la app</li>
                    <li>I movimenti storici restano intatti, visibili in /movimenti</li>
                    <li>
                      Il saldo NON viene azzerato — se il conto è chiuso davvero, valuta di
                      forzarlo a 0 prima dalla card del conto
                    </li>
                    <li>
                      Lo trovi in <strong>"Chiusi / Migrati"</strong> in fondo a /conti,{" "}
                      <strong>riapribile in qualsiasi momento</strong>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setCloseOpen(false)}
                  disabled={closing}
                  className="h-9 px-4 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={confirmClose}
                  disabled={closing}
                  className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <Archive className="size-4" />
                  {closing ? "Chiudo…" : "Chiudi conto"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between mb-4">
        <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl">
          {a.emoji ?? "💳"}
        </div>
        <div className="flex items-center gap-1.5">
          {a.apiActive && (
            <span
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium"
              title="API collegata: sync automatica attiva"
            >
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              API
            </span>
          )}
          {share && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-medium">
              {share}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-widest text-[var(--fg-subtle)]">
            {a.currency}
          </span>
        </div>
      </div>
      <div className="text-sm text-[var(--fg-muted)]">{a.name}</div>
      {/* Stop propagation: il BalanceEditor ha input/click che non devono triggerare drag */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        <BalanceEditor
          accountId={a.id}
          initialBalance={a.displayBalance ?? a.currentBalance}
          ownershipShare={a.ownershipShare}
          locked={locked}
        />
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {a.txCount !== undefined && (
          <Link
            href={a.tradesHref ?? `/movimenti?account=${a.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-violet-400 hover:underline inline-block"
          >
            {a.txCount} {a.txCount === 1 ? "movimento" : "movimenti"} →
          </Link>
        )}
        {TYPE_TO_PAGE[a.type] && (
          <Link
            href={TYPE_TO_PAGE[a.type].href}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:underline inline-flex items-center gap-1 w-fit"
          >
            {TYPE_TO_PAGE[a.type].label}
            <ArrowUpRight className="size-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
