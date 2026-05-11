import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth";
import { getUser, recordLogin } from "@/lib/users";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 5;

const LoginCodeSchema = z.object({
  email: z.string().min(1).max(254),
  code:  z.string().min(1).max(20),
});

/**
 * Cuenta TODOS los intentos (éxito + fallo) de este email en la ventana.
 * Bloquea brute-force al OTP de 6 dígitos.
 */
async function isRateLimited(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  const { count, error } = await admin
    .from("otp_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", windowStart);

  if (error) {
    console.error("[login-code] rate limit error:", error.message);
    return false;
  }
  return (count ?? 0) >= MAX_ATTEMPTS;
}

async function recordAttempt(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  success: boolean,
  ip: string | null
): Promise<void> {
  await admin.from("otp_attempts").insert({ email, success, ip });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = LoginCodeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email y código requeridos" },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const normalizedCode = parsed.data.code.trim();
  const admin = createAdminClient();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  if (await isRateLimited(admin, normalizedEmail)) {
    await admin
      .from("access_codes")
      .update({ used: true })
      .eq("email", normalizedEmail)
      .eq("used", false);
    return NextResponse.json(
      { error: "Demasiados intentos. Solicita un nuevo código." },
      { status: 429 }
    );
  }

  const { data: codeRow, error: codeError } = await admin
    .from("access_codes")
    .select("id, email")
    .eq("code", normalizedCode)
    .eq("email", normalizedEmail)
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (codeError || !codeRow) {
    await recordAttempt(admin, normalizedEmail, false, ip);
    return NextResponse.json(
      { error: "Código incorrecto o expirado." },
      { status: 403 }
    );
  }

  await recordAttempt(admin, normalizedEmail, true, ip);

  await admin.from("access_codes").update({ used: true }).eq("id", codeRow.id);

  await recordLogin(normalizedEmail);

  // generateLink crea el usuario si no existe y devuelve su ID.
  // Sincronizamos el rol DESPUÉS usando ese ID para evitar el bug de paginación
  // de listUsers (solo traía los primeros 50 usuarios de Auth).
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    console.error("[login-code] generateLink error:", linkError?.message);
    return NextResponse.json({ error: "Error al crear sesión." }, { status: 500 });
  }

  // Sincroniza rol desde authorized_users → user_metadata del JWT.
  // Usa el ID devuelto por generateLink — sin paginación, sin búsqueda.
  const dbUser = await getUser(normalizedEmail);
  const role = dbUser?.role ?? "consultor";
  await admin.auth.admin
    .updateUserById(linkData.user.id, { user_metadata: { role } })
    .catch(() => { /* best-effort */ });

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    console.error("[login-code] verifyOtp error:", verifyError.message);
    return NextResponse.json({ error: "Error al crear sesión." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, redirect: "/chat" });
}
