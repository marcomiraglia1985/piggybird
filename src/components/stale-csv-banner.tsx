import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { getStaleCsvAccounts, STALE_CSV_DAYS } from "@/lib/queries/csv-staleness";

/**
 * Friendly reminder mostrato sotto la Topbar, sopra il main content.
 * Render server-side: zero JS bundle, niente flicker. Si rivaluta a ogni
 * navigazione (App Router server component cache su request scope).
 *
 * Nasconde sé stesso se nessun conto è stale (la maggior parte dei caricamenti).
 */
export async function StaleCsvBanner() {
  const stale = await getStaleCsvAccounts().catch(() => []);
  if (stale.length === 0) return null;

  const MAX_NAMES = 3;
  const visible = stale.slice(0, MAX_NAMES);
  const extraCount = stale.length - visible.length;
  const namesLabel =
    visible.map((a) => `${a.emoji ?? "💳"} ${a.name}`).join(", ") +
    (extraCount > 0 ? ` e ${extraCount} altri` : "");

  const oldestDays = stale[0].daysSince;
  const subjectLabel =
    stale.length === 1
      ? `${stale[0].daysSince} giorni`
      : `fino a ${oldestDays} giorni`;

  return (
    <div className="px-6 pt-6">
      <div className="surface p-5 bg-gradient-to-br from-amber-500/[0.06] via-[var(--surface)] to-orange-500/[0.04] border border-orange-500/30 max-w-7xl mx-auto">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
            <Clock className="size-6 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              CSV in attesa di aggiornamento
            </h2>
            <p className="text-sm text-[var(--fg-muted)] mt-1 leading-relaxed">
              Sono passati {subjectLabel} dall&apos;ultimo import su{" "}
              <span className="text-[var(--fg)] font-medium">{namesLabel}</span>.
              Carica un nuovo estratto per tenere saldi e movimenti allineati.
            </p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Link
                href="/import"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white text-sm font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/45"
              >
                Vai a Importa
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { STALE_CSV_DAYS };
