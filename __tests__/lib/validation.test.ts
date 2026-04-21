import { describe, it, expect } from "vitest";
import {
  ClientInputSchema,
  ChatRequestSchema,
  RoleSchema,
} from "@/lib/validation";

describe("ClientInputSchema", () => {
  it("acepta un cliente mínimo solo con nombre", () => {
    const r = ClientInputSchema.safeParse({ name: "Heineken" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = ClientInputSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("acepta los 6 bloques de contexto como strings largos", () => {
    const r = ClientInputSchema.safeParse({
      name: "IKEA",
      sector: "Retail",
      countries: ["México", "Costa Rica"],
      size: "corporativo",
      info_general: "3 tiendas en MX",
      business_model: "retail omnicanal",
      impacts: "emisiones alcance 1 y 2 medidas",
      regulatory_context: "NIS aplicable 2026",
      sustainability_strategy: "People & Planet Positive",
      stakeholders: "clientes, proveedores, comunidades",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza size fuera del enum", () => {
    const r = ClientInputSchema.safeParse({ name: "X", size: "gigante" });
    expect(r.success).toBe(false);
  });
});

describe("RoleSchema", () => {
  it("acepta los 4 roles canónicos", () => {
    for (const r of ["aurora", "rebeca", "elena", "valeria"]) {
      expect(RoleSchema.safeParse(r).success).toBe(true);
    }
  });

  it("rechaza rol desconocido", () => {
    expect(RoleSchema.safeParse("copilot").success).toBe(false);
  });
});

describe("ChatRequestSchema", () => {
  it("requiere al menos un mensaje", () => {
    const r = ChatRequestSchema.safeParse({ role: "aurora", messages: [] });
    expect(r.success).toBe(false);
  });

  it("acepta un request válido sin clientId", () => {
    const r = ChatRequestSchema.safeParse({
      role: "aurora",
      messages: [{ role: "user", content: "hola" }],
    });
    expect(r.success).toBe(true);
  });
});
