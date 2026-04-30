import { ImportClient } from "@/components/import/import-client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importa CSV / XLSX</h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Carica un export bancario. Il formato è riconosciuto automaticamente,
          le categorie suggerite dallo storico, e i duplicati segnalati (anche
          con date sfasate fino a ±15 giorni).
        </p>
      </header>
      <ImportClient />
    </div>
  );
}
