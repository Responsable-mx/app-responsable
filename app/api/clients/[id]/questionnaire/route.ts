import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getQuestionnaireBundle,
  upsertQuestionnaireResponse,
} from "@/lib/questionnaires/queries";
import type { QuestionnaireResponseData } from "@/lib/questionnaires/types";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const DEFAULT_SERVICE = "doble-materialidad";

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);
  const serviceKey = url.searchParams.get("service") ?? DEFAULT_SERVICE;

  try {
    const bundle = await getQuestionnaireBundle(id, serviceKey);
    if (!bundle) {
      return NextResponse.json(
        { error: `Template '${serviceKey}' no encontrado` },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer cuestionario";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  let body: {
    service?: string;
    responses?: QuestionnaireResponseData;
    completedSections?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const serviceKey = body.service ?? DEFAULT_SERVICE;
  if (!body.responses || typeof body.responses !== "object") {
    return NextResponse.json({ error: "responses es requerido" }, { status: 400 });
  }

  try {
    const before = await getQuestionnaireBundle(id, serviceKey);
    const saved = await upsertQuestionnaireResponse({
      clientId: id,
      serviceKey,
      responses: body.responses,
      completedSections: body.completedSections ?? [],
      actorEmail: user,
    });

    void logChange({
      actorEmail: user,
      entityType: "questionnaire_response",
      entityId: saved.id,
      action: before?.response ? "update" : "create",
      before: before?.response ?? null,
      after: saved,
    });

    return NextResponse.json({ data: saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
