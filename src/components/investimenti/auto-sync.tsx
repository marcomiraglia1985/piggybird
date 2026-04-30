"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, AlertTriangle, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 30 * 60 * 1000; // 30 min
const FOCUS_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
const STORAGE_KEY = "fp-auto-sync-disabled";

const TARGETS = [
  { label: "Binance", url: "/api/integrations/binance/sync" },
  { label: "Revolut X", url: "/api/integrations/revolut-x/sync" },
  { label: "Stocks", url: "/api/integrations/stocks/refresh" },
];

/**
 * Auto-sync silenzioso degli investimenti:
 *  - ogni INTERVAL_MS mentre la pagina è aperta
 *  - quando il tab torna in focus, se è passato > FOCUS_THRESHOLD_MS dall'ultimo sync
 * Nessun toast invadente: solo indicatore discreto. Disattivabile.
 */
export function InvestmentsAutoSync() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [errored, setErrored] = useState(false);
  const lastSyncRef = useRef<number>(0);
  const enabledRef = useRef(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setEnabled(false);
    } catch {}
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  async function syncAll() {
    if (syncing) return;
    setSyncing(true);
    setErrored(false);
    try {
      const results = await Promise.allSettled(
        TARGETS.map((t) => fetch(t.url, { method: "POST" }).then((r) => r.ok)),
      );
      const allOk = results.every((r) => r.status === "fulfilled" && r.value);
      setErrored(!allOk);
      lastSyncRef.current = Date.now();
      setLastSync(new Date());
      router.refresh();
    } catch {
      setErrored(true);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const handle = setInterval(() => {
      if (enabledRef.current) syncAll();
    }, INTERVAL_MS);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    function onFocus() {
      const elapsed = Date.now() - lastSyncRef.current;
      if (elapsed > FOCUS_THRESHOLD_MS) syncAll();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "0" : "1");
    } catch {}
  }

  // Stato visuale: priorità syncing > errored > enabled > disabled
  const state: "syncing" | "errored" | "active" | "off" = syncing
    ? "syncing"
    : errored
      ? "errored"
      : enabled
        ? "active"
        : "off";

  // Token --color-*-text/-soft cambiano col tema (light/dark) per garantire
  // contrasto leggibile contro i pill colorati su entrambe le palette.
  const stateStyles: Record<
    typeof state,
    { pill: string; dot: string; label: string }
  > = {
    syncing: {
      pill: "bg-gradient-to-br from-violet-500/[0.12] to-indigo-500/[0.06] border-violet-500/30 hover:border-violet-500/50",
      dot: "bg-violet-500",
      label: "text-[var(--color-violet-text)]",
    },
    errored: {
      pill: "bg-gradient-to-br from-rose-500/[0.12] to-rose-500/[0.04] border-rose-500/30 hover:border-rose-500/50",
      dot: "bg-rose-500",
      label: "text-[var(--color-rose-text)]",
    },
    active: {
      pill: "bg-gradient-to-br from-emerald-500/[0.10] to-emerald-500/[0.04] border-emerald-500/30 hover:border-emerald-500/50",
      dot: "bg-emerald-500",
      label: "text-[var(--color-emerald-text)]",
    },
    off: {
      pill: "bg-[var(--color-surface-2)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
      dot: "bg-[var(--color-fg-subtle)]",
      label: "text-[var(--color-fg-muted)]",
    },
  };

  const styles = stateStyles[state];
  const elapsedLabel = lastSync ? formatRelative(lastSync) : enabled ? "in attesa…" : null;

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? "Disabilita auto-sync" : "Abilita auto-sync"}
      className={cn(
        "group inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg text-xs font-medium border transition-colors",
        styles.pill,
      )}
    >
      <span className="relative inline-flex size-2">
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            styles.dot,
            state === "syncing" && "animate-ping opacity-60",
          )}
        />
        <span className={cn("relative size-2 rounded-full", styles.dot)} />
      </span>

      <span className={cn("inline-flex items-center gap-1.5", styles.label)}>
        {state === "syncing" ? (
          <motion.span className="inline-flex items-center gap-1.5">
            <RefreshCw className="size-3 animate-spin" />
            <span>Sync in corso…</span>
          </motion.span>
        ) : state === "errored" ? (
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3" />
            <span>Errore sync</span>
          </span>
        ) : (
          <>
            <span>Auto-sync {enabled ? "attivo" : "off"}</span>
            {elapsedLabel && (
              <>
                <span className="opacity-50">·</span>
                <span className="opacity-80 tabular-nums">{elapsedLabel}</span>
              </>
            )}
          </>
        )}
      </span>

      <span className="size-5 inline-flex items-center justify-center rounded-md bg-[var(--color-surface)]/40 ml-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
        {enabled ? <Pause className="size-3" /> : <Play className="size-3" />}
      </span>
    </button>
  );
}

function formatRelative(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s fa`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h fa`;
}
