import { describe, it, expect, beforeEach } from "vitest";

import {
  clientContextCompleteness,
  isDevMode,
  listClients,
  getClient,
  createClientRow,
  updateClientRow,
  deleteClientRow,
} from "@/lib/clients";

const EMPTY_BASE = {
  business_segments: null,
  frameworks: null,
  applicable_regulations: null,
  policies_in_place: null,
  certifications: null,
  material_topics: null,
  maturity_level: null,
  has_double_materiality: null,
  info_general: null,
  business_model: null,
  impacts: null,
  regulatory_context: null,
  sustainability_strategy: null,
  stakeholders: null,
};

describe("clientContextCompleteness v2 (14 puntos)", () => {
  it("devuelve 0/14 cuando todo es null/vacío", () => {
    expect(clientContextCompleteness(EMPTY_BASE)).toEqual({
      filled: 0,
      total: 14,
    });
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
    const c = {
      ...EMPTY_BASE,
      has_double_materiality: false,
    };
    expect(clientContextCompleteness(c).filled).toBe(1);
  });

  it("narrativa: solo bloques con ≥20 chars cuentan", () => {
    const c = {
      ...EMPTY_BASE,
      info_general: "corto",
      business_model: "a".repeat(25),
      impacts: "",
    };
    expect(clientContextCompleteness(c).filled).toBe(1);
  });

  it("14/14 con todo lleno", () => {
    const c = {
      business_segments: ["b2b"],
      frameworks: ["gri"],
      applicable_regulations: ["issb_global"],
      policies_in_place: ["etica"],
      certifications: ["iso_14001"],
      material_topics: ["cambio_climatico"],
      maturity_level: "avanzado",
      has_double_materiality: true,
      info_general: "a".repeat(30),
      business_model: "a".repeat(30),
      impacts: "a".repeat(30),
      regulatory_context: "a".repeat(30),
      sustainability_strategy: "a".repeat(30),
      stakeholders: "a".repeat(30),
    };
    expect(clientContextCompleteness(c)).toEqual({ filled: 14, total: 14 });
  });
});

describe("dev mode guards (sin Supabase)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("isDevMode() true sin URL", () => {
    expect(isDevMode()).toBe(true);
  });

  it("listClients devuelve []", async () => {
    await expect(listClients()).resolves.toEqual([]);
  });

  it("getClient devuelve null", async () => {
    await expect(getClient("id")).resolves.toBeNull();
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
});
