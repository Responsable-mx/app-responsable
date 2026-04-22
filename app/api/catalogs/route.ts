import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireAdmin } from "@/lib/auth";
import {
  listCatalog,
  createCatalogItem,
  type CatalogCategory,
} from "@/lib/catalogs";
import {
  CatalogCategorySchema,
  CatalogItemInputSchema,
} from "@/lib/validation";

/**
 * GET /api/catalogs?category=X&all=true
 * - category obligatorio
 * - all=true requiere admin (incluye inactivos)
 * Lectura abierta a todos los autenticados (lo consumen los dropdowns del form).
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawCategory = searchParams.get("category");
  const includeInactive = searchParams.get("all") === "true";

  const parsed = CatalogCategorySchema.safeParse(rawCategory);
  if (!parsed.success) {
    return NextResponse.json({ error: "category inválida" }, { status: 400 });
  }
  const category: CatalogCategory = parsed.data;

  // Solo admin puede pedir includeInactive
  if (includeInactive) {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Requiere permisos de administrador." },
        { status: 403 }
      );
    }
  }

  try {
    const data = await listCatalog(category, { includeInactive });
    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    console.error("[GET /api/catalogs]", e);
    return NextResponse.json({ error: "Error al listar" }, { status: 500 });
  }
}

/**
 * POST /api/catalogs — admin only.
 */
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

  const parsed = CatalogItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  try {
    const data = await createCatalogItem(parsed.data, admin);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/catalogs]", e);
    const msg = e instanceof Error ? e.message : "Error al crear";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
