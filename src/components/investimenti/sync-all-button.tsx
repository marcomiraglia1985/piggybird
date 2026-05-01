"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

type Provider = "binance" | "revolut-x" | "stocks-prices";

type Target = {
  label: string;
  url: string;
  /** true → operazione lunga (≥30s), informa l'utente nel toast iniziale */
  slow?: boolean;
  /** true → fallimento non bloccante (es. permessi API insufficienti) */
  optional?: boolean;
};

/** Catalogo statico di tutti i sync conosciuti dal codice. La pagina padre
 *  passa solo i provider che l'utente ha effettivamente connesso → l'utente
 *  vede solo i sync rilevanti per la sua setup, mai placeholder vuoti. */
const CATALOG: Record<Provider, Target[]> = {
  binance: [
    { label: "Binance positions", url: "/api/integrations/binance/sync" },
    {
      label: "Binance storico trade",
      url: "/api/integrations/binance/import-history",
      slow: true,
      optional: true, // se la API key non ha "Read", il sync continua senza errore bloccante
    },
  ],
  "revolut-x": [
    { label: "Revolut X", url: "/api/integrations/revolut-x/sync" },
  ],
  "stocks-prices": [
    // Yahoo prices: agisce su qualsiasi StockPosition esista, no credenziali
    { label: "Stocks prezzi", url: "/api/integrations/stocks/refresh" },
  ],
};

type Result = {
  label: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
};

export function SyncAllButton({
  targets,
}: {
  targets: Array<{ provider: Provider }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const expanded: Target[] = targets.flatMap((t) => CATALOG[t.provider] ?? []);

  if (expanded.length === 0) {
    // Nessuna integrazione connessa: bottone disabled informativo
    return (
      <button
        disabled
        title="Connetti almeno un'integrazione (Binance, Revolut X) o importa stocks via CSV per abilitare il sync."
        className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-subtle)] text-sm font-medium inline-flex items-center gap-2 cursor-not-allowed"
      >
        <RefreshCw className="size-3.5" />
        Nessuna integrazione
      </button>
    );
  }

  async function syncAll() {
    setSyncing(true);
    if (expanded.some((t) => t.slow)) {
      toast({
        title: "Sync avviato",
        description:
          "Anche storico trade in corso (può richiedere ~1 min). Puoi continuare a usare l'app.",
        variant: "info",
      });
    }
    const out = await Promise.all(
      expanded.map(async (t): Promise<Result> => {
        try {
          const res = await fetch(t.url, { method: "POST" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            return {
              label: t.label,
              ok: false,
              detail: json?.error ?? `HTTP ${res.status}`,
              optional: t.optional,
            };
          }
          if (typeof json.totalEur === "number") {
            return {
              label: t.label,
              ok: true,
              detail: `€${(json.totalEur as number).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`,
            };
          }
          if (Array.isArray(json.updates)) {
            const ok = json.updates.filter((u: { ok: boolean }) => u.ok).length;
            return {
              label: t.label,
              ok: true,
              detail: `${ok}/${json.updates.length} aggiornati`,
            };
          }
          if (json.summary && typeof json.summary === "object") {
            const s = json.summary as {
              tradesInserted?: number;
              cryptoDepositsInserted?: number;
              cryptoWithdrawalsInserted?: number;
            };
            const newOnes =
              (s.tradesInserted ?? 0) +
              (s.cryptoDepositsInserted ?? 0) +
              (s.cryptoWithdrawalsInserted ?? 0);
            return { label: t.label, ok: true, detail: `${newOnes} nuovi` };
          }
          return { label: t.label, ok: true, detail: "ok" };
        } catch (e) {
          return {
            label: t.label,
            ok: false,
            detail: e instanceof Error ? e.message : "Errore",
            optional: t.optional,
          };
        }
      }),
    );
    // Invalida la cache della history /investimenti: ora i prezzi/posizioni
    // possono essere cambiati. Al prossimo accesso il chart viene ricalcolato
    // (e poi cached di nuovo via signature hash).
    fetch("/api/investments/cache/invalidate", { method: "POST" }).catch(() => {});

    setSyncing(false);

    const blockingErrors = out.filter((r) => !r.ok && !r.optional);
    const optionalErrors = out.filter((r) => !r.ok && r.optional);
    const successes = out.filter((r) => r.ok);

    if (blockingErrors.length === 0 && optionalErrors.length === 0) {
      toast({
        title: "Sync completato",
        description: successes.map((r) => `${r.label}: ${r.detail}`).join(" · "),
        variant: "success",
      });
    } else if (blockingErrors.length === 0) {
      toast({
        title: "Sync completato (con avvisi)",
        description: `${successes.map((r) => `${r.label}: ${r.detail}`).join(" · ")}. Falliti opzionali: ${optionalErrors.map((r) => r.label).join(", ")}`,
        variant: "info",
      });
    } else {
      toast({
        title: `Sync con ${blockingErrors.length} errore/i`,
        description: blockingErrors
          .map((r) => `${r.label}: ${r.detail}`)
          .join(" · "),
        variant: "error",
      });
    }
    router.refresh();
  }

  return (
    <button
      onClick={syncAll}
      disabled={syncing}
      className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 inline-flex items-center gap-2 disabled:opacity-50"
    >
      <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
      {syncing ? "Sincronizzo tutto…" : "Sync tutto"}
    </button>
  );
}
