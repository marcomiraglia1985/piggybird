import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config minimale per smoke test e regression check.
 * - alias `@/` → `src/` come Next.js
 * - environment: "node" di default (vedi singoli test per UI)
 * - include: solo `__tests__/**` e `*.test.ts(x)` co-locati
 * - exclude: scripts, src-tauri, generated Prisma client
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      "src-tauri/**",
      "scripts/**",
      "src/generated/**",
      ".next/**",
    ],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
