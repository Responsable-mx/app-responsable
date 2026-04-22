import { describe, it, expect, beforeEach } from "vitest";
import {
  EMAIL_REGEX,
  isValidEmail,
  normalizeEmail,
  isAuthorizedEmail,
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

describe("isAuthorizedEmail", () => {
  beforeEach(() => {
    delete process.env.AUTHORIZED_EMAILS;
  });

  it("rechaza todos cuando no hay whitelist", () => {
    expect(isAuthorizedEmail("foo@bar.com")).toBe(false);
  });

  it("acepta email en whitelist (case-insensitive)", () => {
    process.env.AUTHORIZED_EMAILS =
      "gwenaelle@responsable.net,nblondel@s-peak.com";
    expect(isAuthorizedEmail("GWENAELLE@responsable.net")).toBe(true);
    expect(isAuthorizedEmail("nblondel@s-peak.com")).toBe(true);
  });

  it("rechaza email fuera de whitelist", () => {
    process.env.AUTHORIZED_EMAILS = "gwenaelle@responsable.net";
    expect(isAuthorizedEmail("intruder@example.com")).toBe(false);
  });

  it("tolera espacios extra entre comas", () => {
    process.env.AUTHORIZED_EMAILS =
      " gwenaelle@responsable.net , nblondel@s-peak.com ";
    expect(isAuthorizedEmail("nblondel@s-peak.com")).toBe(true);
  });
});
