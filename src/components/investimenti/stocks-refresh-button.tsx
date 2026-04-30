"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function StocksRefreshButton({ lastUpdated }: { lastUpdated: string | null }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRefreshed, setJustRefreshed] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/stocks/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      const ok = json.updates.filter((u: { ok: boolean }) => u.ok).length;
      const fail = json.updates.length - ok;
      setJustRefreshed(`${ok} aggiornati${fail > 0 ? `, ${fail} falliti` : ""}`);
      setTimeout(() => setJustRefreshed(null), 2500);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={refresh}
        disabled={refreshing}
        className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center gap-2 disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        {refreshing ? "Aggiorno…" : "Refresh prezzi"}
      </button>
      <div className="text-[11px] text-[var(--fg-subtle)]">
        {justRefreshed ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-flex items-center gap-1 text-emerald-400"
          >
            <CheckCircle2 className="size-3" /> {justRefreshed}
          </motion.span>
        ) : lastUpdated ? (
          `Ultimo aggiornamento: ${new Date(lastUpdated).toLocaleString("it-IT")}`
        ) : (
          "Mai aggiornato"
        )}
      </div>
      {error && (
        <div className="text-[11px] text-rose-400 inline-flex items-center gap-1">
          <AlertTriangle className="size-3" /> {error}
        </div>
      )}
    </div>
  );
}
