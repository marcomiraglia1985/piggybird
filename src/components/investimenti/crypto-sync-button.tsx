"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CryptoSyncButton({ lastSync }: { lastSync: string | null }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSynced, setJustSynced] = useState(false);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/binance/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore sync");
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sync}
        disabled={syncing}
        className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center gap-2 disabled:opacity-50"
      >
        <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
        {syncing ? "Sincronizzo…" : "Sync ora"}
      </button>
      <div className="text-[11px] text-[var(--fg-subtle)]">
        {justSynced ? (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="inline-flex items-center gap-1 text-emerald-400"
          >
            <CheckCircle2 className="size-3" /> Aggiornato!
          </motion.span>
        ) : lastSync ? (
          `Ultimo sync: ${new Date(lastSync).toLocaleString("it-IT")}`
        ) : (
          "Mai sincronizzato"
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
