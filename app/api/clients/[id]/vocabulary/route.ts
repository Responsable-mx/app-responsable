import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logChange } from "@/lib/audit-log";

const EntrySchema = z.object({
  client_term: z.string().min(1).max(300),
  responsable_term: z.string().min(1).max(300),
  active: z.boolean().default(true),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("client_vocabulary")
    .select("*")
    .eq("client_id", id)
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = EntrySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("client_vocabulary")
    .upsert({ ...parsed.data, client_id: id }, { onConflict: "client_id,client_term" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: user, entityType: "client_vocabulary", entityId: data.id, action: "create", before: null, after: parsed.data });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { vocabId?: string } & Record<string, unknown>;
  const { vocabId, ...fields } = body;
  if (!vocabId) return NextResponse.json({ error: "vocabId requerido" }, { status: 400 });
  const sb = createAdminClient();
  const { data: before } = await sb.from("client_vocabulary").select("*").eq("id", vocabId).eq("client_id", id).single();
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const { data, error } = await sb
    .from("client_vocabulary")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", vocabId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: user, entityType: "client_vocabulary", entityId: vocabId, action: "update", before, after: data });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const vocabId = searchParams.get("vocabId");
  if (!vocabId) return NextResponse.json({ error: "vocabId requerido" }, { status: 400 });
  const sb = createAdminClient();
  const { data: before } = await sb.from("client_vocabulary").select("*").eq("id", vocabId).eq("client_id", id).single();
  if (!before) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const { error } = await sb.from("client_vocabulary").delete().eq("id", vocabId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChange({ actorEmail: user, entityType: "client_vocabulary", entityId: vocabId, action: "delete", before, after: null });
  return NextResponse.json({ ok: true });
}
