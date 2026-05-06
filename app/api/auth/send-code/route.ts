import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail, normalizeEmail, isAuthorizedEmail } from "@/lib/auth";
import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function isRateLimited(
  email: string,
  admin: ReturnType<typeof createAdminClient>,
  ip: string | null
): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: emailCount } = await admin
    .from("access_codes")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", fiveMinAgo);
  if ((emailCount ?? 0) >= 3) return true;

  if (ip) {
    const { count: ipCount } = await admin
      .from("access_codes")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", fiveMinAgo);
    if ((ipCount ?? 0) >= 10) return true;
  }
  return false;
}

function generateCode(): string {
  return randomInt(100000, 999999).toString();
}

async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:24px;font-weight:bold;color:#111;">App ResponSable</span>
      </div>
      <div style="background:#f8f9fc;border-radius:12px;padding:32px 24px;text-align:center;">
        <p style="color:#666;font-size:14px;margin:0 0 8px;">Tu código de acceso:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:0.3em;color:#111;font-family:monospace;padding:16px 0;">
          ${code}
        </div>
        <p style="color:#999;font-size:12px;margin:16px 0 0;">Válido por 10 minutos</p>
      </div>
      <p style="color:#999;font-size:11px;text-align:center;margin-top:24px;">
        Si no solicitaste este código, ignora este mensaje.<br>
        <a href="${appUrl}" style="color:#6366f1;">App ResponSable</a>
      </p>
    </div>`;

  const resend = getResend();
  if (!resend) {
    console.error("[send-code] RESEND_API_KEY no configurada");
    return false;
  }
  try {
    const from = process.env.RESEND_FROM || "App ResponSable <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: `${code} — Código App ResponSable`,
      html,
    });
    if (error) {
      console.error("[send-code] Resend error:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[send-code] Resend exception:", e);
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { email } = body;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: "Formato de email inválido" }, { status: 400 });
  }

  if (!(await isAuthorizedEmail(normalizedEmail))) {
    return NextResponse.json(
      { error: "Este correo no tiene acceso." },
      { status: 403 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const admin = createAdminClient();

  if (await isRateLimited(normalizedEmail, admin, ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429 }
    );
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await admin
    .from("access_codes")
    .update({ used: true })
    .eq("email", normalizedEmail)
    .eq("used", false);

  const { error: insertError } = await admin.from("access_codes").insert({
    email: normalizedEmail,
    code,
    expires_at: expiresAt,
    used: false,
    ip_address: ip,
  });

  if (insertError) {
    console.error("[send-code] insert error:", insertError);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }

  const sent = await sendOtpEmail(normalizedEmail, code);
  if (!sent) {
    return NextResponse.json(
      { error: "No se pudo enviar el correo. Intenta de nuevo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
