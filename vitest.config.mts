import { defineConfig } from "vitest/config";
import path from "node:path";

// Nota: environment 'node' por default (workers OneDrive).
// Los archivos *.ui.test.tsx overridean a jsdom via /** @vitest-environment jsdom */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.{ts,tsx,mts,mjs}"],
    setupFiles: ["__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/supabase/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
