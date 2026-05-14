import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const AdaptedIroSchema = z.object({
  adapted_descripcion: z.string().min(10),
  tipo: z.enum(["impacto_positivo", "impacto_negativo", "riesgo", "oportunidad"]),
  cadena: z.enum(["operacion", "upstream", "downstream", "sociedad_comunidad", "clientes_consumidores", "medio_ambiente"]),
  horizonte: z.enum(["corto", "mediano", "largo"]),
  tema_asociado: z.string().nullable(),
  justificacion: z.string(),
});

const PostBody = z.object({
  adapted: z.array(AdaptedIroSchema).min(1).max(20),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const { adapted } = parsed.data;
  const admin = createAdminClient();

  // Obtener el n_iro máximo actual para este cliente
  const { data: maxRow } = await admin
    .from("client_iro_inventory")
    .select("n_iro")
    .eq("client_id", id)
    .order("n_iro", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startN = (maxRow?.n_iro ?? 0) + 1;

  const rows = adapted.map((iro, i) => ({
    client_id: id,
    n_iro: startN + i,
    tema_esg: iro.tema_asociado ?? "Sin tema",
    descripcion: iro.adapted_descripcion,
    tipo: iro.tipo,
    estado: "potencial" as const,
    cadena: iro.cadena,
    horizonte: iro.horizonte,
    evidencia: iro.justificacion.slice(0, 200),
    confianza: "alto" as const,
    fuente: "adaptado_benchmark" as const,
    incluido: true,
  }));

  const { data, error } = await admin
    .from("client_iro_inventory")
    .insert(rows)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: { inserted: data?.length ?? 0 } });
}
