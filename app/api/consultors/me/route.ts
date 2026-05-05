import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listConsultorProjects } from "@/lib/consultors";

/**
 * GET /api/consultors/me
 * Proyectos asignados al usuario autenticado + seniority efectivo.
 * Usado en el sidebar ("Mis proyectos"). Cache: 1h (asignaciones cambian poco).
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await listConsultorProjects(user);
    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "private, max-age=3600, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/consultors/me]", e);
    return NextResponse.json({ error: "Error al cargar proyectos" }, { status: 500 });
  }
}
