import { NextRequest, NextResponse } from "next/server";
import { requireConsultorOrAdmin, requireAdmin } from "@/lib/auth";
import {
  listTemplates,
  createTemplateFromService,
  CreateFromServiceSchema,
  TemplateInputSchema,
} from "@/lib/stage-templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const service = url.searchParams.get("service") ?? undefined;

  try {
    const data = await listTemplates(service);
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("[GET /api/stage-templates]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

// POST acepta 2 modos:
// 1. fromClientServiceId presente → clona estructura del servicio existente
// 2. fromClientServiceId ausente → crea plantilla desde cero (data opcional)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Detectar modo
  const hasFromService = typeof (body as { fromClientServiceId?: unknown })?.fromClientServiceId === "string";

  if (hasFromService) {
    const parsed = CreateFromServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }
    try {
      const tpl = await createTemplateFromService({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        service: parsed.data.service ?? null,
        fromClientServiceId: parsed.data.fromClientServiceId,
        createdBy: admin,
      });
      await logChange({
        actorEmail: admin,
        entityType: "stage_template",
        entityId: tpl.id,
        action: "create",
        after: { name: tpl.name, service: tpl.service, mode: "from_service" },
      });
      return NextResponse.json({ data: tpl }, { status: 201 });
    } catch (e) {
      console.error("[POST /api/stage-templates from_service]", e);
      const msg = e instanceof Error ? e.message : "Error al crear";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Modo crear-desde-cero
  const parsed = TemplateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const adminDb = createAdminClient();
    const { data, error } = await adminDb
      .from("stage_templates")
      .insert({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        service: parsed.data.service ?? null,
        data: parsed.data.data ?? { stages: [] },
        created_by: admin,
      })
      .select()
      .single();
    if (error) throw error;
    await logChange({
      actorEmail: admin,
      entityType: "stage_template",
      entityId: data.id,
      action: "create",
      after: { name: data.name, service: data.service, mode: "from_scratch" },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/stage-templates from_scratch]", e);
    const msg = e instanceof Error ? e.message : "Error al crear";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
