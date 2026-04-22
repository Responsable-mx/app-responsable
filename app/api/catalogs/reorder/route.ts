import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reorderCatalog } from "@/lib/catalogs";
import { ReorderCatalogSchema } from "@/lib/validation";

/**
 * PUT /api/catalogs/reorder
 * body: { category: "frameworks", ordered_ids: ["id1","id2",...] }
 */
export async function PUT(req: NextRequest) {
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
  const parsed = ReorderCatalogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    await reorderCatalog(parsed.data.category, parsed.data.ordered_ids, admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PUT /api/catalogs/reorder]", e);
    const msg = e instanceof Error ? e.message : "Error al reordenar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
