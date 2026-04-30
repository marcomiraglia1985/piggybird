import { Loader2 } from "lucide-react";

/**
 * Loader fullscreen centrato per le pagine in caricamento. Usato come
 * fallback dei file `loading.tsx` di Next.js (Suspense).
 *
 * Mostrato per le navigation > ~200ms — sotto è invisibile, sopra evita
 * la sensazione di "app bloccata".
 */
export function PageLoader({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 text-[var(--fg-muted)]">
        <Loader2 className="size-8 animate-spin text-violet-400" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}
