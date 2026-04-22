import { NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import { getSetting, bumpTourVersion } from "@/lib/settings";

/** Lectura abierta: cualquier autenticado consulta el tour_version. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const version = (await getSetting<number>("tour_version")) ?? 1;
  return NextResponse.json(
    { data: { version } },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}

/** Bump (admin-only): fuerza re-tour a todo el equipo. */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  try {
    const next = await bumpTourVersion(admin);
    return NextResponse.json({ data: { version: next } });
  } catch (e) {
    console.error("[POST /api/settings/tour-version]", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
