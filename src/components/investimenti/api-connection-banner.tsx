import Link from "next/link";
import { CheckCircle2, KeyRound, RefreshCw, ArrowRight } from "lucide-react";

/**
 * Banner di stato API mostrato sulle pagine di dettaglio dei conti investimento.
 *
 * Tre stati:
 *   - "connected": il provider del conto ha una API integration in Piggybird
 *     (vedi `account-providers.ts` → hasIntegration=true) E l'utente ha
 *     già configurato la credential
 *   - "available": il provider ha API integration ma la credential manca
 *     → CTA "Collega in Impostazioni"
 *   - "manual":    il provider non è registrato come integrato in
 *     account-providers (provider="generic" o broker non ancora aggiunto)
 *     → istruzioni su CSV / manuale
 *
 * Il `providerLabel` è opzionale e usato solo nei messaggi "connected"/
 * "available" per umanizzare il nome (es. "Binance"). Per "manual" non viene
 * mostrato — il messaggio è generico per qualunque broker non integrato.
 */
export function ApiConnectionBanner({
  status,
  providerLabel,
  manualHint,
}: {
  status: "connected" | "available" | "manual";
  /** Nome leggibile del provider (es. "Binance"). Solo per status connected/available. */
  providerLabel?: string;
  /** Override testo per status="manual" (es. "Aggiorna i prezzi col bottone Refresh in alto"). */
  manualHint?: string;
}) {
  if (status === "connected") {
    return (
      <div className="surface p-3 border border-emerald-500/30 bg-emerald-500/[0.05] flex items-start gap-3">
        <CheckCircle2 className="size-5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <div className="font-medium text-emerald-700 dark:text-emerald-200">
            API {providerLabel} connessa
          </div>
          <div className="text-[var(--color-fg-muted)] mt-0.5">
            Il sync automatico è attivo. Gestisci la credenziale (rinnova / rimuovi) in{" "}
            <Link
              href="/impostazioni"
              className="text-emerald-700 dark:text-emerald-300 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Impostazioni → Integrazioni
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (status === "available") {
    return (
      <div className="surface p-3 border border-amber-500/40 bg-amber-500/[0.06] flex items-start gap-3">
        <KeyRound className="size-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <div className="font-medium text-amber-700 dark:text-amber-200">
            Collega l&apos;API {providerLabel} per il sync automatico
          </div>
          <div className="text-[var(--color-fg-muted)] mt-0.5">
            Senza credenziali devi aggiornare i saldi a mano o via import CSV.
            Configura la chiave read-only in{" "}
            <Link
              href="/impostazioni"
              className="text-amber-700 dark:text-amber-300 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              Impostazioni → Integrazioni
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    );
  }
  // manual
  return (
    <div className="surface p-3 border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 flex items-start gap-3">
      <RefreshCw className="size-5 text-[var(--color-fg-muted)] shrink-0 mt-0.5" />
      <div className="flex-1 text-xs">
        <div className="font-medium text-[var(--color-fg)]">
          Aggiornamento manuale
        </div>
        <div className="text-[var(--color-fg-muted)] mt-0.5 leading-relaxed">
          {manualHint ?? (
            <>
              Per questo conto non c&apos;è un&apos;integrazione API automatica
              in Piggybird. Aggiornalo tramite{" "}
              <Link
                href="/import"
                className="text-violet-700 dark:text-violet-300 hover:underline font-medium"
              >
                import CSV / Excel
              </Link>{" "}
              o inserimento manuale dei movimenti.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
