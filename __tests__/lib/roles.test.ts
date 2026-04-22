import { describe, it, expect } from "vitest";
import {
  buildClientContext,
  buildSystemBlocks,
  ROLE_PROMPTS,
} from "@/lib/ai/roles";

const FULL_CLIENT = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Heineken México",
  sector: "bebidas",
  subsector: "Cervezas",
  countries: ["mx"],
  size: "corporativo",
  business_segments: ["b2b", "b2b2c"],
  frameworks: ["gri", "sbti"],
  applicable_regulations: ["nis_mx"],
  policies_in_place: ["etica", "proveedores"],
  certifications: ["esr_cemefi"],
  material_topics: ["cambio_climatico", "agua"],
  maturity_level: "avanzado",
  has_double_materiality: true,
  has_sustainability_report: true,
  has_sustainability_strategy: true,
  info_general: "3 plantas en MX, ingresos 2025 ~80B MXN",
  business_model: "Retail + HORECA, B2B2C",
  impacts: "Alcance 1+2 medidos, alcance 3 en progreso",
  regulatory_context: "NIS + ISSB aplicables 2026",
  sustainability_strategy: "Brew a Better World 2030",
  stakeholders: "Comunidades Tecate, SLP; proveedores agrícolas",
  created_by: "g@r.net",
  updated_by: "g@r.net",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

describe("buildClientContext", () => {
  it("genera placeholder para cliente nulo mencionando /clientes", () => {
    const out = buildClientContext(null);
    expect(out).toContain("<context>");
    expect(out).toContain("metodología general");
    expect(out).toContain("/clientes");
  });

  it("incluye los 6 bloques cuando hay cliente", () => {
    const out = buildClientContext(FULL_CLIENT);
    expect(out).toContain("Heineken México");
    expect(out).toContain("<info_general>");
    expect(out).toContain("<business_model>");
    expect(out).toContain("<impacts>");
    expect(out).toContain("<regulatory_context>");
    expect(out).toContain("<sustainability_strategy>");
    expect(out).toContain("<stakeholders>");
    expect(out).toContain("Brew a Better World 2030");
  });

  it("marca bloques vacíos como (pendiente) y apunta a /clientes/:id", () => {
    const partial = { ...FULL_CLIENT, impacts: null, stakeholders: "" };
    const out = buildClientContext(partial);
    expect(out).toContain("(pendiente)");
    expect(out).toContain(`/clientes/${partial.id}`);
  });

  it("no filtra undefined en countries/sector/size", () => {
    const minimal = {
      ...FULL_CLIENT,
      sector: null,
      countries: null,
      size: null,
    };
    const out = buildClientContext(minimal);
    expect(out).not.toContain("<sector></sector>");
    expect(out).not.toContain("<countries></countries>");
    expect(out).not.toContain("<size></size>");
  });

  it("incluye atributos estructurados como tags compactos", () => {
    const out = buildClientContext(FULL_CLIENT);
    expect(out).toContain("<frameworks_reported>gri, sbti</frameworks_reported>");
    expect(out).toContain("<certifications>esr_cemefi</certifications>");
    expect(out).toContain(
      "<material_topics>cambio_climatico, agua</material_topics>"
    );
    expect(out).toContain("<maturity_level>avanzado</maturity_level>");
    expect(out).toContain("<has_double_materiality>sí</has_double_materiality>");
  });

  it("bool=false se serializa como 'no'", () => {
    const c = { ...FULL_CLIENT, has_double_materiality: false };
    const out = buildClientContext(c);
    expect(out).toContain("<has_double_materiality>no</has_double_materiality>");
  });

  it("bool=null no aparece en el output", () => {
    const c = { ...FULL_CLIENT, has_double_materiality: null };
    const out = buildClientContext(c);
    expect(out).not.toContain("<has_double_materiality>");
  });
});

describe("buildSystemBlocks", () => {
  it("devuelve 2 bloques de texto con cache_control solo en el último", () => {
    const blocks = buildSystemBlocks("aurora", null);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("text");
    // Solo el último tiene cache_control
    expect("cache_control" in blocks[0]).toBe(false);
    expect((blocks[1] as { cache_control?: unknown }).cache_control).toEqual({
      type: "ephemeral",
    });
  });

  it("el segundo bloque contiene el prompt del rol pedido", () => {
    const aurora = buildSystemBlocks("aurora", null);
    const rebeca = buildSystemBlocks("rebeca", null);
    expect(aurora[1].text).toContain("Aurora");
    expect(rebeca[1].text).toContain("Rebeca");
  });

  it("cada rol genera un prompt largo (proxy para >1024 tokens de cache)", () => {
    // Anthropic requiere ≥1,024 tokens para activar cache ephemeral.
    // Para español, el BPE usa ~2.5-3 chars/token. Pedimos al menos
    // 3,000 chars en el prompt del ROL (sin cliente) para estar seguros de
    // que con el contexto agregado superamos el umbral incluso cuando no
    // hay cliente seleccionado.
    for (const role of ["aurora", "rebeca", "elena", "valeria"] as const) {
      expect(ROLE_PROMPTS[role].length).toBeGreaterThan(3000);
    }
  });
});

describe("ROLE_PROMPTS", () => {
  it("los 4 roles tienen prompt no vacío con reglas y XML tags", () => {
    for (const role of ["aurora", "rebeca", "elena", "valeria"] as const) {
      const p = ROLE_PROMPTS[role];
      expect(p).toContain("<role>");
      expect(p).toContain("<rules>");
      expect(p).toContain("<instructions>");
      expect(p).toContain("<app_navigation>");
    }
  });
});
