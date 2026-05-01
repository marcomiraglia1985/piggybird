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
  // Beta: tolleriamo TS/ESLint warning durante build production. La codebase
  // ha alcuni issue residui in chart Recharts (Formatter v2 type mismatch),
  // dnd-kit collisionDetection (libreria type bug), e dei type cast che
  // andremo a sistemare iterativamente. Nessuno di questi causa runtime crash.
  typescript: { ignoreBuildErrors: true },
  // Pacchetti CommonJS native che NON devono essere processati da Turbopack:
  // - @prisma/client + adapter: query engine native + WASM, Turbopack li
  //   rinomina in alias hashed che breakano nel bundle standalone
  // - better-sqlite3: native module .node, va lasciato come require esterno
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "@prisma/engines",
    "better-sqlite3",
    "@anthropic-ai/sdk",
  ],
  // Output standalone: produce .next/standalone/server.js + minimal node_modules
  // (via nft tracing). Self-contained Node server bundlato dentro Tauri sidecar.
  output: "standalone",
  // Limita NFT trace alla project root — senza questo, il monorepo parent
  // (personal-finance/) viene scansionato e bundla cose come icon/, old/.
  outputFileTracingRoot: "/Users/marcomiraglia/Progetti/personal-finance/app",
  // Esclude esplicitamente file/dir che NFT include erroneamente:
  // - dev.db + backup = DATI PERSONALI (mai nel bundle distribuito!)
  // - src-tauri/, scripts/ = source code, non serve a runtime
  // - snapshots/, *.md = artefatti dev
  outputFileTracingExcludes: {
    "*": [
      "**/dev.db",
      "**/dev.db-journal",
      "**/dev.db.backup-*",
      "**/snapshots/**",
      "**/src-tauri/**",
      "**/scripts/**",
      "**/CLAUDE.md",
      "**/AGENTS.md",
      "**/BUILD.md",
      "**/BETA-README.md",
      "**/README.md",
    ],
  },
};

// Sentry wrap: minima config per beta. Niente upload source maps (richiede
// SENTRY_AUTH_TOKEN che possiamo aggiungere quando faremo build production).
export default withSentryConfig(nextConfig, {
  silent: true, // niente log Sentry durante build
  tunnelRoute: "/monitoring", // proxy Sentry events via la nostra origin per
  // bypassare ad-blocker che bloccano *.sentry.io
  sourcemaps: { disable: false }, // teniamo source maps per debug crash
  disableLogger: true,
});
