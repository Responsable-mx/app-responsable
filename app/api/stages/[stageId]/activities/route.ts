import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/auth";
import { PROJECTS_OVERVIEW_TAG } from "@/app/api/projects/overview/route";
import {
  ActivityInputSchema,
  createActivity,
  getStageOwnerClient,
} from "@/lib/stages";
import { logChange } from "@/lib/audit-log";
import { isDevMode } from "@/lib/env";

type Ctx = { params: Promise<{ stageId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: string) => isDevMode() || UUID_RE.test(id);

// POST /api/stages/:stageId/activities
// Body: ActivityInput. Solo admin (lectura va por GET /api/clients/:id/stages).
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Requiere admin" }, { status: 403 });
  const { stageId } = await params;
  if (!validId(stageId))
    return NextResponse.json({ error: "stageId inválido" }, { status: 400 });

  // Validar que la etapa existe (anti-IDOR previo) — en dev mode stages están en memoria
  const owner = await getStageOwnerClient(stageId);
  if (!owner) return NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ActivityInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const activity = await createActivity(stageId, parsed.data);
    await logChange({
      actorEmail: admin,
      entityType: "stage_activity",
      entityId: activity.id,
      action: "create",
      after: { stage_id: stageId, name: activity.name },
    });
    revalidateTag(PROJECTS_OVERVIEW_TAG);
    return NextResponse.json({ data: activity }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/stages/:id/activities]", e);
    return NextResponse.json({ error: "Error al crear actividad" }, { status: 500 });
  }
}

// Lectura no necesaria aquí — la lista completa va en GET /api/clients/:id/stages.
// Mantengo GET noop para consistencia REST si después se necesita.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { stageId } = await params;
  if (!validId(stageId))
    return NextResponse.json({ error: "stageId inválido" }, { status: 400 });
  return NextResponse.json({
    error: "Use GET /api/clients/:id/stages para listar actividades.",
  }, { status: 405 });
}
