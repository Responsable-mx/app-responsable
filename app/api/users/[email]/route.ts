import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updateUser, deleteUser, getUser } from "@/lib/users";
import { UserPatchSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ email: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { email } = await params;
  const decoded = decodeURIComponent(email);
  try {
    const data = await getUser(decoded);
    if (!data)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/users/:email]", e);
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
  const { email } = await params;
  const decoded = decodeURIComponent(email).toLowerCase();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = UserPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  // Safety: no permitir que un admin se desactive o se degrade a sí mismo.
  // Evita quedarse sin admins por accidente.
  if (decoded === admin.toLowerCase()) {
    if (parsed.data.active === false) {
      return NextResponse.json(
        { error: "No puedes desactivar tu propia cuenta." },
        { status: 400 }
      );
    }
    if (parsed.data.role === "consultor") {
      return NextResponse.json(
        { error: "No puedes degradar tu propia cuenta a consultor." },
        { status: 400 }
      );
    }
  }

  try {
    const before = await getUser(decoded).catch(() => null);
    const data = await updateUser(decoded, parsed.data);
    await logChange({
      actorEmail: admin,
      entityType: "users",
      entityId: decoded,
      action: "update",
      before: before
        ? {
            role: before.role,
            full_name: before.full_name,
            active: before.active,
          }
        : null,
      after: { ...parsed.data },
    });
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[PATCH /api/users/:email]", e);
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
  const { email } = await params;
  const decoded = decodeURIComponent(email).toLowerCase();
  if (decoded === admin.toLowerCase()) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propia cuenta." },
      { status: 400 }
    );
  }
  try {
    const before = await getUser(decoded).catch(() => null);
    await deleteUser(decoded);
    await logChange({
      actorEmail: admin,
      entityType: "users",
      entityId: decoded,
      action: "delete",
      before: before
        ? { role: before.role, full_name: before.full_name }
        : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/users/:email]", e);
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
