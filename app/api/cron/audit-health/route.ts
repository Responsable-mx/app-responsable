import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const maxDuration = 120;

/**
 * Cron audit-health — corre quincenal (ver vercel.json).
 * Revisa salud del proyecto: uso de IA, costos estimados, errores, deuda.
 * Reporta a Vercel logs + email a admins si Resend está configurado.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // ── Uso de IA últimos 14 días
  const { data: aiRows, error: aiErr } = await admin
    .from("ai_calls")
    .select("model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,error,latency_ms")
    .gte("created_at", since)
    .limit(10000);

  const stats = {
    ai_calls_total: aiRows?.length ?? 0,
    ai_calls_errors: aiRows?.filter((r) => r.error).length ?? 0,
    ai_input_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.input_tokens ?? 0),
      0
    ),
    ai_output_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.output_tokens ?? 0),
      0
    ),
    ai_cache_read_tokens: (aiRows ?? []).reduce(
      (a, r) => a + (r.cache_read_tokens ?? 0),
      0
    ),
    ai_avg_latency_ms: aiRows?.length
      ? Math.round(
          aiRows.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / aiRows.length
        )
      : 0,
  };

  // D-124: Costo estimado por modelo. Precios abr-2026 por 1M tokens:
  //   Haiku:  $0.25 input / $1.25 output / $0.03 cache read
  //   Sonnet: $3    input / $15   output / $0.30 cache read
  //   Opus:   $5    input / $25   output / $0.50 cache read
  let inputUsd = 0;
  let outputUsd = 0;
  let cacheUsd = 0;
  for (const r of aiRows ?? []) {
    const m = (r.model as string | null ?? "").toLowerCase();
    const isHaiku = m.includes("haiku");
    const isOpus  = m.includes("opus");
    const iIn  = isHaiku ? 0.25 : isOpus ? 5  : 3;
    const iOut = isHaiku ? 1.25 : isOpus ? 25 : 15;
    const iCache = isHaiku ? 0.03 : isOpus ? 0.5 : 0.3;
    inputUsd  += ((r.input_tokens  ?? 0) * iIn)    / 1_000_000;
    outputUsd += ((r.output_tokens ?? 0) * iOut)   / 1_000_000;
    cacheUsd  += ((r.cache_read_tokens ?? 0) * iCache) / 1_000_000;
  }
  const totalUsd = inputUsd + outputUsd + cacheUsd;

  // ── Conteos
  const { count: clientsCount } = await admin
    .from("clients")
    .select("id", { head: true, count: "exact" });
  const { count: usersCount } = await admin
    .from("authorized_users")
    .select("email", { head: true, count: "exact" })
    .eq("active", true);

  const report = {
    window_days: 14,
    ai: stats,
    cost_usd_estimate_max: Number(totalUsd.toFixed(3)),
    clients_total: clientsCount ?? 0,
    users_active: usersCount ?? 0,
    ai_query_error: aiErr?.message ?? null,
    generated_at: new Date().toISOString(),
  };

  console.log("[cron/audit-health]", JSON.stringify(report));

  // ── Email a admins (si Resend + hay admins activos)
  const emailResult = await sendReportEmail(admin, report, totalUsd, stats);

  return NextResponse.json({ ...report, email: emailResult });
}

async function sendReportEmail(
  admin: ReturnType<typeof createAdminClient>,
  report: Record<string, unknown>,
  totalUsd: number,
  stats: {
    ai_calls_total: number;
    ai_calls_errors: number;
    ai_avg_latency_ms: number;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY missing" };

  const { data: admins } = await admin
    .from("authorized_users")
    .select("email,full_name")
    .eq("role", "admin")
    .eq("active", true);
  const recipients = (admins ?? []).map((a) => a.email);
  if (recipients.length === 0)
    return { sent: false, reason: "no active admins" };

  const from = process.env.RESEND_FROM || "App ResponSable <noreply@responsable.net>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.responsable.net";

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <div style="border-bottom:2px solid #0d9488;padding-bottom:12px;margin-bottom:20px;">
        <h2 style="margin:0;font-size:20px;color:#134e4a;">App ResponSable · Auditoría quincenal</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Ventana: últimos 14 días</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#64748b;">Llamadas IA</td><td style="padding:6px 0;text-align:right;font-weight:600;">${stats.ai_calls_total}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Errores IA</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${stats.ai_calls_errors > 0 ? "#dc2626" : "#0f172a"};">${stats.ai_calls_errors}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Latencia promedio</td><td style="padding:6px 0;text-align:right;font-weight:600;">${stats.ai_avg_latency_ms} ms</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Costo máximo estimado (USD)</td><td style="padding:6px 0;text-align:right;font-weight:600;">$${totalUsd.toFixed(3)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Clientes registrados</td><td style="padding:6px 0;text-align:right;font-weight:600;">${report.clients_total}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Usuarios activos</td><td style="padding:6px 0;text-align:right;font-weight:600;">${report.users_active}</td></tr>
      </table>

      <p style="margin-top:24px;text-align:center;">
        <a href="${appUrl}/configuracion/uso-ia" style="display:inline-block;padding:10px 20px;background:#0d9488;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">
          Ver panel completo →
        </a>
      </p>

      <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">
        Este correo se envía automáticamente a los admins el 1 y 15 de cada mes.
      </p>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject: `App ResponSable — Auditoría quincenal · ${stats.ai_calls_total} llamadas, $${totalUsd.toFixed(2)} USD`,
      html,
    });
    if (error) {
      console.error("[cron/audit-health] Resend error:", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    console.error("[cron/audit-health] Resend exception:", e);
    return { sent: false, reason: String(e) };
  }
}
