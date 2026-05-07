/**
 * e2e/smoke.spec.ts
 *
 * Smoke tests: verifican que las rutas principales cargan sin error.
 * Sin mocks — prueba la app real (auth incluido).
 * Útil como health check post-deploy.
 */

import { test, expect } from "@playwright/test";

test.describe("Smoke — rutas principales", () => {
  test("/clientes carga lista", async ({ page }) => {
    await page.goto("/clientes");
    // Debe mostrar la tabla de clientes o empty state (nunca error 500)
    await expect(
      page.getByText(/cliente/i).or(page.getByText(/Sin clientes/i))
    ).toBeVisible({ timeout: 12_000 });
    // Sin pantalla de error del servidor
    await expect(page.getByText(/Error interno/i)).not.toBeVisible();
  });

  test("/chat carga correctamente", async ({ page }) => {
    await page.goto("/chat");
    // Interfaz del chat visible
    await expect(
      page.getByText(/Aurora/i).or(page.getByText(/Consultor/i)).first()
    ).toBeVisible({ timeout: 12_000 });
  });

  test("/configuracion/auditoria carga (admin)", async ({ page }) => {
    await page.goto("/configuracion/auditoria");
    // Si es admin: tabla de auditoría; si no: redirect a /login
    const url = page.url();
    const isRedirected = url.includes("/login") || url === "/";
    if (!isRedirected) {
      await expect(
        page.getByText(/Registro de auditoría/i).or(page.getByText(/Sin registros/i))
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("/configuracion/uso-ia carga (admin)", async ({ page }) => {
    await page.goto("/configuracion/uso-ia");
    await expect(
      page.getByText(/Uso de los 4 roles/i).or(page.getByText(/tokens/i))
    ).toBeVisible({ timeout: 10_000 });
  });
});
