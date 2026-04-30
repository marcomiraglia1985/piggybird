import { Pencil } from "lucide-react";
import { BeneficiariesCleanupClient } from "@/components/movimenti/beneficiaries-cleanup-client";

export const dynamic = "force-dynamic";

export default function BeneficiariCleanupPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Pencil className="size-5 text-violet-300" />
          Pulisci varianti beneficiari
        </h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Trova nomi che sono in realtà la stessa cosa scritta diversamente
          (es. &quot;ATM&quot; / &quot;atm&quot; / &quot;Atm&quot;) e
          consolidali in un unico nome canonico.
        </p>
      </header>
      <BeneficiariesCleanupClient />
    </div>
  );
}
