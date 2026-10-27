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

  // Entra como un consultor real: código de acceso + /api/auth/login-code.
  // Antes navegaba a un magic link, pero Supabase lo redirige a su Site URL
  // (localhost:3000, sin redirect URLs permitidas) y el login nunca llegaba a la app.
  // Aquí el código se inserta con service role en vez de mandarse por correo.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = testEmail.trim().toLowerCase();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await admin.from("access_codes").update({ used: true }).eq("email", email).eq("used", false);
  const { error: insertError } = await admin.from("access_codes").insert({
    email,
    code,
    used: false,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (insertError) {
    throw new Error(`[auth.setup] No se pudo crear el código: ${insertError.message}`);
  }

  // page.request comparte cookies con el navegador: la sesión que fija la API queda en el contexto
  const res = await page.request.post("/api/auth/login-code", { data: { email, code } });
  if (!res.ok()) {
    throw new Error(`[auth.setup] login-code respondió ${res.status()}: ${await res.text()}`);
  }

  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/(clientes|chat|configuracion)/, { timeout: 15_000 });

  // Guardar cookies + localStorage para reuso en tests
  await page.context().storageState({ path: AUTH_FILE });
});
