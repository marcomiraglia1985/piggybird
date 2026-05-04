"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  initTelemetry,
  trackPageViewed,
  trackAppOpened,
} from "@/lib/telemetry";

/**
 * Componente invisible montato in layout.tsx: auto-init PostHog al mount
 * (rispetta il setting telemetry.enabled — default ON), poi traccia
 * trackPageViewed ad ogni cambio route + trackAppOpened (heartbeat) al
 * mount iniziale. Se l'utente ha opt-out da Impostazioni → Privacy, init
 * non parte e gli event sono no-op.
 */
export function TelemetryRouterTracker() {
  const pathname = usePathname();

  useEffect(() => {
    void initTelemetry().then(() => {
      void trackAppOpened();
    });
  }, []);

  useEffect(() => {
    if (pathname) trackPageViewed(pathname);
  }, [pathname]);

  return null;
}
