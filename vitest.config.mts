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
      // Umbrales STARTER_TESTING — calibrados al perímetro testeable real.
      // Branches al 60 porque los tests UI no recorren todas las ramas
      // condicionales de loading/error/edge cases.
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 80,
        lines: 80,
      },
      // Solo archivos con lógica testeable. Excluidos:
      //  - Icons.tsx, Skeleton.tsx → solo JSX/SVG sin ramas
      //  - extract-test.ts → herramienta dev/debug, no prod
      //  - logging.ts/models.ts/usage.ts → mocks pesados de Supabase fuera de scope
      //  - settings.ts/client-services.ts → CRUD raw sin lógica derivada
      //  - schemas-only files → puro shape de zod
      // Excluidos del include (no-test):
      //  - lib/auth.ts y lib/ai/prompts.ts → requieren mockear @supabase/ssr
      //    (cookie store + NextRequest), scope para sprint dedicado.
      //  - lib/ai/extract-test.ts, logging.ts, models.ts, usage.ts → CRUD raw
      //    + dev tooling.
      //  - components/ui/Icons.tsx, Skeleton.tsx → solo JSX/SVG sin ramas.
      include: [
        "lib/audit-log.ts",
        "lib/catalogs/index.ts",
        "lib/clients.ts",
        "lib/env.ts",
        "lib/users.ts",
        "lib/validation.ts",
        "lib/ai/roles.ts",
        "components/ui/Button.tsx",
        "components/ui/ConfirmModal.tsx",
        "components/ui/Input.tsx",
        "components/ui/Modal.tsx",
        "components/ui/SkipLink.tsx",
        "components/ui/Toast.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
