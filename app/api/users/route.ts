import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listUsers, createUser } from "@/lib/users";
import { UserInputSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  try {
    const data = await listUsers();
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("[GET /api/users]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = UserInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await createUser(parsed.data, admin);
    await logChange({
      actorEmail: admin,
      entityType: "users",
      entityId: parsed.data.email,
      action: "create",
      after: { ...parsed.data },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/users]", e);
    const msg = e instanceof Error ? e.message : "Error al crear";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
