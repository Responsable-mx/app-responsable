import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listClients, createClientRow, deleteClientRow } from "@/lib/clients";
import { ClientInputSchema } from "@/lib/validation";
import { upsertQuestionnaireResponse } from "@/lib/questionnaires/queries";
import type { FieldResponse, QuestionnaireResponseData, SourceItem } from "@/lib/questionnaires/types";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 500;

  try {
    const data = await listClients({ search, limit });
    return NextResponse.json(
      { data },
      {
        headers: {
          // Búsqueda activa: no cachear para resultados frescos.
          // Sin búsqueda: 60s con stale-while-revalidate para dropdown del chat.
          "Cache-Control": search
            ? "private, no-store"
            : "private, max-age=60, stale-while-revalidate=300",
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

    // Si viene wizardStep1 → seed inicial de questionnaire_responses.
    // Atomicidad: si el seed falla, hacer rollback del cliente para evitar
    // estado parcial (cliente sin cuestionario inicial cuando el flujo lo requiere).
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
        console.error("[POST /api/clients] seed wizardStep1 falló — rollback cliente:", e);
        try {
          await deleteClientRow(data.id);
        } catch (rollbackErr) {
          console.error("[POST /api/clients] rollback también falló:", rollbackErr);
        }
        return NextResponse.json(
          {
            error:
              "Cliente creado pero seed inicial falló. Operación revertida — vuelve a intentar.",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/clients]", e);
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
