import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updateConsultorSeniority, removeConsultor } from "@/lib/consultors";
import { UpdateConsultorSenioritySchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string; userEmail: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { id: clientId, userEmail } = await params;
  const email = decodeURIComponent(userEmail).toLowerCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = UpdateConsultorSenioritySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    await updateConsultorSeniority(clientId, email, parsed.data.seniority_level);
    await logChange({
      actorEmail: admin,
      entityType: "client_consultors",
      entityId: `${clientId}::${email}`,
      action: "update",
      after: { seniority_level: parsed.data.seniority_level },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH /api/clients/:id/consultors/:email]", e);
    const msg = e instanceof Error ? e.message : "Error al actualizar";
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
  const { id: clientId, userEmail } = await params;
  const email = decodeURIComponent(userEmail).toLowerCase();

  try {
    await removeConsultor(clientId, email);
    await logChange({
      actorEmail: admin,
      entityType: "client_consultors",
      entityId: `${clientId}::${email}`,
      action: "delete",
      before: { user_email: email },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/clients/:id/consultors/:email]", e);
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
