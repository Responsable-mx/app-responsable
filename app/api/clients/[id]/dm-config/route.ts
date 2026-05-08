import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Defaults metodológicos ResponSable: ≤2027 / 2030 / 2040
export const DM_HORIZON_DEFAULTS = {
  corto_year:   2027,
  mediano_year: 2030,
  largo_year:   2040,
} as const;

export type DmHorizons = {
  corto_year:   number;
  mediano_year: number;
  largo_year:   number;
};

const DmHorizonsSchema = z.object({
  corto_year:   z.number().int().min(2024).max(2040),
  mediano_year: z.number().int().min(2024).max(2050),
  largo_year:   z.number().int().min(2024).max(2060),
}).partial();

type Ctx = { params: Promise<{ id: string }> };

// ── GET — devuelve horizontes (con defaults si no están configurados) ──────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("clients")
    .select("dm_horizons")
    .eq("id", id)
    .single();

  const horizons: DmHorizons = {
    ...DM_HORIZON_DEFAULTS,
    ...(data?.dm_horizons ?? {}),
  };

  return NextResponse.json({ data: horizons });
}

// ── PATCH — actualiza horizontes del cliente ──────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = DmHorizonsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body inválido" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Fetch actual para merge (no sobreescribir campos no enviados)
  const { data: current } = await admin
    .from("clients")
    .select("dm_horizons")
    .eq("id", id)
    .single();

  const merged: DmHorizons = {
    ...DM_HORIZON_DEFAULTS,
    ...(current?.dm_horizons ?? {}),
    ...parsed.data,
  };

  const { error } = await admin
    .from("clients")
    .update({ dm_horizons: merged })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: merged });
}
