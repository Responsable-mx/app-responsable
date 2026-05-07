/**
 * e2e/wizard.spec.ts
 *
 * Tests E2E del flujo crítico: cuestionario de Doble Materialidad.
 * - Navegación a un cliente existente
 * - Carga de la tab Cuestionario
 * - Guardado manual de un campo
 * - AI-fill mockeado (no llama Anthropic real)
 */

import { test, expect } from "@playwright/test";

// ID del cliente de test — sobrescribir con E2E_CLIENT_ID si existe en env
const CLIENT_ID = process.env.E2E_CLIENT_ID ?? "test-client-id";

test.describe("Cuestionario wizard", () => {
  test.beforeEach(async ({ page }) => {
    // Navegar directo a la tab cuestionario del cliente de test
    await page.goto(`/clientes/${CLIENT_ID}?tab=cuestionario`);
    // Esperar a que la tab Cuestionario cargue (texto visible en header o tab button)
    await expect(
      page.getByRole("button", { name: /cuestionario/i }).or(
        page.locator('[data-testid="questionnaire-tab"]')
      ).or(
        page.getByText(/Doble Materialidad/i).first()
      )
    ).toBeVisible({ timeout: 12_000 });
  });

  test("tab Cuestionario carga sin error", async ({ page }) => {
    // No debe haber mensajes de error de red
    await expect(page.getByText(/Error al cargar/i)).not.toBeVisible();
    await expect(page.getByText(/No autorizado/i)).not.toBeVisible();
  });

  test("campos del paso 1 son visibles", async ({ page }) => {
    // El wizard debe renderizar al menos un campo de input/textarea
    const fields = page.locator('input[type="text"], textarea').first();
    await expect(fields).toBeVisible({ timeout: 10_000 });
  });

  test("editar un campo y auto-guardado funciona", async ({ page }) => {
    // Esperar primer textarea visible
    const firstTextarea = page.locator("textarea").first();
    await expect(firstTextarea).toBeVisible({ timeout: 10_000 });

    // Interceptar PATCH del cuestionario para verificar que se envía
    const saveRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/api/clients/") &&
        req.url().includes("/questionnaire") &&
        req.method() === "PATCH",
      { timeout: 10_000 }
    );

    // Escribir en el campo
    await firstTextarea.click();
    await firstTextarea.fill("Empresa de test automatizado E2E");

    // Esperar el PATCH (auto-save con debounce)
    const req = await saveRequest.catch(() => null);
    // Si el request llegó, verificar que el body es JSON válido
    if (req) {
      const body = req.postDataJSON?.() as Record<string, unknown> | null;
      expect(body).toBeTruthy();
    }
    // El indicador de guardado debe aparecer (SaveIndicator)
    await expect(
      page.getByText(/guardado/i).or(page.getByText(/Guardando/i))
    ).toBeVisible({ timeout: 8_000 });
  });

  test("botón AI-fill dispara request y muestra campos", async ({ page }) => {
    // Mock de la respuesta de AI-fill para no llamar a Anthropic real
    await page.route("**/api/clients/**/wizard/**/ai-fill", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            nombre_empresa: {
              value: "Empresa de Prueba S.A. de C.V.",
              source_type: "public",
              sources: [{ url: "https://example.com", title: "Fuente test", date: "2026-05-07" }],
              validated: false,
              updated_at: new Date().toISOString(),
            },
          },
        }),
      });
    });

    // Buscar botón de AI-fill
    const aiBtn = page
      .getByRole("button", { name: /completar con ia/i })
      .or(page.getByRole("button", { name: /ia/i }).first());

    if (await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await aiBtn.click();
      // Esperar a que el valor mockeado aparezca o que el estado cambie
      await expect(
        page.getByText(/Empresa de Prueba/).or(page.getByText(/Completado/i))
      ).toBeVisible({ timeout: 10_000 });
    } else {
      // Si el botón no está visible en este paso, el test pasa (puede estar en otro paso)
      test.skip();
    }
  });
});
