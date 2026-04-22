import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATALOG_SEEDS,
  type CatalogCategory,
  type CatalogSeedItem,
} from "@/lib/catalogs/seeds";

export type { CatalogCategory } from "@/lib/catalogs/seeds";
export { CATALOG_CATEGORIES } from "@/lib/catalogs/seeds";

export type CatalogItem = {
  id: string;
  category: CatalogCategory;
  value: string;
  label: string;
  description: string | null;
  group_name: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogItemInput = {
  category: CatalogCategory;
  value?: string;           // auto-slugify si no viene
  label: string;
  description?: string | null;
  group_name?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

function isDevMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !url || url === "https://xxx.supabase.co";
}

/** Seeds como CatalogItem completos, para dev mode y fallback. */
function seedsAsItems(category?: CatalogCategory): CatalogItem[] {
  const filter = (s: CatalogSeedItem) =>
    category ? s.category === category : true;
  return CATALOG_SEEDS.filter(filter).map((s, i) => ({
    id: `seed-${s.category}-${s.value}`,
    category: s.category,
    value: s.value,
    label: s.label,
    description: null,
    group_name: s.group_name ?? null,
    sort_order: s.sort_order,
    is_active: true,
    is_system: true,
    metadata: null,
    created_by: null,
    updated_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    // i no se usa, pero sirve como discriminador si hubiera empate de id
    ...(i ? {} : {}),
  }));
}

/** Genera canónico a partir del label si value no viene. */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

const COLUMNS =
  "id,category,value,label,description,group_name,sort_order,is_active,is_system,metadata,created_by,updated_by,created_at,updated_at";

export async function listCatalog(
  category: CatalogCategory,
  opts?: { includeInactive?: boolean }
): Promise<CatalogItem[]> {
  if (isDevMode()) return seedsAsItems(category);
  const admin = createAdminClient();
  let q = admin
    .from("catalog_items")
    .select(COLUMNS)
    .eq("category", category)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(500);
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) {
    console.error("[catalogs] list error:", error.message);
    return seedsAsItems(category); // fallback
  }
  const rows = (data ?? []) as CatalogItem[];
  // Safety net: si la DB está vacía (nunca se aplicó seed), servimos el seed.
  if (rows.length === 0) return seedsAsItems(category);
  return rows;
}

export async function createCatalogItem(
  input: CatalogItemInput,
  createdBy: string
): Promise<CatalogItem> {
  if (isDevMode()) {
    throw new Error(
      "Supabase no configurado (dev mode). Los catálogos se administran en producción."
    );
  }
  const value = (input.value ?? slugify(input.label)).trim();
  if (!value) throw new Error("Valor canónico vacío");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("catalog_items")
    .insert({
      category: input.category,
      value,
      label: input.label.trim(),
      description: input.description ?? null,
      group_name: input.group_name ?? null,
      sort_order: input.sort_order ?? 1000,
      is_active: input.is_active ?? true,
      is_system: false,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`createCatalogItem: ${error.message}`);
  return data as CatalogItem;
}

export async function updateCatalogItem(
  id: string,
  input: Partial<CatalogItemInput>,
  updatedBy: string
): Promise<CatalogItem> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.value !== undefined) patch.value = input.value.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.group_name !== undefined) patch.group_name = input.group_name;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await admin
    .from("catalog_items")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`updateCatalogItem: ${error.message}`);
  return data as CatalogItem;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  // Protege items del sistema: tirar antes de llegar a RLS.
  const { data: existing, error: fetchErr } = await admin
    .from("catalog_items")
    .select("is_system")
    .eq("id", id)
    .single();
  if (fetchErr || !existing)
    throw new Error("Ítem no encontrado");
  if (existing.is_system)
    throw new Error(
      "Este ítem es del sistema. Desactívalo en lugar de eliminarlo."
    );

  const { error } = await admin.from("catalog_items").delete().eq("id", id);
  if (error) throw new Error(`deleteCatalogItem: ${error.message}`);
}

/** Reordena un bloque de items atómicamente (drag-drop). */
export async function reorderCatalog(
  category: CatalogCategory,
  orderedIds: string[],
  updatedBy: string
): Promise<void> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  // Step 10 en 10 para mantener espacio de maniobra futuro sin colisión.
  await Promise.all(
    orderedIds.map((id, index) =>
      admin
        .from("catalog_items")
        .update({
          sort_order: (index + 1) * 10,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("category", category)
    )
  );
}
