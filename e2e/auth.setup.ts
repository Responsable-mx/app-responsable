/**
 * e2e/auth.setup.ts
 *
 * Setup de autenticación para tests E2E.
 * Usa Supabase Admin para generar un magic link de un usuario de test
 * y obtiene la sesión sin necesitar intervención manual de email.
 *
 * Guarda el storageState (cookies de sesión) en e2e/.auth/user.json
 * para que los tests puedan reutilizarlas.
 *
 * Requisitos en .env.local:
 *   E2E_TEST_EMAIL=consultor@responsable.net
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
 */

import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const AUTH_FILE = "e2e/.auth/user.json";

setup("obtener sesión de test", async ({ page }) => {
  const testEmail = process.env.E2E_TEST_EMAIL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!testEmail || !supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[auth.setup] Variables faltantes: E2E_TEST_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
    // Sin credenciales: guardar estado vacío para que tests fallen explícitamente
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Generar magic link vía admin API (no envía email real — retorna URL directamente)
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: testEmail,
    options: {
      // Redirige al app en vez de localhost (si Supabase está configurado con redirect URLs)
      redirectTo: (process.env.E2E_BASE_URL ?? "http://localhost:3000") + "/clientes",
    },
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(`[auth.setup] No se pudo generar magic link: ${error?.message ?? "sin data"}`);
  }

  // Navegar al magic link — Supabase lo procesa, setea cookies de sesión
  await page.goto(data.properties.action_link);

  // Esperar a que el app redirija post-auth a una página real
  await expect(page).toHaveURL(/\/(clientes|chat|configuracion)/, { timeout: 15_000 });

  // Guardar cookies + localStorage para reuso en tests
  await page.context().storageState({ path: AUTH_FILE });
});
