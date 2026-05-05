import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyTemplate, ApplyTemplateSchema } from "@/lib/stage-templates";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ApplyTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const result = await applyTemplate({
      templateId: id,
      clientServiceId: parsed.data.client_service_id,
      startDate: parsed.data.start_date,
    });
    await logChange({
      actorEmail: admin,
      entityType: "stage_template",
      entityId: id,
      action: "update",
      metadata: {
        applied_to_service: parsed.data.client_service_id,
        start_date: parsed.data.start_date,
        ...result,
      },
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/stage-templates/:id/apply]", e);
    const msg = e instanceof Error ? e.message : "Error al aplicar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
