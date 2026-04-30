"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertTriangle,
  ArrowDownToLine,
  CircleSlash,
} from "lucide-react";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Credit = {
  id: string;
  name: string;
  counterparty: string | null;
  amount: number;
  currency: string;
  date: string | null;
  expectedReturn: string | null;
  status: string;
  emoji: string | null;
  notes: string | null;
};

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> = {
  active: {
    label: "Da incassare",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    emoji: "⏳",
  },
  returned: {
    label: "Restituito",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    emoji: "✅",
  },
  lost: {
    label: "Perso",
    color: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    emoji: "❌",
  },
};

export function CreditiClient({ credits }: { credits: Credit[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [emoji, setEmoji] = useState("");
  const [date, setDate] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");

  const active = credits.filter((c) => c.status === "active");
  const closed = credits.filter((c) => c.status !== "active");
  const totalActive = active.reduce((s, c) => s + c.amount, 0);

  function resetForm() {
    setName("");
    setCounterparty("");
    setAmount("");
    setEmoji("");
    setDate("");
    setExpectedReturn("");
    setNotes("");
    setError(null);
  }

  function startEdit(c: Credit) {
    setEditingId(c.id);
    setName(c.name);
    setCounterparty(c.counterparty ?? "");
    setAmount(c.amount.toString());
    setEmoji(c.emoji ?? "");
    setDate(c.date ? c.date.slice(0, 10) : "");
    setExpectedReturn(c.expectedReturn ? c.expectedReturn.slice(0, 10) : "");
    setNotes(c.notes ?? "");
    setAdding(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        counterparty: counterparty.trim() || null,
        amount: parseFloat(amount),
        emoji: emoji.trim() || null,
        date: date || null,
        expectedReturn: expectedReturn || null,
        notes: notes.trim() || null,
      };
      const url = editingId ? `/api/crediti/${editingId}` : "/api/crediti";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Errore");
      }
      setAdding(false);
      setEditingId(null);
      resetForm();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "returned" | "lost" | "active") {
    await fetch(`/api/crediti/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Cancellare questo credito?", confirmLabel: "Cancella", variant: "danger" }))) return;
    await fetch(`/api/crediti/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <span>📒</span> Crediti
          </h1>
          <p className="text-sm text-[var(--fg-muted)] mt-0.5">
            Cauzioni, prestiti e soldi che devono tornare. Non contano nel net worth.
          </p>
        </div>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
            resetForm();
          }}
          className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 inline-flex items-center gap-2"
        >
          <Plus className="size-4" />
          {adding ? "Annulla" : "Aggiungi credito"}
        </button>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-[var(--surface)] to-amber-500/[0.04] p-6">
        <div className="pointer-events-none absolute -top-20 -right-20 size-60 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-1">
              Da incassare
            </div>
            <div className="text-3xl font-semibold tabular-nums text-amber-400">
              {formatEUR(totalActive)}
            </div>
            <div className="text-[11px] text-[var(--fg-subtle)] mt-0.5">
              {active.length} {active.length === 1 ? "credito" : "crediti"} attivi
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-1">
              Restituiti
            </div>
            <div className="text-2xl font-semibold tabular-nums text-emerald-400/80">
              {formatEUR(
                credits.filter((c) => c.status === "returned").reduce((s, c) => s + c.amount, 0),
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--fg-muted)] mb-1">
              Persi
            </div>
            <div className="text-2xl font-semibold tabular-nums text-rose-400/80">
              {formatEUR(
                credits.filter((c) => c.status === "lost").reduce((s, c) => s + c.amount, 0),
              )}
            </div>
          </div>
        </div>
      </div>

      {(adding || editingId) && (
        <div className="surface p-5 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)]">
            {editingId ? "Modifica credito" : "Nuovo credito"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Caparra casa Malaga"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Importo
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm tabular-nums focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Controparte
              </label>
              <input
                type="text"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Chi ha i soldi (proprietario, persona…)"
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Emoji
              </label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🏖️"
                maxLength={4}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Data uscita
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Rientro previsto
              </label>
              <input
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] uppercase tracking-widest text-[var(--fg-muted)]">
                Note
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
          {error && (
            <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !name.trim() || !amount}
              className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Salvo…" : editingId ? "Salva" : "Aggiungi"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                resetForm();
              }}
              className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {credits.length === 0 ? (
        <div className="max-w-xl mx-auto py-12 text-center space-y-5">
          <div className="size-16 mx-auto rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <ArrowDownToLine className="size-7 text-[var(--fg-muted)]" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Nessun credito registrato</h2>
            <p className="text-sm text-[var(--fg-muted)]">
              Cauzioni, caparre, prestiti fatti — soldi che ti devono tornare.
              Non contano nel net worth: sono "soldi volanti" già usciti, da reincassare.
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--fg)] text-[var(--bg)] px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" /> Aggiungi primo credito
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <CreditList
              title="Attivi"
              items={active}
              onEdit={startEdit}
              onSetStatus={setStatus}
              onRemove={remove}
            />
          )}
          {closed.length > 0 && (
            <CreditList
              title="Chiusi"
              items={closed}
              onEdit={startEdit}
              onSetStatus={setStatus}
              onRemove={remove}
              dimmed
            />
          )}
        </>
      )}
    </div>
  );
}

function CreditList({
  title,
  items,
  onEdit,
  onSetStatus,
  onRemove,
  dimmed,
}: {
  title: string;
  items: Credit[];
  onEdit: (c: Credit) => void;
  onSetStatus: (id: string, status: "returned" | "lost" | "active") => void;
  onRemove: (id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <section className={dimmed ? "opacity-60" : ""}>
      <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] mb-3 px-1">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((c) => {
          const status = STATUS_META[c.status] ?? STATUS_META.active;
          return (
            <div
              key={c.id}
              className="surface p-4 group hover:border-[var(--border-strong)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-xl shrink-0">
                    {c.emoji ?? "📒"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    {c.counterparty && (
                      <div className="text-xs text-[var(--fg-muted)] truncate mt-0.5">
                        {c.counterparty}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium",
                          status.color,
                        )}
                      >
                        {status.label}
                      </span>
                      {c.date && (
                        <span className="text-[10px] text-[var(--fg-subtle)]">
                          uscito {formatDate(new Date(c.date), { day: "2-digit", month: "short", year: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {c.notes && (
                      <div className="text-[11px] text-[var(--fg-subtle)] mt-1 line-clamp-2">
                        {c.notes}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatEUR(c.amount)}
                  </div>
                  {c.expectedReturn && c.status === "active" && (
                    <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
                      atteso{" "}
                      {formatDate(new Date(c.expectedReturn), {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 mt-3 pt-3 border-t border-[var(--border)] opacity-60 group-hover:opacity-100 transition-opacity">
                {c.status === "active" ? (
                  <>
                    <button
                      onClick={() => onSetStatus(c.id, "returned")}
                      className="text-[11px] inline-flex items-center gap-1 h-7 px-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                      title="Segna come restituito"
                    >
                      <ArrowDownToLine className="size-3" />
                      Incassato
                    </button>
                    <button
                      onClick={() => onSetStatus(c.id, "lost")}
                      className="text-[11px] inline-flex items-center gap-1 h-7 px-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                      title="Segna come perso"
                    >
                      <CircleSlash className="size-3" />
                      Perso
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onSetStatus(c.id, "active")}
                    className="text-[11px] inline-flex items-center gap-1 h-7 px-2 rounded bg-[var(--surface-2)] border border-[var(--border)]"
                  >
                    Riapri
                  </button>
                )}
                <button
                  onClick={() => onEdit(c)}
                  className="text-[11px] inline-flex items-center gap-1 h-7 px-2 rounded hover:bg-[var(--surface-2)] text-[var(--fg-muted)] ml-auto"
                  title="Modifica"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  onClick={() => onRemove(c.id)}
                  className="text-[11px] inline-flex items-center gap-1 h-7 px-2 rounded hover:bg-rose-500/10 text-rose-400"
                  title="Cancella"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
