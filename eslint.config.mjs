import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Historical copies and local artifacts are not application source.
    "recuperados/**",
    "_backup/**",
    "_legacy_backup/**",
    ".vercel/**",
    ".vercel-inspect/**",
    "logs/**",
    ".claude/**",
    "GeoModi-Impresion-V2/**",
  ]),
]);

export default eslintConfig;
