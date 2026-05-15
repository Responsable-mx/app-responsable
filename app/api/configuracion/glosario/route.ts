import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

const SynonymSchema = z.object({
  responsable_term: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  synonyms_es: z.array(z.string()).default([]),
  synonyms_en: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("terminology_synonyms")
    .select("*")
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = SynonymSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const sb = createAdminClient();
  const { data, error } = await sb.from("terminology_synonyms").insert(parsed.data).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: admin, entityType: "terminology_synonym", entityId: data.id, action: "create", before: null, after: parsed.data });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string } & Record<string, unknown>;
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const sb = createAdminClient();
  const { data: before } = await sb.from("terminology_synonyms").select("*").eq("id", id).single();
  const { data, error } = await sb.from("terminology_synonyms").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: admin, entityType: "terminology_synonym", entityId: id, action: "update", before, after: data });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const sb = createAdminClient();
  const { data: before } = await sb.from("terminology_synonyms").select("*").eq("id", id).single();
  const { error } = await sb.from("terminology_synonyms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: admin, entityType: "terminology_synonym", entityId: id, action: "delete", before, after: null });
  return NextResponse.json({ ok: true });
}
