import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  monthKey,
  dismissKey,
  monthLabel,
  NOTIFY_SETTING_KEY,
} from "@/lib/piggybird-finance";
import { PiggybirdFinanceBannerDismiss } from "./piggybird-finance-banner-dismiss";

/**
 * Avviso "il numero del mese è in attesa di pubblicazione" — appare in alto
 * sotto la Topbar SOLO se l'utente ha attivato l'opzione nel widget settings.
 *
 * Condizioni di rendering:
 *  - opt-in attivo (Setting `pf-notify-new-issue`=true)
 *  - API key Anthropic configurata
 *  - almeno 2 NetWorthSnapshot (il detector richiede questo minimo)
 *  - il numero del mese corrente NON è ancora stato pubblicato
 *  - non è stato dismissato per il mese corrente
 *
 * Stile: paper crema con grana, font serif, doppio bordo — coerente con il
 * widget. Server component, zero JS bundle (eccetto il bottone X dismiss).
 */
export async function PiggybirdFinanceBanner() {
  const [notify, cred, snapshotCount, currentIssue, dismissed] = await Promise.all([
    prisma.setting.findUnique({ where: { key: NOTIFY_SETTING_KEY } }),
    prisma.apiCredential.findUnique({
      where: { provider: "anthropic" },
      select: { provider: true },
    }),
    prisma.netWorthSnapshot.count(),
    prisma.setting.findUnique({ where: { key: monthKey() } }),
    prisma.setting.findUnique({ where: { key: dismissKey() } }),
  ]);

  if (notify?.value !== "true") return null;
  if (!cred) return null;
  if (snapshotCount < 2) return null;
  if (currentIssue) return null;
  if (dismissed) return null;

  const label = monthLabel();

  return (
    <div className="px-6 pt-6">
      <div className="newspaper-paper relative max-w-7xl mx-auto rounded-xl border-2 border-double border-[#c8b890] p-5 font-serif">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex size-12 rounded-full border-2 border-double border-[#9b3d2c] items-center justify-center shrink-0 text-[#9b3d2c]">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#8a7a5e] font-sans">
              Piggybird Finance
            </div>
            <h2 className="text-lg font-bold tracking-tight text-[#0e0a06] mt-0.5">
              Il numero di {label} è in attesa di pubblicazione
            </h2>
            <p className="text-sm text-[#4a3f30] mt-1 leading-relaxed">
              La redazione ha pronti i dati. Apri il dashboard e dai il via
              alla stampa: un click e l&apos;edizione del mese va in pagina.
            </p>
            <div className="mt-3">
              <Link
                href="/#piggybird-finance"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white text-sm font-medium shadow-md shadow-orange-500/25 hover:shadow-orange-500/45 font-sans"
              >
                Vai al numero
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <PiggybirdFinanceBannerDismiss dismissedKey={dismissKey()} />
        </div>
      </div>
    </div>
  );
}
