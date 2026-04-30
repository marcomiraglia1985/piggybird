"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Repeat, AlertTriangle, Clock, CheckCircle2, EyeOff, Trash2 } from "lucide-react";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import {
  getIgnoredRecurrences,
  ignoreRecurrence,
  monthsUntilEndOfYear,
} from "@/lib/recurrence-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Group = {
  groupId: string;
  status: "expired" | "expiring" | "active";
  beneficiary: string | null;
  occurrences: number;
  medianAmount: number;
  medianDays: number;
  firstDate: string;
  lastDate: string;
  daysUntilLast: number;
  nextDate: string | null;
};

export function RecurrenceStatusList() {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [bulkExtending, setBulkExtending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIgnored(getIgnoredRecurrences());
    fetch("/api/transactions/recurrence-status")
      .then((r) => r.json())
      .then((j) => setGroups(j.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  const visible = useMemo(
    () => (groups ?? []).filter((g) => !ignored.has(g.groupId)),
    [groups, ignored],
  );

  async function extend(groupId: string, months: number) {
    setExtending(groupId);
    try {
      const res = await fetch("/api/transactions/recurrence-extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, months }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        const created = j?.created ?? 0;
        toast({
          title:
            created > 0
              ? `Estese ${created} occorrenze`
              : "Nessuna nuova occorrenza creata",
          description:
            created > 0
              ? "La ricorrenza è coperta fino a fine anno."
              : "Le date erano già coperte da tx esistenti.",
          variant: "success",
        });
      } else {
        toast({
          title: "Errore nell'estensione",
          description: j?.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
      }
      setGroups((prev) => (prev ?? []).filter((g) => g.groupId !== groupId));
      router.refresh();
    } finally {
      setExtending(null);
    }
  }

  async function extendAll() {
    setBulkExtending(true);
    try {
      // Estende solo expired/expiring: le active già coprono > 45gg
      const targets = visible.filter((g) => g.status !== "active");
      await Promise.all(
        targets.map((g) =>
          fetch("/api/transactions/recurrence-extend", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              groupId: g.groupId,
              months: monthsUntilEndOfYear(new Date(g.lastDate)),
            }),
          }),
        ),
      );
      setGroups((prev) =>
        (prev ?? []).filter((g) => !targets.some((t) => t.groupId === g.groupId)),
      );
      toast({
        title: `Estese ${targets.length} ricorrenze`,
        description: "Tutte coperte fino a fine anno.",
        variant: "success",
      });
      router.refresh();
    } finally {
      setBulkExtending(false);
    }
  }

  function ignore(groupId: string) {
    ignoreRecurrence(groupId);
    setIgnored((prev) => new Set(prev).add(groupId));
  }

  async function remove(g: Group) {
    const label = g.beneficiary ?? "questa ricorrenza";
    const ok = await confirm({
      title: `Cancellare "${label}"?`,
      description:
        "Lo storico già registrato resta intatto. Verranno rimosse solo le occorrenze future (con data ≥ oggi).",
      confirmLabel: "Cancella",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(g.groupId);
    try {
      const res = await fetch(`/api/transactions/recurrence/${g.groupId}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => null);
      if (res.ok) {
        toast({
          title: `"${label}" cancellata`,
          description: j?.deleted
            ? `${j.deleted} occorrenze future rimosse.`
            : "Lo storico è intatto.",
          variant: "success",
        });
      } else {
        toast({ title: "Errore nella cancellazione", variant: "error" });
      }
      setGroups((prev) => (prev ?? []).filter((x) => x.groupId !== g.groupId));
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (groups === null) {
    return (
      <div className="text-xs text-[var(--fg-subtle)] py-4">Carico stato ricorrenze…</div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 flex items-center gap-3">
        <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
        <div>
          <div className="text-sm font-medium">Nessuna ricorrenza configurata</div>
          <div className="text-[11px] text-[var(--fg-muted)] mt-0.5">
            {ignored.size > 0
              ? `${ignored.size} ricorrenza/e ignorata/e.`
              : "Crea una ricorrenza dalla pagina Movimenti per vederla qui."}
          </div>
        </div>
      </div>
    );
  }

  const expired = visible.filter((g) => g.status === "expired");
  const expiring = visible.filter((g) => g.status === "expiring");
  const active = visible.filter((g) => g.status === "active");
  const needsAttention = [...expired, ...expiring];

  return (
    <div className="space-y-6">
      {needsAttention.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs uppercase tracking-wider font-medium text-[var(--fg-muted)]">
              Da estendere
              <span className="ml-2 normal-case tracking-normal text-[var(--fg-subtle)]">
                {expired.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="size-3 text-rose-400" />
                    {expired.length} scadut{expired.length === 1 ? "a" : "e"}
                  </span>
                )}
                {expired.length > 0 && expiring.length > 0 && " · "}
                {expiring.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3 text-amber-400" />
                    {expiring.length} in scadenza
                  </span>
                )}
              </span>
            </div>
            {needsAttention.length >= 2 && (
              <button
                onClick={() => extendAll()}
                disabled={bulkExtending}
                className="h-8 px-3 rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-medium hover:bg-violet-500/25 hover:border-violet-500/60 inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Repeat className={cn("size-3.5", bulkExtending && "animate-spin")} />
                {bulkExtending
                  ? "Estendo tutte…"
                  : `Estendi tutte a fine anno (${needsAttention.length})`}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {needsAttention.map((g) => (
              <Row
                key={g.groupId}
                g={g}
                extending={extending === g.groupId}
                deleting={deleting === g.groupId}
                onExtend={() => extend(g.groupId, monthsUntilEndOfYear(new Date(g.lastDate)))}
                onIgnore={() => ignore(g.groupId)}
                onDelete={() => remove(g)}
              />
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider font-medium text-[var(--fg-muted)]">
            Attive
            <span className="ml-2 normal-case tracking-normal text-[var(--fg-subtle)]">
              {active.length} copert{active.length === 1 ? "a" : "e"} oltre i 45 giorni
            </span>
          </div>
          <div className="space-y-2">
            {active.map((g) => (
              <Row
                key={g.groupId}
                g={g}
                extending={extending === g.groupId}
                deleting={deleting === g.groupId}
                onExtend={() => extend(g.groupId, monthsUntilEndOfYear(new Date(g.lastDate)))}
                onIgnore={() => ignore(g.groupId)}
                onDelete={() => remove(g)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  g,
  extending,
  deleting,
  onExtend,
  onIgnore,
  onDelete,
}: {
  g: Group;
  extending: boolean;
  deleting: boolean;
  onExtend: () => void;
  onIgnore: () => void;
  onDelete: () => void;
}) {
  const isUrgent = g.status === "expired" || g.status === "expiring";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border",
        g.status === "expired"
          ? "border-rose-500/30 bg-rose-500/[0.04]"
          : g.status === "expiring"
            ? "border-amber-500/30 bg-amber-500/[0.04]"
            : "border-[var(--border)] bg-[var(--surface)]/40",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Repeat className="size-3 text-violet-400 shrink-0" />
        <span className="font-medium text-sm truncate">
          {g.beneficiary ?? "(senza nome)"}
        </span>
        <span
          className={cn(
            "tabular-nums text-xs",
            g.medianAmount > 0 ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {g.medianAmount > 0 ? "+" : ""}
          {formatEUR(g.medianAmount)}
        </span>
        {g.status !== "expired" && (
          <span className="text-[10px] text-[var(--fg-subtle)] shrink-0">
            prossimo {formatDate(g.nextDate ?? g.lastDate)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-[var(--fg-subtle)]">
          {g.status === "expired"
            ? `terminata il ${formatDate(g.lastDate)}`
            : `termina il ${formatDate(g.lastDate)}`}
        </span>
        {isUrgent && (
          <button
            onClick={onIgnore}
            className="text-xs h-7 px-2.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5"
            title="Non chiedere più per questa ricorrenza"
          >
            <EyeOff className="size-3" /> Ignora
          </button>
        )}
        <button
          onClick={onExtend}
          disabled={extending}
          className={cn(
            "text-xs h-7 px-3 rounded inline-flex items-center gap-1.5 disabled:opacity-50 border",
            isUrgent
              ? "bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/25"
              : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]",
          )}
        >
          {extending ? "Estendo…" : isUrgent ? "Estendi a fine anno" : "Estendi"}
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="size-7 inline-flex items-center justify-center rounded text-[var(--fg-muted)] hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50"
          title="Cancella le occorrenze future"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
