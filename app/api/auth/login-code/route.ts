import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth";
import { getUser, recordLogin } from "@/lib/users";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 5;

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
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { email, code } = body;
  if (!email || !code) {
    return NextResponse.json(
      { error: "Email y código requeridos" },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim();
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

  // Sincroniza rol desde authorized_users → user_metadata del JWT.
  // Así el middleware lee user.user_metadata.role sin query extra por request.
  const dbUser = await getUser(normalizedEmail);
  const role = dbUser?.role ?? "consultor";

  await admin.auth.admin
    .createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { role },
    })
    .catch(async () => {
      // Usuario ya existe → actualizamos su metadata con el rol actual.
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const existing = list?.users.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existing) {
        await admin.auth.admin
          .updateUserById(existing.id, { user_metadata: { role } })
          .catch(() => {
            /* best-effort */
          });
      }
    });

  await recordLogin(normalizedEmail);

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

  if (linkError || !linkData.properties?.hashed_token) {
    console.error("[login-code] generateLink error:", linkError?.message);
    return NextResponse.json({ error: "Error al crear sesión." }, { status: 500 });
  }

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
