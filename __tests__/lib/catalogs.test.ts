import { describe, it, expect, beforeEach } from "vitest";
import {
  slugify,
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  reorderCatalog,
  CATALOG_CATEGORIES,
} from "@/lib/catalogs";
import { CATALOG_SEEDS } from "@/lib/catalogs/seeds";

describe("slugify", () => {
  it("lowercase + guiones bajos", () => {
    expect(slugify("GRI Standards")).toBe("gri_standards");
    expect(slugify("CSRD (UE)")).toBe("csrd_ue");
  });

  it("quita acentos", () => {
    expect(slugify("México")).toBe("mexico");
    expect(slugify("Economía circular")).toBe("economia_circular");
  });

  it("colapsa caracteres especiales", () => {
    expect(slugify("B2B / B2C")).toBe("b2b_b2c");
  });

  it("corta a 60 chars", () => {
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it("sin leading/trailing underscore", () => {
    expect(slugify("  !hola!  ")).toBe("hola");
  });
});

describe("CATALOG_CATEGORIES", () => {
  it("tiene 9 categorías (8 temas + sectores + países, maturity y levels ya contados)", () => {
    expect(CATALOG_CATEGORIES.length).toBeGreaterThanOrEqual(9);
  });

  it("cada categoría tiene seeds", () => {
    for (const cat of CATALOG_CATEGORIES) {
      const seeds = CATALOG_SEEDS.filter((s) => s.category === cat.key);
      expect(seeds.length).toBeGreaterThan(0);
    }
  });

  it("maturity_levels tiene exactamente 4", () => {
    const seeds = CATALOG_SEEDS.filter((s) => s.category === "maturity_levels");
    expect(seeds).toHaveLength(4);
    expect(seeds.map((s) => s.value).sort()).toEqual([
      "avanzado",
      "gestionado",
      "inicial",
      "lider",
    ]);
  });

  it("frameworks incluye GRI y ISSB", () => {
    const fw = CATALOG_SEEDS.filter((s) => s.category === "frameworks").map(
      (s) => s.value
    );
    expect(fw).toContain("gri");
    expect(fw).toContain("issb");
  });
});

describe("dev mode — listCatalog devuelve seeds", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("devuelve los seeds completos de la categoría solicitada", async () => {
    const frameworks = await listCatalog("frameworks");
    expect(frameworks.length).toBeGreaterThanOrEqual(11);
    expect(frameworks[0]).toHaveProperty("value");
    expect(frameworks[0]).toHaveProperty("label");
    expect(frameworks[0]).toHaveProperty("is_system", true);
  });

  it("sectores contiene al menos 20 opciones curadas", async () => {
    const sectors = await listCatalog("sectors");
    expect(sectors.length).toBeGreaterThanOrEqual(20);
  });

  it("countries incluye México con group LATAM", async () => {
    const countries = await listCatalog("countries");
    const mx = countries.find((c) => c.value === "mx");
    expect(mx?.label).toBe("México");
    expect(mx?.group_name).toBe("LATAM");
  });
});

describe("dev mode — mutaciones lanzan error descriptivo", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("createCatalogItem falla", async () => {
    await expect(
      createCatalogItem(
        { category: "frameworks", label: "Nuevo marco" },
        "admin@x.com"
      )
    ).rejects.toThrow(/dev mode/);
  });

  it("updateCatalogItem falla", async () => {
    await expect(
      updateCatalogItem("id", { label: "X" }, "admin@x.com")
    ).rejects.toThrow(/dev mode/);
  });

  it("deleteCatalogItem falla", async () => {
    await expect(deleteCatalogItem("id")).rejects.toThrow(/dev mode/);
  });

  it("reorderCatalog falla", async () => {
    await expect(
      reorderCatalog("frameworks", ["a", "b"], "admin@x.com")
    ).rejects.toThrow(/dev mode/);
  });
});

describe("slugify — edge cases adicionales", () => {
  it('string vacío devuelve ""', () => {
    expect(slugify("")).toBe("");
  });

  it('solo espacios devuelve ""', () => {
    expect(slugify("   ")).toBe("");
  });

  it('solo caracteres especiales devuelve ""', () => {
    expect(slugify("!@#$%^")).toBe("");
  });

  it("acento compuesto (NFD) se normaliza", () => {
    // "Héroe" con vocal compuesta
    expect(slugify("Héroe")).toBe("heroe");
  });

  it("recorta exactamente a 60 chars", () => {
    const resultado = slugify("a".repeat(70));
    expect(resultado).toHaveLength(60);
  });
});

describe("dev mode — listCatalog categorías adicionales", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("listCatalog con opts no cambia resultado en dev mode (usa seeds)", async () => {
    const sinOpts = await listCatalog("frameworks");
    const conOpts = await listCatalog("frameworks", { includeInactive: false });
    expect(conOpts).toEqual(sinOpts);
  });

  it("sectors y frameworks no comparten items (filter por categoría funciona)", async () => {
    const sectors = await listCatalog("sectors");
    const frameworks = await listCatalog("frameworks");
    const sectorValues = new Set(sectors.map((s) => s.value));
    const frameworkValues = new Set(frameworks.map((s) => s.value));
    const intersect = [...sectorValues].filter((v) => frameworkValues.has(v));
    expect(intersect).toHaveLength(0);
  });

  it("certifications tiene al menos 1 item", async () => {
    const certs = await listCatalog("certifications");
    expect(certs.length).toBeGreaterThanOrEqual(1);
  });
});
