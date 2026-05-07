import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import {
  listMaterialityTopics,
  initMaterialityFromTemplate,
  createMaterialityTopic,
} from "@/lib/materiality/queries";
import type { MaterialityTopicInput, TopicColor, TopicSize } from "@/lib/materiality/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const VALID_COLORS: TopicColor[] = ["rose", "amber", "teal", "slate"];
const VALID_SIZES: TopicSize[] = ["sm", "md", "lg"];

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const topics = await listMaterialityTopics(id);
    return NextResponse.json({ data: topics });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer matriz";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: { action?: "init" } | (Partial<MaterialityTopicInput> & { action?: never });
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Acción especial: inicializar desde plantilla
  if ("action" in body && body.action === "init") {
    try {
      const existing = await listMaterialityTopics(id);
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "El cliente ya tiene temas. Elimínalos primero o edita." },
          { status: 409 }
        );
      }
      const topics = await initMaterialityFromTemplate(id, user);
      void logChange({
        actorEmail: user,
        entityType: "materiality_topic",
        entityId: id,
        action: "create",
        before: null,
        after: { count: topics.length, action: "init_from_template" },
      });
      return NextResponse.json({ data: topics }, { status: 201 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al inicializar";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Crear tema individual
  const input = body as Partial<MaterialityTopicInput>;
  if (!input.topic_key || !input.label) {
    return NextResponse.json({ error: "topic_key y label son requeridos" }, { status: 400 });
  }
  const color = input.color && VALID_COLORS.includes(input.color) ? input.color : "slate";
  const size = input.size && VALID_SIZES.includes(input.size) ? input.size : "md";
  const x = clamp(input.x_pos ?? 50, 0, 100);
  const y = clamp(input.y_pos ?? 50, 0, 100);

  try {
    const topic = await createMaterialityTopic({
      clientId: id,
      input: {
        topic_key: input.topic_key,
        label: input.label,
        x_pos: x,
        y_pos: y,
        color,
        size,
        section_key: input.section_key ?? null,
        position_index: input.position_index ?? 0,
        notes: input.notes ?? null,
      },
      actorEmail: user,
    });
    void logChange({
      actorEmail: user,
      entityType: "materiality_topic",
      entityId: topic.id,
      action: "create",
      before: null,
      after: topic,
    });
    return NextResponse.json({ data: topic }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear tema";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
