import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireConsultorForClient } from "@/lib/auth";
import {
  listClientConsultors,
  assignConsultor,
} from "@/lib/consultors";
import { AssignConsultorSchema } from "@/lib/validation";
import { logChange } from "@/lib/audit-log";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id: clientId } = await params;
  const user = await requireConsultorForClient(clientId);
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  try {
    const data = await listClientConsultors(clientId);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/clients/:id/consultors]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { id: clientId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = AssignConsultorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await assignConsultor(
      clientId,
      parsed.data.user_email,
      parsed.data.seniority_level ?? null,
      admin
    );
    await logChange({
      actorEmail: admin,
      entityType: "client_consultors",
      entityId: `${clientId}::${parsed.data.user_email}`,
      action: "create",
      after: { user_email: parsed.data.user_email, seniority_level: parsed.data.seniority_level },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/clients/:id/consultors]", e);
    const msg = e instanceof Error ? e.message : "Error al asignar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
