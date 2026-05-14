import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIbsoForSector } from "@/lib/dm/nis-catalog";
import { getClient } from "@/lib/clients";
import { logChange } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  id:           z.string().uuid(),
  estado:       z.enum(["no_identificado", "parcial", "disponible", "no_aplica"]).optional(),
  calidad_dato: z.enum(["baja", "media", "alta"]).optional(),
  accion:       z.string().max(400).nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

// ── GET — devuelve filas NIS/IBSO del cliente ─────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_nis_assessment")
    .select("*")
    .eq("client_id", id)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST — genera NIS desde cuestionario (sin IA, instantáneo) ─

// Keywords por indicador — detecta si el cuestionario menciona este tema
const INDICATOR_KEYWORDS: Record<string, string[]> = {
  emisiones_ghg:          ["emision", "ghg", "carbono", "co2", "gases", "huella", "alcance"],
  consumo_energia:        ["energia", "kwh", "electricidad", "combustible", "renovable", "solar"],
  consumo_agua:           ["agua", "water", "hidrico", "descarga", "consumo agua"],
  residuos:               ["residuo", "desecho", "basura", "reciclaje", "disposicion", "manejo residuo"],
  cumplimiento_ambiental: ["norma ambiental", "regulacion", "licencia ambiental", "iso 14001", "semarnat"],
  seguridad_laboral:      ["seguridad", "accidente", "incidente", "salud laboral", "lesion", "ergonomia"],
  capacitacion:           ["capacitacion", "formacion", "entrenamiento", "desarrollo personal", "becas"],
  condiciones_laborales:  ["salario", "jornada", "contrato", "derechos laborales", "sindical"],
  cadena_suministro:      ["proveedor", "cadena suministro", "compra sostenible", "supply chain"],
  privacidad_datos:       ["datos personales", "privacidad", "ciberseguridad", "gdpr", "lfpdppp"],
  etica_anticorrupcion:   ["etica", "anticorrupcion", "soborno", "integridad", "codigo conducta", "whistleblower"],
  gestion_riesgos_esg:    ["riesgo", "gobierno", "gobernanza", "esg", "comite", "politica sostenibilidad", "materialidad", "gestion riesgo", "transparencia"],
};

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const admin = createAdminClient();

  // Cuestionario + IROs materiales del cliente (Etapa 6) en paralelo
  const [qRes, irosRes] = await Promise.all([
    admin
      .from("questionnaire_responses")
      .select("responses")
      .eq("client_id", id)
      .eq("service_key", "doble-materialidad")
      .maybeSingle(),
    admin
      .from("client_iro_inventory")
      .select("tema_esg")
      .eq("client_id", id)
      .eq("incluido", true),
  ]);

  const questText = qRes.data?.responses
    ? JSON.stringify(qRes.data.responses).toLowerCase()
    : "";

  // Texto plano con todos los temas ESG identificados como materiales (Etapa 6).
  // Permite elevar calidad_dato cuando el análisis DM ya confirmó la relevancia.
  const iroTopicsText = (irosRes.data ?? [])
    .map((r) => r.tema_esg.toLowerCase())
    .join(" ");

  // Indicadores relevantes según sector
  const ibsos = getIbsoForSector(client.sector);

  const rows = ibsos.map((ibso) => {
    const keywords = INDICATOR_KEYWORDS[ibso.key] ?? [];
    const hasEvidence   = keywords.some((kw) => questText.includes(kw));
    const confirmedByIro = keywords.some((kw) => iroTopicsText.includes(kw));

    // IRO confirmado (materialidad ya analizada) = señal más fuerte que solo cuestionario.
    const estado: "no_identificado" | "parcial" | "disponible" =
      confirmedByIro || hasEvidence ? "parcial" : "no_identificado";
    const calidad_dato: "baja" | "media" | "alta" =
      confirmedByIro && hasEvidence ? "alta"
      : confirmedByIro || hasEvidence ? "media"
      : "baja";

    return {
      client_id:    id,
      ibso_key:     ibso.key,
      ibso_label:   ibso.label,
      categoria:    ibso.categoria,
      estado,
      calidad_dato,
      accion:       null as string | null,
      sort_order:   ibso.sort_order,
    };
  });

  // Insertar solo los indicadores que no existen aún (preservar ediciones del consultor)
  const { data: existing } = await admin
    .from("client_nis_assessment")
    .select("ibso_key")
    .eq("client_id", id);

  const existingKeys = new Set((existing ?? []).map((r) => r.ibso_key));
  const toInsert = rows.filter((r) => !existingKeys.has(r.ibso_key));

  if (toInsert.length > 0) {
    await admin.from("client_nis_assessment").insert(toInsert);
    void logChange({
      actorEmail: user,
      entityType: "dm_nis",
      entityId: id,
      action: "create",
      before: null,
      after: { client_id: id, inserted_count: toInsert.length, sector: client.sector },
    });
  }

  const { data: final } = await admin
    .from("client_nis_assessment")
    .select("*")
    .eq("client_id", id)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ data: final ?? [] });
}

// ── PATCH — actualiza una fila ────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Body inválido" }, { status: 400 });

  const { id: nisId, ...fields } = parsed.data;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.estado !== undefined)       update.estado = fields.estado;
  if (fields.calidad_dato !== undefined) update.calidad_dato = fields.calidad_dato;
  if (fields.accion !== undefined)       update.accion = fields.accion;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("client_nis_assessment")
    .select("ibso_key, estado, calidad_dato, accion")
    .eq("id", nisId)
    .eq("client_id", id)
    .maybeSingle();

  const { data, error } = await admin
    .from("client_nis_assessment")
    .update(update)
    .eq("id", nisId)
    .eq("client_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  void logChange({
    actorEmail: user,
    entityType: "dm_nis",
    entityId: nisId,
    action: "update",
    before,
    after: { client_id: id, ...update },
  });
  return NextResponse.json({ data });
}
