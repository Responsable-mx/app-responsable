import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listClients, createClientRow } from "@/lib/clients";
import { ClientInputSchema } from "@/lib/validation";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await listClients();
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET /api/clients]", e);
    return NextResponse.json({ error: "Error al listar clientes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = ClientInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await createClientRow(parsed.data, user);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/clients]", e);
    return NextResponse.json({ error: "Error al crear cliente" }, { status: 500 });
  }
}
