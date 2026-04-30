import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Disabilita il "dev indicator" (badge "N" in basso a sx con route/bundler).
  // È solo dev; in produzione non compare comunque. Inutile per noi.
  devIndicators: false,
  // React Strict Mode off in dev: con Next 16 + React 19 + framer-motion 12
  // (motion.div con layoutId in renderable .map) viene emesso un warning
  // "Each child in a list should have a unique key" spurio durante il
  // double-render di strict mode. Funzionalmente nulla rotto. In produzione
  // il flag è ignorato comunque.
  reactStrictMode: false,
};

// Sentry wrap: minima config per beta. Niente upload source maps (richiede
// SENTRY_AUTH_TOKEN che possiamo aggiungere quando faremo build production).
export default withSentryConfig(nextConfig, {
  silent: true, // niente log Sentry durante build
  // Source maps upload richiede auth token + org/project — skip per dev
  // beta. Quando faremo release production aggiungeremo i flag.
  tunnelRoute: "/monitoring", // proxy Sentry events via la nostra origin per
  // bypassare ad-blocker che bloccano *.sentry.io
  hideSourceMaps: true,
  disableLogger: true,
});
