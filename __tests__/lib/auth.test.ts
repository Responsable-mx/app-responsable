import { describe, it, expect } from "vitest";
import {
  EMAIL_REGEX,
  isValidEmail,
  normalizeEmail,
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
