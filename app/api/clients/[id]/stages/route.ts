import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  listStagesByClient,
  createStage,
  StageInputSchema,
} from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clients/:id/stages
// Devuelve todas las etapas (de todos los servicios del cliente) con sus actividades.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { id: clientId } = await params;
  try {
    const data = await listStagesByClient(clientId);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/clients/:id/stages]", e);
    return NextResponse.json({ error: "Error al listar etapas" }, { status: 500 });
  }
}

// POST /api/clients/:id/stages
// Body: { client_service_id, name, order_index? }
// Solo admin. Verifica que client_service_id pertenece al clientId (anti-IDOR).
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  }
  const { id: clientId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ext = StageInputSchema.extend({
    client_service_id: (await import("zod")).z.string().uuid(),
  }).safeParse(body);
  if (!ext.success) {
    return NextResponse.json(
      { error: ext.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  // Verificar ownership del client_service
  const adminDb = createAdminClient();
  const { data: cs } = await adminDb
    .from("client_services")
    .select("client_id")
    .eq("id", ext.data.client_service_id)
    .single();
  if (!cs || cs.client_id !== clientId) {
    return NextResponse.json(
      { error: "Servicio no pertenece a este cliente" },
      { status: 403 }
    );
  }

  try {
    const stage = await createStage(ext.data.client_service_id, {
      name: ext.data.name,
      order_index: ext.data.order_index,
    });
    await logChange({
      actorEmail: admin,
      entityType: "service_stage",
      entityId: stage.id,
      action: "create",
      after: { client_service_id: ext.data.client_service_id, name: stage.name },
    });
    return NextResponse.json({ data: stage }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/clients/:id/stages]", e);
    return NextResponse.json({ error: "Error al crear etapa" }, { status: 500 });
  }
}
