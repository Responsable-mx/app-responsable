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

describe("clientContextCompleteness", () => {
  const base = {
    info_general: null,
    business_model: null,
    impacts: null,
    regulatory_context: null,
    sustainability_strategy: null,
    stakeholders: null,
  };

  it("devuelve 0/6 cuando todos los bloques son null", () => {
    expect(clientContextCompleteness(base)).toEqual({ filled: 0, total: 6 });
  });

  it("no cuenta strings vacíos ni muy cortos", () => {
    const c = {
      ...base,
      info_general: "",
      business_model: "corto",
    };
    expect(clientContextCompleteness(c).filled).toBe(0);
  });

  it("cuenta solo bloques con ≥20 caracteres", () => {
    const c = {
      ...base,
      info_general: "a".repeat(20),
      business_model: "a".repeat(19),
      impacts: "a".repeat(100),
    };
    expect(clientContextCompleteness(c).filled).toBe(2);
  });

  it("6/6 con todos los bloques llenos", () => {
    const c = {
      info_general: "a".repeat(30),
      business_model: "a".repeat(30),
      impacts: "a".repeat(30),
      regulatory_context: "a".repeat(30),
      sustainability_strategy: "a".repeat(30),
      stakeholders: "a".repeat(30),
    };
    expect(clientContextCompleteness(c)).toEqual({ filled: 6, total: 6 });
  });
});

describe("dev mode guards (sin Supabase configurado)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("isDevMode() devuelve true sin URL", () => {
    expect(isDevMode()).toBe(true);
  });

  it("isDevMode() devuelve true con URL placeholder", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://xxx.supabase.co";
    expect(isDevMode()).toBe(true);
  });

  it("listClients devuelve array vacío en dev mode", async () => {
    await expect(listClients()).resolves.toEqual([]);
  });

  it("getClient devuelve null en dev mode", async () => {
    await expect(getClient("any-id")).resolves.toBeNull();
  });

  it("createClientRow lanza error descriptivo en dev mode", async () => {
    await expect(
      createClientRow({ name: "X" }, "me@ex.com")
    ).rejects.toThrow(/crear clientes/);
  });

  it("updateClientRow lanza error descriptivo en dev mode", async () => {
    await expect(
      updateClientRow("id", { name: "Y" }, "me@ex.com")
    ).rejects.toThrow(/editar clientes/);
  });

  it("deleteClientRow lanza error descriptivo en dev mode", async () => {
    await expect(deleteClientRow("id")).rejects.toThrow(/eliminar clientes/);
  });
});
