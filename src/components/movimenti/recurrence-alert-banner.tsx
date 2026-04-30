"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Repeat, X, ChevronRight, EyeOff } from "lucide-react";
import { formatEUR, formatDate, cn } from "@/lib/utils";
import {
  getIgnoredRecurrences,
  ignoreRecurrence,
  monthsUntilEndOfYear,
} from "@/lib/recurrence-client";

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

const DISMISS_KEY = "fp-recurrence-alert-dismissed";

export function RecurrenceAlertBanner() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [extending, setExtending] = useState<string | null>(null);
  const [bulkExtending, setBulkExtending] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(DISMISS_KEY);
      if (stored === "1") setDismissed(true);
    } catch {}
    setIgnored(getIgnoredRecurrences());
    fetch("/api/transactions/recurrence-status")
      .then((r) => r.json())
      // Banner: solo expired/expiring. Le active si vedono nella pagina dedicata.
      .then((j) =>
        setGroups((j.groups ?? []).filter((g: Group) => g.status !== "active")),
      )
      .catch(() => null);
  }, []);

  const visible = useMemo(
    () => groups.filter((g) => !ignored.has(g.groupId)),
    [groups, ignored],
  );

  async function extend(groupId: string, months: number) {
    setExtending(groupId);
    try {
      await fetch("/api/transactions/recurrence-extend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, months }),
      });
      setGroups((prev) => prev.filter((g) => g.groupId !== groupId));
      router.refresh();
    } finally {
      setExtending(null);
    }
  }

  async function extendAll() {
    setBulkExtending(true);
    try {
      await Promise.all(
        visible.map((g) =>
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
      setGroups([]);
      router.refresh();
    } finally {
      setBulkExtending(false);
    }
  }

  function ignore(groupId: string) {
    ignoreRecurrence(groupId);
    setIgnored((prev) => new Set(prev).add(groupId));
  }

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  if (dismissed || visible.length === 0) return null;

  const expired = visible.filter((g) => g.status === "expired");
  const expiring = visible.filter((g) => g.status === "expiring");
  const isUrgent = expired.length > 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isUrgent
          ? "border-rose-500/40 bg-gradient-to-br from-rose-500/[0.08] via-[var(--surface)] to-rose-500/[0.04]"
          : "border-amber-500/40 bg-gradient-to-br from-amber-500/[0.08] via-[var(--surface)] to-amber-500/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className={cn(
              "size-5 shrink-0 mt-0.5",
              isUrgent ? "text-rose-400" : "text-amber-400",
            )}
          />
          <div>
            <h3 className="text-sm font-medium">
              {expired.length > 0 && (
                <>
                  {expired.length} ricorrenz{expired.length === 1 ? "a scaduta" : "e scadute"}
                </>
              )}
              {expired.length > 0 && expiring.length > 0 && " · "}
              {expiring.length > 0 && (
                <>
                  {expiring.length} in scadenza
                </>
              )}
            </h3>
            <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
              {isUrgent
                ? "Estendi per non interrompere il cashflow forecast."
                : "L'ultima occorrenza è entro 45 giorni — vuoi estendere già?"}
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="size-7 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] text-[var(--fg-muted)]"
          title="Nascondi (riapparirà alla prossima sessione)"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {visible.length >= 2 && (
        <button
          onClick={() => extendAll()}
          disabled={bulkExtending}
          className="w-full mb-2 h-9 px-4 rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-300 text-xs font-medium hover:bg-violet-500/25 hover:border-violet-500/60 inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Repeat className={cn("size-3.5", bulkExtending && "animate-spin")} />
          {bulkExtending
            ? "Estendo tutte…"
            : `Estendi TUTTE le ${visible.length} ricorrenze a fine anno`}
        </button>
      )}
      <div className="space-y-2">
        {visible.slice(0, 4).map((g) => {
          const months = monthsUntilEndOfYear(new Date(g.lastDate));
          return (
            <div
              key={g.groupId}
              className="flex items-center justify-between gap-3 surface-2 px-3 py-2 rounded-lg"
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
                <span className="text-[10px] text-[var(--fg-subtle)]">
                  {g.status === "expired"
                    ? `terminata il ${formatDate(g.lastDate)}`
                    : `prossimo ${formatDate(g.nextDate ?? g.lastDate)} · termina il ${formatDate(g.lastDate)}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => ignore(g.groupId)}
                  className="size-7 inline-flex items-center justify-center rounded hover:bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  title="Non chiedere più per questa ricorrenza"
                >
                  <EyeOff className="size-3.5" />
                </button>
                <button
                  onClick={() => extend(g.groupId, months)}
                  disabled={extending === g.groupId}
                  className="text-xs h-7 px-3 rounded bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {extending === g.groupId ? "Estendo…" : "A fine anno"}
                  <ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
        {visible.length > 4 && (
          <Link
            href="/movimenti/ricorrenze#status"
            className="block text-center text-[11px] text-violet-400 hover:underline pt-1"
          >
            Vedi tutte ({visible.length})
          </Link>
        )}
      </div>
    </div>
  );
}
