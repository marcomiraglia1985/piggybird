import pkg from "../../../package.json";
import { BinanceConnect } from "@/components/impostazioni/binance-connect";
import { RevolutXConnect } from "@/components/impostazioni/revolut-x-connect";
import { StockTradesImport } from "@/components/impostazioni/stock-trades-import";
import { AiFeaturesSection } from "@/components/impostazioni/ai-features";
import { ProfiloSection } from "@/components/impostazioni/profilo-section";
import { PreferenzeSection } from "@/components/impostazioni/preferenze-section";
import { SistemaSection } from "@/components/impostazioni/sistema-section";
import { DatiSection } from "@/components/impostazioni/dati-section";
import { NotificheSection } from "@/components/impostazioni/notifiche-section";

export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  // Le card di integrazione (Binance, Revolut X) sono SEMPRE mostrate.
  // Ognuna gestisce internamente il proprio stato (credential configurata
  // → mostra hint + delete; non configurata → mostra form connect). In
  // questo modo l'utente vede sempre dove sono salvate le sue API key e
  // può rimuoverle anche se nessun account è (più) collegato a quel
  // provider.
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
          <div className="pb-5">
            <BinanceConnect />
          </div>
          <div className="py-5">
            <RevolutXConnect />
          </div>
          <div className="pt-5">
            <StockTradesImport />
          </div>
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
