import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getQuestionnaireBundle,
  upsertQuestionnaireResponse,
} from "@/lib/questionnaires/queries";
import type { QuestionnaireResponseData } from "@/lib/questionnaires/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const DEFAULT_SERVICE = "doble-materialidad";

type SnapshotRow = {
  id: string;
  client_id: string;
  service_key: string;
  payload: QuestionnaireResponseData;
  trigger: "pre_bulk_ai_fill" | "pre_per_step_ai_fill" | "pre_manual_overwrite";
  scope: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
};

/** Lista snapshots vigentes (no expirados) del cliente. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const serviceKey = url.searchParams.get("service") ?? DEFAULT_SERVICE;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("questionnaire_snapshots")
    .select("id, client_id, service_key, trigger, scope, created_by, created_at, expires_at")
    .eq("client_id", id)
    .eq("service_key", serviceKey)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

type CreateBody = {
  action: "create";
  service?: string;
  trigger: SnapshotRow["trigger"];
  scope?: string | null;
};

type RestoreBody = {
  action: "restore";
  service?: string;
  snapshotId: string;
};

type PostBody = CreateBody | RestoreBody;

/** POST con action="create" → snapshot del estado actual. action="restore" → reaplica un snapshot. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const serviceKey = body.service ?? DEFAULT_SERVICE;

  if (body.action === "create") {
    const validTriggers: SnapshotRow["trigger"][] = [
      "pre_bulk_ai_fill",
      "pre_per_step_ai_fill",
      "pre_manual_overwrite",
    ];
    if (!validTriggers.includes(body.trigger)) {
      return NextResponse.json({ error: "trigger inválido" }, { status: 400 });
    }

    const bundle = await getQuestionnaireBundle(id, serviceKey);
    if (!bundle) return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    const payload = bundle.response?.responses ?? {};

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("questionnaire_snapshots")
      .insert({
        client_id: id,
        service_key: serviceKey,
        payload,
        trigger: body.trigger,
        scope: body.scope ?? null,
        created_by: user,
      })
      .select("id, created_at, expires_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    void logChange({
      actorEmail: user,
      entityType: "questionnaire_snapshot",
      entityId: data.id,
      action: "create",
      before: null,
      after: { trigger: body.trigger, scope: body.scope ?? null },
    });

    return NextResponse.json({ data });
  }

  if (body.action === "restore") {
    if (!body.snapshotId || typeof body.snapshotId !== "string") {
      return NextResponse.json({ error: "snapshotId requerido" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: snap, error: snapErr } = await admin
      .from("questionnaire_snapshots")
      .select("id, client_id, service_key, payload, expires_at")
      .eq("id", body.snapshotId)
      .eq("client_id", id)
      .maybeSingle();

    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });
    if (!snap) return NextResponse.json({ error: "Snapshot no encontrado" }, { status: 404 });
    if (new Date(snap.expires_at) <= new Date()) {
      return NextResponse.json({ error: "Snapshot expirado (más de 72h)" }, { status: 410 });
    }

    const before = await getQuestionnaireBundle(id, serviceKey);

    // Antes de restaurar, snapshot del estado actual — evita pérdida si el usuario
    // se arrepiente. Se etiqueta pre_manual_overwrite para distinguirlo en UI.
    await admin
      .from("questionnaire_snapshots")
      .insert({
        client_id: id,
        service_key: serviceKey,
        payload: before?.response?.responses ?? {},
        trigger: "pre_manual_overwrite" as const,
        scope: `restore_of:${snap.id}`,
        created_by: user,
      });

    // Reaplicar payload del snapshot. Sin optimistic lock — restore es operación
    // explícita del consultor que ya conoce el estado actual.
    const restored = await upsertQuestionnaireResponse({
      clientId: id,
      serviceKey,
      responses: snap.payload,
      completedSections: [],
      actorEmail: user,
      expectedUpdatedAt: null,
    });

    void logChange({
      actorEmail: user,
      entityType: "questionnaire_response",
      entityId: restored.id,
      action: "update",
      before: before?.response ?? null,
      after: { restored_from_snapshot: snap.id },
    });

    return NextResponse.json({ data: restored });
  }

  return NextResponse.json({ error: "action desconocida" }, { status: 400 });
}
