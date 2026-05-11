import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import {
  listMaterialityTopics,
  initMaterialityFromTemplate,
  createMaterialityTopic,
} from "@/lib/materiality/queries";
import type { MaterialityTopicInput, TopicColor, TopicSize } from "@/lib/materiality/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const VALID_COLORS = ["rose", "amber", "teal", "slate"] as const satisfies readonly TopicColor[];
const VALID_SIZES = ["sm", "md", "lg"] as const satisfies readonly TopicSize[];

const InitSchema = z.object({ action: z.literal("init") });
const TopicSchema = z.object({
  action:         z.undefined().optional(),
  topic_key:      z.string().min(1).max(100),
  label:          z.string().min(1).max(200),
  x_pos:          z.number().min(0).max(100).optional(),
  y_pos:          z.number().min(0).max(100).optional(),
  color:          z.enum(VALID_COLORS).optional(),
  size:           z.enum(VALID_SIZES).optional(),
  section_key:    z.string().max(100).nullable().optional(),
  position_index: z.number().int().optional(),
  notes:          z.string().nullable().optional(),
});
const PostSchema = z.union([InitSchema, TopicSchema]);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const topics = await listMaterialityTopics(id);
    return NextResponse.json(
      { data: topics },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer matriz";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body inválido" },
      { status: 400 }
    );
  }

  // Acción especial: inicializar desde plantilla
  if ("action" in parsed.data && parsed.data.action === "init") {
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
  const input = parsed.data as Required<Pick<MaterialityTopicInput, "topic_key" | "label">> & Partial<MaterialityTopicInput>;
  const color: TopicColor = input.color ?? "slate";
  const size: TopicSize = input.size ?? "md";
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
