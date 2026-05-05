import { NextRequest, NextResponse } from "next/server";
import { verifyCron } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const maxDuration = 60;

/**
 * Cron delayed-activities — corre diario.
 * Detecta actividades con status computado "delayed" (planned_end < today AND actual_end IS NULL),
 * agrupa por assignee_email, envía email resumen a cada consultor.
 *
 * Killswitch: env DISABLE_DELAYED_NOTIFICATIONS=on para pausar.
 */
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.DISABLE_DELAYED_NOTIFICATIONS === "on") {
    return NextResponse.json({ skipped: true, reason: "killswitch active" });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Query: actividades retrasadas con assignee + chain join hasta cliente para contexto.
  const { data: rows, error } = await admin
    .from("stage_activities")
    .select(
      `id, name, planned_start, planned_end, assignee_email,
       service_stages!inner ( name, client_services!inner ( clients!inner ( id, name ) ) )`
    )
    .not("assignee_email", "is", null)
    .is("actual_end", null)
    .lt("planned_end", today);

  if (error) {
    console.error("[cron/delayed-activities] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type DelayedItem = {
    activity_name: string;
    client_id: string;
    client_name: string;
    stage_name: string;
    planned_end: string;
    days_late: number;
  };

  const todayMs = new Date(today + "T00:00:00").getTime();
  const byAssignee = new Map<string, DelayedItem[]>();

  for (const raw of rows ?? []) {
    const r = raw as unknown as {
      name: string;
      planned_end: string;
      assignee_email: string;
      service_stages: { name: string; client_services: { clients: { id: string; name: string } | { id: string; name: string }[] } | { name: string; client_services: { clients: { id: string; name: string } | { id: string; name: string }[] } }[] };
    };
    const stage = Array.isArray(r.service_stages) ? r.service_stages[0] : r.service_stages;
    if (!stage) continue;
    const cs = Array.isArray(stage.client_services) ? stage.client_services[0] : stage.client_services;
    if (!cs) continue;
    const cli = Array.isArray(cs.clients) ? cs.clients[0] : cs.clients;
    if (!cli) continue;

    const daysLate = Math.floor((todayMs - new Date(r.planned_end + "T00:00:00").getTime()) / 86_400_000);
    const list = byAssignee.get(r.assignee_email) ?? [];
    list.push({
      activity_name: r.name,
      client_id: cli.id,
      client_name: cli.name,
      stage_name: stage.name,
      planned_end: r.planned_end,
      days_late: daysLate,
    });
    byAssignee.set(r.assignee_email, list);
  }

  if (byAssignee.size === 0) {
    return NextResponse.json({ sent: 0, total_delayed: 0 });
  }

  // Verificar que el assignee aún esté activo en authorized_users
  const emails = Array.from(byAssignee.keys());
  const { data: activeUsers } = await admin
    .from("authorized_users")
    .select("email")
    .in("email", emails)
    .eq("active", true);
  const activeSet = new Set((activeUsers ?? []).map((u) => u.email));

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      sent: 0,
      total_delayed: rows?.length ?? 0,
      reason: "RESEND_API_KEY missing",
    });
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || "App ResponSable <noreply@responsable.net>";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://app.responsable.net";

  let sent = 0;
  let failed = 0;
  const errors: { email: string; error: string }[] = [];

  for (const [email, items] of byAssignee.entries()) {
    if (!activeSet.has(email)) continue; // skip consultor inactivo
    items.sort((a, b) => b.days_late - a.days_late);

    const html = renderEmail(items, baseUrl);
    const text = renderText(items, baseUrl);

    try {
      const { error: e } = await resend.emails.send({
        from,
        to: email,
        subject: `Actividades retrasadas (${items.length}) — ResponSable`,
        text,
        html,
      });
      if (e) {
        failed++;
        errors.push({ email, error: e.message ?? "unknown" });
      } else {
        sent++;
      }
    } catch (e) {
      failed++;
      errors.push({ email, error: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({
    sent,
    failed,
    total_delayed: rows?.length ?? 0,
    consultors_with_delayed: byAssignee.size,
    errors: errors.length > 0 ? errors : undefined,
  });
}

function renderText(
  items: { activity_name: string; client_name: string; stage_name: string; planned_end: string; days_late: number }[],
  baseUrl: string
): string {
  const lines = [
    `Tienes ${items.length} actividad${items.length === 1 ? "" : "es"} retrasada${items.length === 1 ? "" : "s"}.`,
    "",
    "DETALLE:",
    ...items.map(
      (i) =>
        `• ${i.activity_name} (${i.client_name} · ${i.stage_name}) — fecha plan: ${i.planned_end} · retraso: ${i.days_late} día${i.days_late === 1 ? "" : "s"}`
    ),
    "",
    `Actualiza fechas reales o ajusta el plan: ${baseUrl}/equipo`,
    "",
    "— ResponSable",
  ];
  return lines.join("\n");
}

function renderEmail(
  items: { activity_name: string; client_id: string; client_name: string; stage_name: string; planned_end: string; days_late: number }[],
  baseUrl: string
): string {
  const rows = items
    .map(
      (i) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 600;">${escapeHtml(i.activity_name)}</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #475569;">
          <a href="${baseUrl}/clientes/${i.client_id}?tab=cronograma" style="color: #115e59; text-decoration: none;">
            ${escapeHtml(i.client_name)}
          </a>
          · ${escapeHtml(i.stage_name)}
        </td>
        <td style="padding: 8px 12px; font-size: 12px; color: #475569; text-align: right; white-space: nowrap;">${i.planned_end}</td>
        <td style="padding: 8px 12px; font-size: 12px; color: #dc2626; font-weight: 700; text-align: right; white-space: nowrap;">+${i.days_late}d</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;">
    <div style="background:#115e59;color:#ffffff;padding:16px 20px;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.8;">App ResponSable</p>
      <h1 style="margin:4px 0 0;font-size:18px;font-weight:700;">Actividades retrasadas</h1>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 12px;font-size:14px;color:#334155;">
        Tienes <strong style="color:#dc2626;">${items.length} actividad${items.length === 1 ? "" : "es"} retrasada${items.length === 1 ? "" : "s"}</strong> donde figuras como responsable.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Actividad</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Proyecto</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Fecha plan</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Retraso</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:center;">
        <a href="${baseUrl}/equipo" style="display:inline-block;background:#0d9488;color:#ffffff;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:600;">
          Abrir Equipo
        </a>
      </div>
      <p style="margin:20px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
        Actualiza la fecha real al terminar la actividad, o ajusta el plan si es necesario.
      </p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
