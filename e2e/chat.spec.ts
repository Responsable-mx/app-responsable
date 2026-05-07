/**
 * e2e/chat.spec.ts
 *
 * Tests E2E del flujo de chat con roles IA.
 * El endpoint /api/chat (SSE) está mockeado para no llamar a Anthropic real.
 */

import { test, expect } from "@playwright/test";

const CLIENT_ID = process.env.E2E_CLIENT_ID ?? "test-client-id";

/** Simula una respuesta SSE del chat como lo haría el servidor real */
function buildMockSSE(text: string): string {
  const parts = [
    `data: ${JSON.stringify({ type: "delta", text: text.slice(0, 20) })}\n\n`,
    `data: ${JSON.stringify({ type: "delta", text: text.slice(20) })}\n\n`,
    `data: ${JSON.stringify({
      type: "done",
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
      cache_read_tokens: 0,
    })}\n\n`,
  ];
  return parts.join("");
}

test.describe("Chat IA", () => {
  test.beforeEach(async ({ page }) => {
    // Mockear el endpoint SSE del chat
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
        },
        body: buildMockSSE(
          "Esta es una respuesta de prueba del asistente Aurora para el test E2E."
        ),
      });
    });

    await page.goto(`/clientes/${CLIENT_ID}?tab=chat`);
  });

  test("interfaz de chat carga correctamente", async ({ page }) => {
    // Selector del rol activo (Aurora por defecto)
    await expect(page.getByText(/Aurora/i).first()).toBeVisible({ timeout: 12_000 });
    // Área de input visible
    const input = page.locator("textarea").last();
    await expect(input).toBeVisible({ timeout: 8_000 });
  });

  test("enviar mensaje muestra respuesta mockeada", async ({ page }) => {
    const input = page.locator("textarea").last();
    await expect(input).toBeVisible({ timeout: 10_000 });

    // Escribir y enviar mensaje
    await input.fill("¿Cuál es el objetivo del análisis de Doble Materialidad?");
    await input.press("Enter");

    // La respuesta mockeada debe aparecer en el chat
    await expect(
      page.getByText(/respuesta de prueba del asistente Aurora/)
    ).toBeVisible({ timeout: 12_000 });
  });

  test("botón copiar está presente en respuestas IA", async ({ page }) => {
    const input = page.locator("textarea").last();
    await expect(input).toBeVisible({ timeout: 10_000 });

    await input.fill("Test de botón copiar");
    await input.press("Enter");

    // Esperar respuesta
    await expect(
      page.getByText(/respuesta de prueba/)
    ).toBeVisible({ timeout: 12_000 });

    // Botón de copiar debe estar visible en el mensaje IA
    await expect(
      page.getByRole("button", { name: /copiar/i }).or(
        page.locator('[title="Copiar"]').or(page.locator('[aria-label="Copiar respuesta"]'))
      ).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("error de rate limit muestra mensaje amigable", async ({ page }) => {
    // Override del mock para simular rate limit
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Has enviado demasiados mensajes. Espera un momento." }),
      });
    });

    const input = page.locator("textarea").last();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill("Mensaje que dispara rate limit");
    await input.press("Enter");

    // El chat debe mostrar el error, no romper la UI
    await expect(
      page.getByText(/demasiados mensajes/i).or(
        page.getByText(/rate limit/i).or(
          page.getByText(/espera/i)
        )
      )
    ).toBeVisible({ timeout: 8_000 });
  });
});
