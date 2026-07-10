import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import {
  updateMaterialityTopic,
  deleteMaterialityTopic,
  getMaterialityTopicVerified,
} from "@/lib/materiality/queries";
import type { TopicColor, TopicSize, MaterialityTopicInput } from "@/lib/materiality/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ topicId: string }> };

const VALID_COLORS: TopicColor[] = ["rose", "amber", "teal", "slate"];
const VALID_SIZES: TopicSize[] = ["sm", "md", "lg"];

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { topicId } = await params;

  let body: Partial<MaterialityTopicInput> & { clientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // D-12: clientId requerido en body para verificar ownership (previene IDOR).
  // Antes, cualquier consultor podía modificar temas de otros clientes por UUID.
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : null;
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // D-190: además de verificar topic∈cliente, verificar que el caller tenga
  // acceso a ese cliente (bloquea rol cliente sobre clientes ajenos).
  const user = await requireConsultorForClient(clientId);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Verificar que el topicId pertenezca al clientId declarado.
  const existing = await getMaterialityTopicVerified(topicId, clientId).catch(() => null);
  if (!existing) {
    return NextResponse.json({ error: "Tema no encontrado" }, { status: 404 });
  }

  const patch: Partial<MaterialityTopicInput> = {};
  if (typeof body.label === "string") patch.label = body.label;
  if (typeof body.x_pos === "number") patch.x_pos = clamp(body.x_pos, 0, 100);
  if (typeof body.y_pos === "number") patch.y_pos = clamp(body.y_pos, 0, 100);
  if (body.color && VALID_COLORS.includes(body.color)) patch.color = body.color;
  if (body.size && VALID_SIZES.includes(body.size)) patch.size = body.size;
  if (body.section_key !== undefined) patch.section_key = body.section_key;
  if (typeof body.position_index === "number") patch.position_index = body.position_index;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (typeof body.validated === "boolean") patch.validated = body.validated;

  try {
    const topic = await updateMaterialityTopic({
      topicId,
      clientId,
      patch,
      actorEmail: user,
    });
    void logChange({
      actorEmail: user,
      entityType: "materiality_topic",
      entityId: topic.id,
      action: "update",
      before: existing,
      after: topic,
    });
    return NextResponse.json({ data: topic });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { topicId } = await params;

  // D-12: clientId requerido vía query param para verificar ownership.
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // D-190: verificar acceso del caller al cliente (bloquea rol cliente ajeno).
  const user = await requireConsultorForClient(clientId);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Verificar que el topicId pertenezca al clientId declarado.
  const existing = await getMaterialityTopicVerified(topicId, clientId).catch(() => null);
  if (!existing) {
    return NextResponse.json({ error: "Tema no encontrado" }, { status: 404 });
  }

  try {
    await deleteMaterialityTopic(topicId, clientId);
    void logChange({
      actorEmail: user,
      entityType: "materiality_topic",
      entityId: topicId,
      action: "delete",
      before: existing,
      after: null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
