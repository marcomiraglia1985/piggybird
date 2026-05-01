import pkg from "../../../package.json";
import Link from "next/link";
import { BinanceConnect } from "@/components/impostazioni/binance-connect";
import { RevolutXConnect } from "@/components/impostazioni/revolut-x-connect";
import { StockTradesImport } from "@/components/impostazioni/stock-trades-import";
import { AiFeaturesSection } from "@/components/impostazioni/ai-features";
import { ProfiloSection } from "@/components/impostazioni/profilo-section";
import { PreferenzeSection } from "@/components/impostazioni/preferenze-section";
import { SistemaSection } from "@/components/impostazioni/sistema-section";
import { DatiSection } from "@/components/impostazioni/dati-section";
import { NotificheSection } from "@/components/impostazioni/notifiche-section";
import { prisma } from "@/lib/prisma";
import { getActiveIntegrationProviders } from "@/lib/account-providers";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  // Gating integrazioni: mostra solo card per provider che l'utente ha
  // effettivamente collegato a 1+ account.
  const accounts = await prisma.account.findMany({
    select: { provider: true },
    where: { active: true },
  });
  const activeProviders = getActiveIntegrationProviders(accounts);
  const hasBinance = activeProviders.some((p) => p.id === "binance");
  const hasRevolutX = activeProviders.some((p) => p.id === "revolut-x");
  const anyIntegration = hasBinance || hasRevolutX;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Personalizza l&apos;app, gestisci integrazioni e configurazione del sistema.
        </p>
      </header>

      {/* Profilo + Preferenze affiancati su large viewport (≥md), stacked
          su mobile. Entrambi i box hanno max-w-md → si allineano bene. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <Section title="Profilo">
          <ProfiloSection />
        </Section>
        <Section title="Preferenze">
          <PreferenzeSection />
        </Section>
      </div>

      <Section title="AI Features">
        <div className="surface p-5">
          <AiFeaturesSection />
        </div>
      </Section>

      <Section title="Integrazioni">
        <div className="surface p-5 divide-y divide-[var(--border)]/50 space-y-0">
          {hasBinance && (
            <div className={anyIntegration ? "pb-5" : ""}>
              <BinanceConnect />
            </div>
          )}
          {hasRevolutX && (
            <div className={hasBinance ? "py-5" : "pb-5"}>
              <RevolutXConnect />
            </div>
          )}
          <div className={anyIntegration ? "pt-5" : ""}>
            <StockTradesImport />
          </div>
          {!anyIntegration && (
            <div className="mt-5 pt-5 border-t border-[var(--border)]/50">
              <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
                Nessuna integrazione API attiva. Per attivare il sync automatico
                di Binance o Revolut X,{" "}
                <Link
                  href="/conti/nuovo?type=investment"
                  className="text-violet-700 dark:text-violet-300 hover:underline inline-flex items-center gap-1"
                >
                  crea un conto investimento
                  <Plus className="size-3" />
                </Link>
                {" "}e seleziona il provider corrispondente.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Sistema">
        <SistemaSection version={pkg.version} />
      </Section>

      <Section title="Dati">
        <DatiSection />
      </Section>

      <Section title="Notifiche">
        <NotificheSection />
      </Section>

      <p className="text-[11px] text-[var(--fg-subtle)] text-center pt-4 pb-2">
        💰 Piggybird v{pkg.version} · Save smart. Fly higher.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--fg-muted)] px-1">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
