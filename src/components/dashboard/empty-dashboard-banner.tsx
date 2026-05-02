import Link from "next/link";
import { PlusCircle, Sparkles } from "lucide-react";

/**
 * Banner mostrato sul dashboard quando l'utente non ha ancora alcun conto.
 * CTA primario: aggiungere il primo conto. Senza questo, il KPI hero mostra
 * 0,00 € e l'app sembra "vuota" senza guidance.
 *
 * Reso solo quando `accounts.length === 0`. Una volta che l'utente aggiunge
 * un conto, scompare automaticamente al refresh.
 */
export function EmptyDashboardBanner() {
  return (
    <div className="surface p-6 mb-4 bg-gradient-to-br from-violet-500/[0.06] via-[var(--surface)] to-indigo-500/[0.04] border border-violet-500/30">
      <div className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
          <Sparkles className="size-6 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            Benvenuto su Piggybird 🐤
          </h2>
          <p className="text-sm text-[var(--fg-muted)] mt-1 leading-relaxed">
            Per iniziare aggiungi il tuo primo conto: corrente, contanti, risparmi
            o investimenti. I tuoi dati restano sul tuo Mac, niente cloud.
          </p>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Link
              href="/conti/nuovo"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-md shadow-violet-500/25 hover:shadow-violet-500/40"
            >
              <PlusCircle className="size-4" />
              Aggiungi un conto
            </Link>
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)]"
            >
              Importa da CSV
            </Link>
            <Link
              href="/impostazioni"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
            >
              Vai a Impostazioni
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
