import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPromptsMeta } from "@/lib/ai/prompts";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  try {
    const data = await listPromptsMeta();
    return NextResponse.json({ data }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("[GET /api/prompts]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}
