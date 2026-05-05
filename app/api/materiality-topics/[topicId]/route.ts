import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  updateMaterialityTopic,
  deleteMaterialityTopic,
} from "@/lib/materiality/queries";
import type { TopicColor, TopicSize, MaterialityTopicInput } from "@/lib/materiality/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ topicId: string }> };

const VALID_COLORS: TopicColor[] = ["rose", "amber", "teal", "slate"];
const VALID_SIZES: TopicSize[] = ["sm", "md", "lg"];

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { topicId } = await params;

  let body: Partial<MaterialityTopicInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
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

  try {
    const topic = await updateMaterialityTopic({
      topicId,
      patch,
      actorEmail: user,
    });
    void logChange({
      actorEmail: user,
      entityType: "materiality_topic",
      entityId: topic.id,
      action: "update",
      before: null,
      after: topic,
    });
    return NextResponse.json({ data: topic });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { topicId } = await params;
  try {
    await deleteMaterialityTopic(topicId);
    void logChange({
      actorEmail: user,
      entityType: "materiality_topic",
      entityId: topicId,
      action: "delete",
      before: null,
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
