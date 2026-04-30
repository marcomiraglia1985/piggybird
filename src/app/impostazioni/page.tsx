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
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-[var(--fg-muted)] mt-0.5">
          Personalizza l&apos;app, gestisci integrazioni e configurazione del sistema.
        </p>
      </header>

      <Section title="Profilo">
        <ProfiloSection />
      </Section>

      <Section title="Preferenze">
        <PreferenzeSection />
      </Section>

      <Section title="Integrazioni">
        <BinanceConnect />
        <RevolutXConnect />
        <StockTradesImport />
        <AiFeaturesSection />
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
        💰 Moneybird Finance v{pkg.version} · Save smart. Fly higher.
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
