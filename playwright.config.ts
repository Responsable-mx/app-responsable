import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — App ResponSable
 *
 * Requisitos:
 *   E2E_BASE_URL   URL del app (default: http://localhost:3000)
 *   E2E_TEST_EMAIL Email de usuario consultor activo para tests
 *   SUPABASE_URL   (ya en .env.local)
 *   SUPABASE_SERVICE_ROLE_KEY  (ya en .env.local)
 *
 * Correr local:
 *   npm run dev &            # arrancar Next.js
 *   npm run test:e2e         # correr tests
 *
 * Smoke test contra producción:
 *   E2E_BASE_URL=https://app.responsable.net npm run test:e2e
 */

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // usuarios comparten DB → serializar para evitar conflictos
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-MX",
  },

  projects: [
    // 1. Setup: obtiene auth state vía magic link de Supabase admin
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // 2. Tests Chrome usando auth state guardado por setup
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
