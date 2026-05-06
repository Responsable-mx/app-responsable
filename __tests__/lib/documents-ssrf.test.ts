import { describe, it, expect } from "vitest";
import { isPublicHttpUrl } from "@/lib/documents/ssrf";

describe("isPublicHttpUrl - permite", () => {
  it("HTTPS público", () => {
    expect(isPublicHttpUrl("https://example.com/report.pdf")).toEqual({ ok: true });
  });

  it("HTTP público (legacy)", () => {
    expect(isPublicHttpUrl("http://example.com/page")).toEqual({ ok: true });
  });

  it("subdominio con path complejo", () => {
    expect(isPublicHttpUrl("https://reports.acme.com/2024/sustainability.pdf?v=1")).toEqual({ ok: true });
  });
});

describe("isPublicHttpUrl - bloquea", () => {
  it("URL inválida", () => {
    expect(isPublicHttpUrl("not-a-url").ok).toBe(false);
  });

  it("file://", () => {
    expect(isPublicHttpUrl("file:///etc/passwd").ok).toBe(false);
  });

  it("ftp://", () => {
    expect(isPublicHttpUrl("ftp://example.com/file").ok).toBe(false);
  });

  it("localhost", () => {
    expect(isPublicHttpUrl("http://localhost:3000/x").ok).toBe(false);
  });

  it("127.0.0.1 (loopback)", () => {
    expect(isPublicHttpUrl("http://127.0.0.1/x").ok).toBe(false);
    expect(isPublicHttpUrl("http://127.99.1.1/x").ok).toBe(false);
  });

  it("10.0.0.0/8", () => {
    expect(isPublicHttpUrl("http://10.0.0.5/x").ok).toBe(false);
    expect(isPublicHttpUrl("http://10.255.255.255/x").ok).toBe(false);
  });

  it("192.168.0.0/16", () => {
    expect(isPublicHttpUrl("http://192.168.1.1/x").ok).toBe(false);
  });

  it("172.16.0.0/12", () => {
    expect(isPublicHttpUrl("http://172.16.0.1/x").ok).toBe(false);
    expect(isPublicHttpUrl("http://172.31.255.255/x").ok).toBe(false);
  });

  it("172.15 NO está bloqueado (fuera de RFC1918)", () => {
    expect(isPublicHttpUrl("http://172.15.0.1/x").ok).toBe(true);
  });

  it("172.32 NO está bloqueado (fuera de RFC1918)", () => {
    expect(isPublicHttpUrl("http://172.32.0.1/x").ok).toBe(true);
  });

  it("169.254 link-local (AWS metadata)", () => {
    expect(isPublicHttpUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
  });

  it("0.0.0.0", () => {
    expect(isPublicHttpUrl("http://0.0.0.0/x").ok).toBe(false);
  });

  it("IPv6 ::1", () => {
    expect(isPublicHttpUrl("http://[::1]/x").ok).toBe(false);
  });
});
