import { describe, it, expect, beforeEach } from "vitest";
import {
  EMAIL_REGEX,
  isValidEmail,
  normalizeEmail,
  requireConsultorForClient,
} from "@/lib/auth";

describe("isValidEmail", () => {
  it("acepta emails válidos", () => {
    expect(isValidEmail("nicolas@s-peak.com")).toBe(true);
    expect(isValidEmail("g+alias@responsable.net")).toBe(true);
  });

  it("rechaza emails inválidos", () => {
    expect(isValidEmail("sin-arroba")).toBe(false);
    expect(isValidEmail("dos@@at.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("EMAIL_REGEX es exportable", () => {
    expect(EMAIL_REGEX).toBeInstanceOf(RegExp);
  });
});

describe("normalizeEmail", () => {
  it("lowercase y trim", () => {
    expect(normalizeEmail("  Foo@Bar.com  ")).toBe("foo@bar.com");
  });
});

describe("requireConsultorForClient — dev mode", () => {
  beforeEach(() => {
    // Dev mode: sin NEXT_PUBLIC_SUPABASE_URL, requireUser() devuelve "dev@localhost"
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("dev@localhost pasa sin check de DB", async () => {
    const result = await requireConsultorForClient("any-client-id");
    expect(result).toBe("dev@localhost");
  });

  it("acepta cualquier clientId en dev mode", async () => {
    const a = await requireConsultorForClient("client-123");
    const b = await requireConsultorForClient("otro-id");
    expect(a).toBe("dev@localhost");
    expect(b).toBe("dev@localhost");
  });
});
