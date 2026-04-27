import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getPromptDetail,
  upsertPrompt,
  deletePromptOverride,
  type PromptKey,
} from "@/lib/ai/prompts";
import { PromptKeySchema, PromptUpdateSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { key: raw } = await params;
  const parsed = PromptKeySchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: "key inválida" }, { status: 400 });
  }
  try {
    const data = await getPromptDetail(parsed.data as PromptKey);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/prompts/:key]", e);
    return NextResponse.json({ error: "Error al leer" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { key: raw } = await params;
  const keyParsed = PromptKeySchema.safeParse(decodeURIComponent(raw));
  if (!keyParsed.success) {
    return NextResponse.json({ error: "key inválida" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PromptUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  try {
    const before = await getPromptDetail(keyParsed.data as PromptKey).catch(
      () => null
    );
    await upsertPrompt(keyParsed.data as PromptKey, parsed.data.content, admin);
    const data = await getPromptDetail(keyParsed.data as PromptKey);
    await logChange({
      actorEmail: admin,
      entityType: "prompts",
      entityId: keyParsed.data,
      action: "update",
      before: before ? { content: before.content } : null,
      after: { content: parsed.data.content },
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[PATCH /api/prompts/:key]", e);
    const msg = e instanceof Error ? e.message : "Error al guardar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { key: raw } = await params;
  const parsed = PromptKeySchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: "key inválida" }, { status: 400 });
  }
  try {
    const before = await getPromptDetail(parsed.data as PromptKey).catch(
      () => null
    );
    await deletePromptOverride(parsed.data as PromptKey);
    await logChange({
      actorEmail: admin,
      entityType: "prompts",
      entityId: parsed.data,
      action: "delete",
      before: before ? { content: before.content } : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/prompts/:key]", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
