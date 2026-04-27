import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  listClientServices,
  createClientService,
} from "@/lib/client-services";
import type { ServiceKey } from "@/lib/services/service-schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const data = await listClientServices(id);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  let body: { service?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const allowed: ServiceKey[] = ["doble_materialidad", "esr", "informe_sostenibilidad"];
  if (!body.service || !allowed.includes(body.service as ServiceKey)) {
    return NextResponse.json({ error: "service inválido" }, { status: 400 });
  }
  try {
    const data = await createClientService(
      {
        client_id: id,
        service: body.service as ServiceKey,
        data: body.data ?? {},
      },
      user
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
