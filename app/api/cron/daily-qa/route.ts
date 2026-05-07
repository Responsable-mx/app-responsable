import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const maxDuration = 60;

/**
 * Cron daily-qa — corre cada mañana (ver vercel.json).
 * Checa endpoints críticos y tablas base. Solo reporta FALLOS.
 *
 * Inspirado en daily-qa de S-Peak App: silencio = todo bien.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const failures: Array<{ check: string; detail: string }> = [];
  const admin = createAdminClient();

  // ── Check 1: clients table accesible
  try {
    const { error } = await admin
      .from("clients")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "clients_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "clients_table", detail: String(e) });
  }

  // ── Check 2: access_codes accesible (OTP flow operativo)
  try {
    const { error } = await admin
      .from("access_codes")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "access_codes_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "access_codes_table", detail: String(e) });
  }

  // ── Check 3: ai_calls accesible (observabilidad operativa)
  try {
    const { error } = await admin
      .from("ai_calls")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) failures.push({ check: "ai_calls_table", detail: error.message });
  } catch (e) {
    failures.push({ check: "ai_calls_table", detail: String(e) });
  }

  // ── Check 4: Anthropic API key presente
  if (!process.env.ANTHROPIC_API_KEY) {
    failures.push({
      check: "anthropic_key",
      detail: "ANTHROPIC_API_KEY missing",
    });
  }

  // ── Check 5: Resend key presente
  if (!process.env.RESEND_API_KEY) {
    failures.push({
      check: "resend_key",
      detail: "RESEND_API_KEY missing (OTP emails won't send)",
    });
  }

  if (failures.length > 0) {
    console.error("[cron/daily-qa] FAILURES", JSON.stringify(failures));
    await sendAlertEmail(failures);
    return NextResponse.json({ ok: false, failures });
  }

  return NextResponse.json({ ok: true });
}

async function sendAlertEmail(failures: Array<{ check: string; detail: string }>) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "nicolas@s-peak.com";
  if (!apiKey) return;

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "App ResponSable <noreply@responsable.net>";
  const date = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

  const rows = failures
    .map((f) => `<tr><td style="padding:6px 12px;font-weight:600;color:#dc2626;">${f.check}</td><td style="padding:6px 12px;color:#475569;font-size:12px;">${f.detail}</td></tr>`)
    .join("");

  await resend.emails.send({
    from,
    to: adminEmail,
    subject: `[ALERTA] daily-qa detectó ${failures.length} falla${failures.length === 1 ? "" : "s"} — App ResponSable`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 8px;">Alerta daily-qa</h2>
      <p style="color:#475569;font-size:13px;margin:0 0 16px;">${date} · ${failures.length} verificación${failures.length === 1 ? "" : "es"} fallida${failures.length === 1 ? "" : "s"}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;">
        <thead><tr style="background:#fef2f2;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;">Check</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#94a3b8;text-transform:uppercase;">Detalle</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#94a3b8;font-size:11px;margin-top:16px;">Vercel logs → <a href="https://vercel.com/dashboard">dashboard</a></p>
    </div>`,
  }).catch((e) => console.error("[daily-qa] alert email failed:", e));
}
