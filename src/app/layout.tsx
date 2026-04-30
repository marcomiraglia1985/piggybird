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
import { SentryUserContext } from "@/components/sentry-user-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moneybird Finance",
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
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen">
        {/* Theme init è gestito da PreferencesBootstrap (client). Default
            `data-theme="dark"` è già sull'html sopra; un FOUC minimo sul
            theme light dura fino all'hydration. Usare `<script>` o
            `<Script beforeInteractive>` qui darebbe warning React 19. */}
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
              {!onboarded && <WelcomeOnboarding />}
            </ConfirmProvider>
          </ToastProvider>
        </PreferencesBootstrap>
      </body>
    </html>
  );
}
