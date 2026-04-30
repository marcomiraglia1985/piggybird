"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Variant = {
  name: string;
  count: number;
  countIn: number;
  countOut: number;
  sumIn: number;
  sumOut: number;
};
type Cluster = {
  key: string;
  variants: Variant[];
  totalTx: number;
  suggestedCanonical: string;
};

const DISMISSED_KEY = "fp-beneficiaries-dismissed";

export function BeneficiariesCleanupClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** Override del canonical scelto dall'utente per ogni cluster (key → name). */
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  /** Per ogni cluster, eventuale nome custom inserito (key → name). */
  const [custom, setCustom] = useState<Map<string, string>>(new Map());
  /** Varianti escluse dal batch di rinomina (key cluster → set di name esclusi). */
  const [excluded, setExcluded] = useState<Map<string, Set<string>>>(new Map());

  function toggleExclude(clusterKey: string, name: string) {
    setExcluded((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(clusterKey) ?? []);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      next.set(clusterKey, set);
      return next;
    });
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/beneficiaries/clusters");
      const json = await res.json();
      setClusters(json.clusters ?? []);
    } catch (e) {
      toast({
        title: "Errore caricamento cluster",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }

  function persistDismissed(set: Set<string>) {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  function dismissCluster(key: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      persistDismissed(next);
      return next;
    });
  }

  function clearDismissed() {
    setDismissed(new Set());
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch {}
  }

  const visibleClusters = useMemo(() => {
    if (!clusters) return [];
    return clusters
      .filter((c) => !dismissed.has(c.key))
      .filter((c) => !resolved.has(c.key));
  }, [clusters, dismissed, resolved]);

  async function applyCluster(c: Cluster) {
    const customName = custom.get(c.key)?.trim();
    const target =
      (customName && customName.length > 0
        ? customName
        : picked.get(c.key)) ?? c.suggestedCanonical;
    const skipSet = excluded.get(c.key) ?? new Set<string>();
    const fromList = c.variants
      .map((v) => v.name)
      .filter((n) => n !== target && !skipSet.has(n));
    if (fromList.length === 0) {
      toast({
        title: "Nessuna variante da rinominare",
        description: "Hai scelto come canonico il nome che è già il default.",
        variant: "info",
      });
      return;
    }
    setBusyKey(c.key);
    try {
      const res = await fetch("/api/beneficiaries/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: fromList, to: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResolved((prev) => {
        const next = new Set(prev);
        next.add(c.key);
        return next;
      });
      toast({
        title: `Rinominate ${json.updated} tx`,
        description: `Tutte ora hanno beneficiary "${target}".`,
        variant: "success",
      });
      router.refresh();
    } catch (e) {
      toast({
        title: "Errore rename",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="surface p-12 text-center">
        <Loader2 className="size-6 animate-spin mx-auto text-[var(--fg-muted)]" />
      </div>
    );
  }

  if (!clusters || clusters.length === 0) {
    return (
      <div className="surface p-12 text-center space-y-3">
        <Check className="size-10 text-emerald-400 mx-auto" />
        <p className="text-lg font-medium">Nessuna variante da consolidare</p>
        <p className="text-sm text-[var(--fg-muted)]">
          I beneficiari sono tutti scritti in modo coerente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="surface p-3 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">
            {visibleClusters.length}
          </span>
          <span className="text-[var(--fg-muted)]"> cluster da rivedere </span>
          <span className="text-[var(--fg-subtle)]">
            ({clusters.length} totali · {dismissed.size} skippati ·{" "}
            {resolved.size} già consolidati)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dismissed.size > 0 && (
            <button
              onClick={clearDismissed}
              className="h-8 px-3 rounded-md text-xs border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
            >
              Re-mostra skippati
            </button>
          )}
          <button
            onClick={() => {
              setResolved(new Set());
              refresh();
            }}
            className="h-8 px-3 rounded-md text-xs border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {visibleClusters.length === 0 ? (
        <div className="surface p-12 text-center space-y-3">
          <Check className="size-10 text-emerald-400 mx-auto" />
          <p className="text-lg font-medium">Tutti i cluster gestiti!</p>
          <p className="text-sm text-[var(--fg-muted)]">
            {resolved.size} consolidati ·{" "}
            {dismissed.size > 0 && `${dismissed.size} skippati come distinti`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleClusters.map((c) => {
            const customVal = custom.get(c.key) ?? "";
            const target =
              (customVal.trim().length > 0
                ? customVal.trim()
                : picked.get(c.key)) ?? c.suggestedCanonical;
            return (
              <div
                key={c.key}
                className="surface p-4 space-y-3 border-l-4 border-l-violet-500/40"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-[var(--fg-muted)]">
                    Cluster &quot;{c.key}&quot; ·{" "}
                    <span className="tabular-nums text-[var(--fg)] font-medium">
                      {c.totalTx} tx
                    </span>{" "}
                    su {c.variants.length} varianti
                  </div>
                  <button
                    onClick={() => dismissCluster(c.key)}
                    className="h-7 px-2.5 rounded text-[11px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)] hover:border-[var(--border-strong)] inline-flex items-center gap-1"
                    title="Sono varianti legittimamente diverse"
                  >
                    <X className="size-3" />
                    Skip
                  </button>
                </div>

                <div className="space-y-1.5">
                  {c.variants.map((v) => {
                    const isTarget = v.name === target;
                    const skipSet = excluded.get(c.key) ?? new Set<string>();
                    const isExcluded = skipSet.has(v.name);
                    const onlyIn = v.countIn > 0 && v.countOut === 0;
                    const onlyOut = v.countOut > 0 && v.countIn === 0;
                    const mixed = v.countIn > 0 && v.countOut > 0;
                    return (
                      <div
                        key={v.name}
                        className={cn(
                          "flex items-center gap-2 rounded-md border p-2 text-sm transition-colors",
                          isTarget
                            ? "border-violet-500/50 bg-violet-500/[0.06]"
                            : isExcluded
                              ? "border-[var(--border)] bg-[var(--surface-2)]/20 opacity-50"
                              : "border-[var(--border)] bg-[var(--surface-2)]/40 hover:border-[var(--border-strong)]",
                        )}
                      >
                        {/* Radio: scegli come canonical */}
                        <input
                          type="radio"
                          name={`canonical-${c.key}`}
                          checked={isTarget}
                          onChange={() => {
                            setCustom((prev) => {
                              const next = new Map(prev);
                              next.delete(c.key);
                              return next;
                            });
                            setPicked((prev) => {
                              const next = new Map(prev);
                              next.set(c.key, v.name);
                              return next;
                            });
                          }}
                          className="accent-violet-500 shrink-0"
                          title="Scegli come nome canonico"
                        />

                        {/* In/out indicator */}
                        <span
                          className={cn(
                            "shrink-0 size-5 inline-flex items-center justify-center rounded",
                            onlyIn && "bg-emerald-500/15 text-emerald-400",
                            onlyOut && "bg-rose-500/15 text-rose-400",
                            mixed && "bg-amber-500/15 text-amber-400",
                          )}
                          title={
                            onlyIn
                              ? `${v.countIn} entrate`
                              : onlyOut
                                ? `${v.countOut} uscite`
                                : `${v.countIn} entrate, ${v.countOut} uscite — MISTO`
                          }
                        >
                          {onlyIn && <ArrowDownLeft className="size-3" />}
                          {onlyOut && <ArrowUpRight className="size-3" />}
                          {mixed && <ArrowLeftRight className="size-3" />}
                        </span>

                        {/* Nome variante */}
                        <span className="truncate flex-1 min-w-0">{v.name}</span>

                        {/* Count */}
                        <span className="text-[11px] text-[var(--fg-subtle)] tabular-nums shrink-0">
                          ×{v.count}
                        </span>

                        {/* Checkbox includi/escludi (solo per non-canonical) */}
                        {!isTarget && (
                          <label
                            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-[var(--fg-muted)] cursor-pointer"
                            title={
                              isExcluded
                                ? "Esclusa dal batch — non verrà rinominata"
                                : "Inclusa nel batch — verrà rinominata"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggleExclude(c.key, v.name)}
                              className="accent-violet-500"
                            />
                            <span>Rinom.</span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                    Oppure usa un nome custom
                  </label>
                  <input
                    type="text"
                    value={customVal}
                    onChange={(e) => {
                      setCustom((prev) => {
                        const next = new Map(prev);
                        if (e.target.value.length > 0) {
                          next.set(c.key, e.target.value);
                        } else {
                          next.delete(c.key);
                        }
                        return next;
                      });
                    }}
                    placeholder={`Default: "${c.suggestedCanonical}"`}
                    className="w-full h-9 rounded-md bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {(() => {
                    const skipSet = excluded.get(c.key) ?? new Set<string>();
                    const toRename = c.variants.filter(
                      (v) => v.name !== target && !skipSet.has(v.name),
                    );
                    const txCount = toRename.reduce((s, v) => s + v.count, 0);
                    return (
                      <div className="text-xs text-[var(--fg-muted)]">
                        Tieni:{" "}
                        <span className="font-medium text-[var(--fg)]">
                          {target}
                        </span>{" "}
                        · rinomina {toRename.length} variant{toRename.length === 1 ? "e" : "i"} su{" "}
                        {txCount} tx
                        {skipSet.size > 0 && (
                          <span className="text-[var(--fg-subtle)]">
                            {" "}
                            ({skipSet.size} esclus{skipSet.size === 1 ? "a" : "e"})
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    disabled={busyKey === c.key}
                    onClick={() => applyCluster(c)}
                    className="h-8 px-3 rounded-md text-xs font-medium bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm hover:shadow-md disabled:opacity-50"
                  >
                    {busyKey === c.key ? "Applico…" : "Consolida"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
