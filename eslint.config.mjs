import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Codebase-specific:
    "src-tauri/**",
    "src/generated/**",
    "scripts/**",
    "src-tauri/standalone/**",
  ]),
  // Custom rules
  {
    rules: {
      // Console.log in production code è rumore; warn ma permetti console.warn/error
      // perché spesso usati per fault reporting legittimo.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]);

export default eslintConfig;
