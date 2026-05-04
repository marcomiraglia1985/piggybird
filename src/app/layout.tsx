import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { PreferencesBootstrap } from "@/components/preferences-bootstrap";
import { CommandPalette } from "@/components/command-palette";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";
import { getFreezeState } from "@/lib/account-freeze";
import { prisma } from "@/lib/prisma";
import { estateValueStatus } from "@/lib/estate-value";
import { hasCompletedOnboarding } from "@/lib/user-profile";
import { WelcomeOnboarding } from "@/components/welcome-onboarding";
import { TelemetryRouterTracker } from "@/components/telemetry-router-tracker";
import { SentryUserContext } from "@/components/sentry-user-context";
import { DebugSnapshotSection } from "@/components/impostazioni/debug-snapshot-section";
import NextTopLoader from "nextjs-toploader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Piggybird",
  description: "Sistema personale di gestione finanze",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { frozen: accountsFrozen } = await getFreezeState();
  // Conta gli immobili che hanno bisogno di una riconferma del valore
  // (alert sidebar accanto a "Estates" se >0).
  const ownedEstates = await prisma.realEstate.findMany({
    where: { active: true, holding: "owned" },
    select: {
      currentValue: true,
      currentValueUpdatedAt: true,
      purchasePrice: true,
      purchaseDate: true,
    },
  });
  const estatesAlert = ownedEstates.filter((e) => estateValueStatus(e).needsAlert).length;
  const onboarded = await hasCompletedOnboarding();
  return (
    <html
      lang="it"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen">
        {/* Theme init è gestito da PreferencesBootstrap (client). Default
            `data-theme="light"` è già sull'html sopra; un FOUC minimo sul
            theme dark dura fino all'hydration per gli utenti che hanno
            scelto dark. Usare `<script>` o `<Script beforeInteractive>` qui
            darebbe warning React 19. */}
        {/* Top progress bar: feedback immediato al click su Link, indipendente
            da loading.tsx. Risolve la sensazione di "app freezata" in dev mode
            quando Next.js compila on-demand. */}
        <NextTopLoader
          color="#8b5cf6"
          height={3}
          showSpinner={false}
          shadow="0 0 10px #8b5cf6,0 0 5px #8b5cf6"
        />
        <PreferencesBootstrap>
          <ToastProvider>
            <ConfirmProvider>
              <div className="flex">
                <Sidebar accountsFrozen={accountsFrozen} estatesAlert={estatesAlert} />
                <div className="flex-1 flex flex-col min-w-0">
                  <Topbar />
                  <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
                </div>
              </div>
              <CommandPalette />
              <SentryUserContext />
              {/* Floating "Report a bug" button: visibile su tutte le pagine */}
              <DebugSnapshotSection />
              {!onboarded && <WelcomeOnboarding />}
              <TelemetryRouterTracker />
            </ConfirmProvider>
          </ToastProvider>
        </PreferencesBootstrap>
      </body>
    </html>
  );
}
