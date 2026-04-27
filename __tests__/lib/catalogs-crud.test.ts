import { describe, it, expect, vi, beforeEach } from "vitest";

// Chain mock: cualquier método devuelve un thenable que resuelve a un valor
// configurable. Esto evita configurar cada salto de la cadena.
type ChainResult = { data?: unknown; error?: unknown };
const chainResult: { value: ChainResult } = { value: { data: null, error: null } };
const insertSpy = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
const deleteSpy = vi.fn();

function makeChain(): unknown {
  const proxy: Record<string, unknown> = {
    insert: (v: unknown) => {
      insertSpy(v);
      return makeChain();
    },
    update: (v: unknown) => {
      updateSpy(v);
      return makeChain();
    },
    delete: () => {
      deleteSpy();
      return makeChain();
    },
    eq: (col: string, val: unknown) => {
      eqSpy(col, val);
      return makeChain();
    },
    select: () => makeChain(),
    order: () => makeChain(),
    limit: () => makeChain(),
    maybeSingle: () => Promise.resolve(chainResult.value),
    single: () => Promise.resolve(chainResult.value),
    then: (
      onFulfilled: (v: ChainResult) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise.resolve(chainResult.value).then(onFulfilled, onRejected),
  };
  return proxy;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => makeChain() }),
}));

beforeEach(() => {
  insertSpy.mockReset();
  updateSpy.mockReset();
  eqSpy.mockReset();
  deleteSpy.mockReset();
  chainResult.value = { data: null, error: null };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real.supabase.co";
});

describe("catalogs CRUD", () => {
  it("listCatalog cae a seeds si DB devuelve []", async () => {
    chainResult.value = { data: [], error: null };
    const { listCatalog } = await import("@/lib/catalogs");
    const out = await listCatalog("frameworks");
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((i) => i.category === "frameworks")).toBe(true);
  });

  it("listCatalog cae a seeds si error", async () => {
    chainResult.value = { data: null, error: { message: "boom" } };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { listCatalog } = await import("@/lib/catalogs");
    const out = await listCatalog("countries");
    expect(out.length).toBeGreaterThan(0);
    consoleErr.mockRestore();
  });

  it("listCatalog devuelve filas si DB tiene", async () => {
    chainResult.value = {
      data: [
        {
          id: "1",
          category: "frameworks",
          value: "custom",
          label: "Custom",
          group_name: null,
          sort_order: 1,
          is_active: true,
          is_system: false,
          metadata: null,
          created_by: null,
          updated_by: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          description: null,
        },
      ],
      error: null,
    };
    const { listCatalog } = await import("@/lib/catalogs");
    const out = await listCatalog("frameworks");
    expect(out[0].value).toBe("custom");
  });

  it("createCatalogItem rechaza valor canónico vacío", async () => {
    const { createCatalogItem } = await import("@/lib/catalogs");
    await expect(
      createCatalogItem(
        { category: "frameworks", value: "   ", label: "" },
        "admin@x.com"
      )
    ).rejects.toThrow(/canónico vacío/);
  });

  it("createCatalogItem auto-slugify si no viene value", async () => {
    chainResult.value = {
      data: { id: "1", value: "tema_complejo_con_aei" },
      error: null,
    };
    const { createCatalogItem } = await import("@/lib/catalogs");
    await createCatalogItem(
      {
        category: "material_topics",
        label: "Tema Complejo: con áéí!",
      },
      "admin@x.com"
    );
    expect(insertSpy).toHaveBeenCalled();
    const inserted = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof inserted.value).toBe("string");
    expect(inserted.value).toMatch(/^tema_complejo/);
    expect(inserted.is_system).toBe(false);
  });

  it("updateCatalogItem solo manda campos definidos", async () => {
    chainResult.value = {
      data: { id: "1", label: "Nuevo" },
      error: null,
    };
    const { updateCatalogItem } = await import("@/lib/catalogs");
    await updateCatalogItem("1", { label: "Nuevo" }, "editor@x.com");
    expect(updateSpy).toHaveBeenCalled();
    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.label).toBe("Nuevo");
    expect(patch.updated_by).toBe("editor@x.com");
    expect(patch).not.toHaveProperty("value");
  });

  it("deleteCatalogItem bloquea ítems del sistema", async () => {
    chainResult.value = { data: { is_system: true }, error: null };
    const { deleteCatalogItem } = await import("@/lib/catalogs");
    await expect(deleteCatalogItem("1")).rejects.toThrow(/sistema/);
  });

  it("deleteCatalogItem deja pasar ítems no-sistema", async () => {
    chainResult.value = { data: { is_system: false }, error: null };
    const { deleteCatalogItem } = await import("@/lib/catalogs");
    await expect(deleteCatalogItem("2")).resolves.toBeUndefined();
    expect(deleteSpy).toHaveBeenCalled();
  });

  it("reorderCatalog hace una llamada por id", async () => {
    chainResult.value = { error: null };
    const { reorderCatalog } = await import("@/lib/catalogs");
    await reorderCatalog(
      "frameworks",
      ["a", "b", "c"],
      "editor@x.com"
    );
    expect(updateSpy).toHaveBeenCalledTimes(3);
  });
});

describe("slugify", () => {
  it("normaliza espacios + acentos + puntuación", async () => {
    const { slugify } = await import("@/lib/catalogs");
    expect(slugify("Cambio Climático")).toBe("cambio_climatico");
    expect(slugify("  CSRD (UE)  ")).toBe("csrd_ue");
    expect(slugify("--Hola--Mundo--")).toBe("hola_mundo");
  });
});
