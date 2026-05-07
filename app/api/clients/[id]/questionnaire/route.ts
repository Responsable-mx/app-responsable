import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import {
  getQuestionnaireBundle,
  upsertQuestionnaireResponse,
  QuestionnaireConflictError,
} from "@/lib/questionnaires/queries";
import {
  isWizardSchema,
  isFieldResponse,
  getFieldValue,
  isFieldFilled,
  type QuestionnaireResponseData,
} from "@/lib/questionnaires/types";
import { getClientMini } from "@/lib/clients";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

const DEFAULT_SERVICE = "doble-materialidad";

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: {
    service?: string;
    responses?: QuestionnaireResponseData;
    completedSections?: string[];
    expectedUpdatedAt?: string | null;
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
    if (!before) {
      return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    }

    // ── Validación server-side: required + only_double_materialidad ──
    const schema = before.template.schema;
    const completedSections = body.completedSections ?? [];
    const responsesIn = body.responses;
    const validationErrors: string[] = [];

    if (isWizardSchema(schema)) {
      // only_double_materialidad: verificar flag del cliente. Si el paso solo aplica
      // a clientes con doble materialidad y el cliente NO la tiene, rechazar payload
      // que intente guardar respuestas en ese paso.
      const client = await getClientMini(id).catch(() => null);
      const hasDoubleMat = client?.has_double_materiality === true;

      for (const step of schema.steps) {
        const stepResp = (responsesIn[step.key] as Record<string, unknown> | undefined) ?? {};
        const hasAnyValue = Object.values(stepResp).some((raw) => isFieldFilled(getFieldValue(raw)));
        if (step.only_double_materialidad && !hasDoubleMat && hasAnyValue) {
          validationErrors.push(
            `Paso "${step.title}" solo aplica a clientes con Doble Materialidad. Activa el flag en el cliente o limpia el paso.`
          );
          continue;
        }
        // Required + sources: solo se validan cuando el consultor marca el paso
        // como completo. Autosave libre no debe bloquear progreso parcial.
        if (completedSections.includes(step.key)) {
          for (const field of step.fields) {
            const raw = stepResp[field.key];
            // Sources required: "public" e "interpretation" exigen al menos 1 URL.
            if (isFieldResponse(raw)) {
              const requiresSources =
                raw.source_type === "public" || raw.source_type === "interpretation";
              const hasValue = isFieldFilled(raw.value);
              if (requiresSources && hasValue && (!raw.sources || raw.sources.length === 0)) {
                validationErrors.push(
                  `Paso "${step.title}", campo "${field.label}": tiene valor con source_type "${raw.source_type}" pero sin fuentes. Agrega URL o cambia a "solo consultor".`
                );
              }
            }
            // Required: campo obligatorio.
            if (field.required) {
              const value = isFieldResponse(raw) ? raw.value : getFieldValue(raw);
              if (!isFieldFilled(value)) {
                validationErrors.push(
                  `Paso "${step.title}": campo "${field.label}" es requerido para marcarlo completo.`
                );
              }
            }
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors.join(" · "), validation_errors: validationErrors },
        { status: 422 }
      );
    }

    const saved = await upsertQuestionnaireResponse({
      clientId: id,
      serviceKey,
      responses: responsesIn,
      completedSections,
      actorEmail: user,
      expectedUpdatedAt: body.expectedUpdatedAt ?? null,
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
    if (e instanceof QuestionnaireConflictError) {
      return NextResponse.json(
        {
          error:
            "Otro consultor guardó cambios mientras editabas. Recarga el cuestionario para ver el estado actual y reaplica tus cambios.",
          server_updated_at: e.serverUpdatedAt,
        },
        { status: 409 }
      );
    }
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
