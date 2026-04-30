import { RecurrenceStatusList } from "@/components/movimenti/recurrence-status-list";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-8">
      <header>
        <div className="mb-2">
          <Link
            href="/movimenti"
            className="inline-flex items-center gap-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
          >
            <ArrowLeft className="size-3" /> Movimenti
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <span>🔁</span> Ricorrenze
        </h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Le ricorrenze che hai creato manualmente. Estendile prima che scadano per
          mantenere il forecast del cashflow allineato.
        </p>
      </header>

      <section id="status" className="scroll-mt-20">
        <RecurrenceStatusList />
      </section>
    </div>
  );
}
