import { describe, it, expect } from "vitest";
import { DOCUMENT_KIND_SCHEMA, KIND_LABEL } from "@/lib/documents/types";

describe("DOCUMENT_KIND_SCHEMA", () => {
  it("acepta kinds válidos", () => {
    expect(DOCUMENT_KIND_SCHEMA.safeParse("general").success).toBe(true);
    expect(DOCUMENT_KIND_SCHEMA.safeParse("sustainability_report").success).toBe(true);
    expect(DOCUMENT_KIND_SCHEMA.safeParse("financial_report").success).toBe(true);
  });

  it("rechaza kinds inválidos", () => {
    expect(DOCUMENT_KIND_SCHEMA.safeParse("otro").success).toBe(false);
    expect(DOCUMENT_KIND_SCHEMA.safeParse("").success).toBe(false);
    expect(DOCUMENT_KIND_SCHEMA.safeParse(null).success).toBe(false);
    expect(DOCUMENT_KIND_SCHEMA.safeParse(123).success).toBe(false);
  });

  it("KIND_LABEL cubre todos los kinds del schema", () => {
    const kinds = DOCUMENT_KIND_SCHEMA.options;
    for (const kind of kinds) {
      expect(KIND_LABEL[kind]).toBeDefined();
      expect(KIND_LABEL[kind].length).toBeGreaterThan(0);
    }
  });
});
