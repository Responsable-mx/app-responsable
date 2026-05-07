import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listActiveIros } from "@/lib/dm/iros";

export const dynamic = "force-dynamic";

/** GET /api/iros — devuelve todos los IROs activos.
 *  Caché 7200s in-memory en listActiveIros(). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const iros = await listActiveIros();
    return NextResponse.json({ data: iros });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo IROs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
