import { describe, it, expect } from "vitest";
import { buildClientContext, buildSystemBlocks } from "@/lib/ai/roles";
import { DEFAULT_PROMPTS, PROMPT_KEYS } from "@/lib/ai/prompts";

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
  info_general_json: {
    unidades_negocio: ["Cervezas MX", "Refrescos"],
    volumen_anual: "42 Mhl/año",
  },
  business_model_json: { tipo_ingresos: ["venta_mayorista"] },
  impacts_json: {
    emisiones_alcance_1_2: [
      { medido: true, valor: 45000, base_year: 2023 },
    ],
  },
  regulatory_context_json: {},
  sustainability_strategy_json: {
    pilares: ["Clima", "Agua", "Gente"],
    kpis: [
      {
        metrica: "Emisiones alcance 1+2",
        valor_actual: "45000",
        unidad: "tCO2e",
        target: "-30% vs 2023",
        base_year: 2023,
      },
    ],
    materialidad_ano: 2024,
  },
  stakeholders_json: {},
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
  });

  it("serializa sub-campos de JSONB como XML estructurado", () => {
    const out = buildClientContext(FULL_CLIENT);
    // pilares (lista de strings)
    expect(out).toContain("<pilares>Clima, Agua, Gente</pilares>");
    // kpis (lista de objetos)
    expect(out).toContain("<kpis>");
    expect(out).toContain('metrica="Emisiones alcance 1+2"');
    expect(out).toContain('target="-30% vs 2023"');
    // year simple
    expect(out).toContain("<materialidad_ano>2024</materialidad_ano>");
    // bool dentro de item
    expect(out).toContain('medido="true"');
  });

  it("marca bloque con JSONB vacío como (pendiente) y apunta a /clientes/:id", () => {
    const partial = {
      ...FULL_CLIENT,
      regulatory_context_json: {},
      stakeholders_json: null,
    };
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
    expect(out).toContain(
      "<frameworks_reported>gri, sbti</frameworks_reported>"
    );
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

describe("buildSystemBlocks (async)", () => {
  it("devuelve 2 bloques de texto con cache_control solo en el último", async () => {
    const blocks = await buildSystemBlocks("aurora", null);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("text");
    expect("cache_control" in blocks[0]).toBe(false);
    expect((blocks[1] as { cache_control?: unknown }).cache_control).toEqual({
      type: "ephemeral",
    });
  });

  it("el segundo bloque contiene el prompt del rol pedido", async () => {
    const aurora = await buildSystemBlocks("aurora", null);
    const rebeca = await buildSystemBlocks("rebeca", null);
    expect(aurora[1].text).toContain("Aurora");
    expect(rebeca[1].text).toContain("Rebeca");
  });

  it("el prefix combinado incluye navegación y reglas base", async () => {
    const blocks = await buildSystemBlocks("aurora", null);
    expect(blocks[1].text).toContain("<app_navigation>");
    expect(blocks[1].text).toContain("<rules>");
  });
});

describe("DEFAULT_PROMPTS", () => {
  it("los 6 keys tienen contenido", () => {
    for (const key of PROMPT_KEYS) {
      expect(DEFAULT_PROMPTS[key].length).toBeGreaterThan(100);
    }
  });

  it("cada rol tiene instrucciones y ejemplos", () => {
    for (const role of ["aurora", "rebeca", "elena", "valeria"] as const) {
      const p = DEFAULT_PROMPTS[`role.${role}` as const];
      expect(p).toContain("<role>");
      expect(p).toContain("<instructions>");
      expect(p).toContain("<examples>");
    }
  });

  it("reglas base incluye idioma y marcos de referencia", () => {
    const rules = DEFAULT_PROMPTS["system.base_rules"];
    expect(rules).toContain("español de México");
    expect(rules).toContain("GRI");
    expect(rules).toContain("ISSB");
  });

  it("cada rol + reglas base + navegación combinados superan umbral de cache (~1K tokens)", () => {
    for (const role of ["aurora", "rebeca", "elena", "valeria"] as const) {
      const total =
        DEFAULT_PROMPTS[`role.${role}` as const].length +
        DEFAULT_PROMPTS["system.app_navigation"].length +
        DEFAULT_PROMPTS["system.base_rules"].length;
      expect(total).toBeGreaterThan(3500);
    }
  });
});
