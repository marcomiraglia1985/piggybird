import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewAccountForm } from "@/components/conti/new-account-form";

export default function NewAccountPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <Link
          href="/conti"
          className="inline-flex items-center gap-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors mb-2"
        >
          <ArrowLeft className="size-3" /> Conti
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Aggiungi conto</h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Crea un nuovo conto. Apparirà nella tab Conti nella sezione del tipo scelto.
        </p>
      </header>
      <NewAccountForm />
    </div>
  );
}
