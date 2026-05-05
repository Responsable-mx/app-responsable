import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listClients, createClientRow } from "@/lib/clients";
import { ClientInputSchema } from "@/lib/validation";
import { upsertQuestionnaireResponse } from "@/lib/questionnaires/queries";
import type { FieldResponse, QuestionnaireResponseData, SourceItem } from "@/lib/questionnaires/types";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await listClients();
    return NextResponse.json(
      { data },
      {
        headers: {
          // Lista cambia ocasionalmente; 60s con SWR de 5 min es suficiente
          // para que el dropdown del chat no re-fetchee en cada turno.
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/clients]", e);
    return NextResponse.json({ error: "Error al listar clientes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Extraer wizardStep1 si viene (nuevo flujo) antes del parse del body principal.
  const bodyObj = body as Record<string, unknown>;
  const wizardStep1 = bodyObj.wizardStep1 as Record<string, unknown> | undefined;
  delete bodyObj.wizardStep1;

  const parsed = ClientInputSchema.safeParse(bodyObj);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await createClientRow(parsed.data, user);

    // Si viene wizardStep1 → seed inicial de questionnaire_responses
    if (wizardStep1 && data.id) {
      const now = new Date().toISOString();
      const stepData: Record<string, FieldResponse> = {};
      for (const [k, v] of Object.entries(wizardStep1)) {
        stepData[k] = {
          value: v === null || v === undefined || v === "" ? null : (v as string),
          source_type: "consultor_only",
          sources: [] as SourceItem[],
          validated: true, // consultor capturó directo = validado
          updated_at: now,
        };
      }
      const responses: QuestionnaireResponseData = { "informacion-base": stepData };
      try {
        await upsertQuestionnaireResponse({
          clientId: data.id,
          serviceKey: "doble-materialidad",
          responses,
          completedSections: ["informacion-base"],
          actorEmail: user,
        });
      } catch (e) {
        console.error("[POST /api/clients] seed wizardStep1 falló:", e);
        // No rompe la creación del cliente
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/clients]", e);
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
