import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireConsultorOrAdmin } from "@/lib/auth";
import { archiveChatSession, getChatSession, renameChatSession } from "@/lib/chat-sessions";

type Ctx = { params: Promise<{ id: string }> };

const RenameSchema = z.object({ title: z.string().min(1).max(200) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const data = await getChatSession(id, user);
    if (!data) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}

// PATCH = renombrar título.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = RenameSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "title requerido" }, { status: 400 });
  }
  try {
    await renameChatSession(id, user, parsed.data.title);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}

// DELETE = archive (soft). Conserva historia para audit.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await requireConsultorOrAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    await archiveChatSession(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
