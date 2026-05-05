import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  listTemplates,
  createTemplateFromService,
  CreateFromServiceSchema,
} from "@/lib/stage-templates";
import { logChange } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const url = new URL(req.url);
  const service = url.searchParams.get("service") ?? undefined;

  try {
    const data = await listTemplates(service);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/stage-templates]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
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
      after: { name: tpl.name, service: tpl.service },
    });
    return NextResponse.json({ data: tpl }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/stage-templates]", e);
    const msg = e instanceof Error ? e.message : "Error al crear";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
