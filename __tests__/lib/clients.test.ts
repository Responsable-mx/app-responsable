import { describe, it, expect, beforeEach } from "vitest";

import {
  clientContextCompleteness,
  listClients,
  listClientsLight,
  listClientsForTable,
  getClient,
  getClientMini,
  getClientEngagements,
  createClientRow,
  updateClientRow,
  deleteClientRow,
} from "@/lib/clients";
import { isDevMode } from "@/lib/env";

const EMPTY_BASE = {
  business_segments: null,
  frameworks: null,
  applicable_regulations: null,
  policies_in_place: null,
  certifications: null,
  material_topics: null,
  maturity_level: null,
  has_double_materiality: null,
  info_general_json: null,
  business_model_json: null,
  impacts_json: null,
  regulatory_context_json: null,
  sustainability_strategy_json: null,
  stakeholders_json: null,
};

describe("clientContextCompleteness v3 (atributos + sub-campos JSONB)", () => {
  it("devuelve 0 cuando todo es null/vacío", () => {
    const r = clientContextCompleteness(EMPTY_BASE);
    expect(r.filled).toBe(0);
    expect(r.total).toBeGreaterThan(30);
  });

  it("cuenta chips: 1 punto por grupo con ≥1 valor", () => {
    const c = {
      ...EMPTY_BASE,
      frameworks: ["gri"],
      certifications: ["iso_14001", "b_corp"],
    };
    expect(clientContextCompleteness(c).filled).toBe(2);
  });

  it("cuenta maturity_level y has_double_materiality como items independientes", () => {
    const c = {
      ...EMPTY_BASE,
      maturity_level: "gestionado",
      has_double_materiality: true,
    };
    expect(clientContextCompleteness(c).filled).toBe(2);
  });

  it("has_double_materiality=false también cuenta (es respuesta válida)", () => {
    const c = { ...EMPTY_BASE, has_double_materiality: false };
    expect(clientContextCompleteness(c).filled).toBe(1);
  });

  it("cuenta sub-campos JSONB: string y number llenos", () => {
    const c = {
      ...EMPTY_BASE,
      sustainability_strategy_json: {
        materialidad_metodologia: "Encuestas + entrevistas",
        materialidad_ano: 2024,
      },
    };
    expect(clientContextCompleteness(c).filled).toBe(2);
  });

  it("cuenta sub-campos tipo lista: ≥1 item = 1 punto", () => {
    const c = {
      ...EMPTY_BASE,
      sustainability_strategy_json: {
        pilares: ["Clima", "Agua"],
        objetivos: [{ pilar: "Clima", meta: "Net zero", deadline: 2040 }],
      },
    };
    expect(clientContextCompleteness(c).filled).toBe(2);
  });

  it("ignora strings vacíos y listas vacías", () => {
    const c = {
      ...EMPTY_BASE,
      info_general_json: {
        unidades_negocio: [],
        productos_principales: "",
        volumen_anual: "42 Mhl/año",
      },
    };
    expect(clientContextCompleteness(c).filled).toBe(1);
  });

  it("total incluye atributos + sub-campos narrativos", () => {
    const { total } = clientContextCompleteness(EMPTY_BASE);
    // 8 atributos (6 chips + maturity + has_double_materiality)
    // + ~33 sub-campos narrativos (según schemas)
    expect(total).toBeGreaterThanOrEqual(30);
    expect(total).toBeLessThanOrEqual(80);
  });
});

describe("dev mode guards (sin Supabase)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("isDevMode() true sin URL", () => {
    expect(isDevMode()).toBe(true);
  });

  it("listClients devuelve seeds de dev (Heineken + IKEA para mockup)", async () => {
    const list = await listClients();
    expect(list.length).toBe(2);
    const names = list.map((c) => c.name).sort();
    expect(names).toEqual(["Heineken México", "IKEA México"]);
  });

  it("getClient devuelve un seed si matchea, null si no", async () => {
    await expect(getClient("dev-heineken")).resolves.not.toBeNull();
    await expect(getClient("id-que-no-existe")).resolves.toBeNull();
  });

  it("createClientRow lanza error en dev mode", async () => {
    await expect(
      createClientRow({ name: "X" }, "me@ex.com")
    ).rejects.toThrow(/crear clientes/);
  });

  it("updateClientRow lanza error en dev mode", async () => {
    await expect(
      updateClientRow("id", { name: "Y" }, "me@ex.com")
    ).rejects.toThrow(/editar clientes/);
  });

  it("deleteClientRow lanza error en dev mode", async () => {
    await expect(deleteClientRow("id")).rejects.toThrow(/eliminar clientes/);
  });

  it("getClientMini devuelve { id, has_double_materiality } para seed", async () => {
    const mini = await getClientMini("dev-heineken");
    expect(mini).not.toBeNull();
    expect(mini?.id).toBe("dev-heineken");
    expect(mini?.has_double_materiality).toBe(true);
  });

  it("getClientMini devuelve null para id desconocido", async () => {
    await expect(getClientMini("no-existe")).resolves.toBeNull();
  });

  it("listClientsLight devuelve solo id y name", async () => {
    const list = await listClientsLight();
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const item of list) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(Object.keys(item)).toHaveLength(2);
    }
  });

  it("listClientsForTable devuelve ClientRow con sector, frameworks, certifications", async () => {
    const list = await listClientsForTable();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const heineken = list.find((c) => c.id === "dev-heineken");
    expect(heineken).toBeDefined();
    expect(heineken?.sector).toBe("bebidas");
    expect(Array.isArray(heineken?.frameworks)).toBe(true);
  });

  it("getClientEngagements devuelve array vacío en dev mode", async () => {
    const result = await getClientEngagements("dev-heineken");
    expect(Array.isArray(result)).toBe(true);
  });
});
