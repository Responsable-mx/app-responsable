import { describe, it, expect, beforeEach } from "vitest";
import {
  listUsers,
  getUser,
  isAuthorized,
  isAdmin,
  isConsultor,
  isClient,
  getUserClientId,
  getUserRoles,
  recordLogin,
  createUser,
  updateUser,
  deleteUser,
  isSystemAccount,
} from "@/lib/users";

describe("dev mode — seeds de admins iniciales", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.AUTHORIZED_EMAILS;
  });

  it("listUsers devuelve los 3 admins iniciales", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(3);
    const emails = users.map((u) => u.email).sort();
    expect(emails).toEqual([
      "elian@responsable.net",
      "gwenaelle@responsable.net",
      "nblondel@s-peak.com",
    ]);
    expect(users.every((u) => u.role === "admin")).toBe(true);
  });

  it("getUser normaliza email (lowercase + trim)", async () => {
    const u = await getUser("  GWENAELLE@responsable.net  ");
    expect(u?.email).toBe("gwenaelle@responsable.net");
  });

  it("isAuthorized true para admin seed", async () => {
    expect(await isAuthorized("elian@responsable.net")).toBe(true);
  });

  it("isAuthorized false para email desconocido sin env var", async () => {
    expect(await isAuthorized("intruso@example.com")).toBe(false);
  });

  it("isAdmin true para admin seed", async () => {
    expect(await isAdmin("nblondel@s-peak.com")).toBe(true);
  });

  it("fallback a AUTHORIZED_EMAILS si no está en seeds", async () => {
    process.env.AUTHORIZED_EMAILS = "fallback@x.com";
    expect(await isAuthorized("fallback@x.com")).toBe(true);
    expect(await isAdmin("fallback@x.com")).toBe(true);
  });

  it("isConsultor true para admin seed (admin ⊆ consultor)", async () => {
    expect(await isConsultor("nblondel@s-peak.com")).toBe(true);
  });

  it("isConsultor false para email desconocido", async () => {
    expect(await isConsultor("desconocido@example.com")).toBe(false);
  });

  it("isConsultor dev@localhost devuelve true (dev mode shortcut)", async () => {
    expect(await isConsultor("dev@localhost")).toBe(true);
  });

  it("isClient false para admin seed", async () => {
    expect(await isClient("nblondel@s-peak.com")).toBe(false);
  });

  it("isClient dev@localhost devuelve false (dev mode shortcut)", async () => {
    expect(await isClient("dev@localhost")).toBe(false);
  });

  it("getUserClientId null para admin (no es cliente)", async () => {
    expect(await getUserClientId("nblondel@s-peak.com")).toBeNull();
  });

  it("getUserClientId dev@localhost devuelve null (dev mode shortcut)", async () => {
    expect(await getUserClientId("dev@localhost")).toBeNull();
  });
});

describe("dev mode — mutaciones lanzan error", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("createUser falla", async () => {
    await expect(
      createUser({ email: "x@y.com", role: "consultor" }, "admin@z.com")
    ).rejects.toThrow(/dev mode/);
  });

  it("updateUser falla", async () => {
    await expect(
      updateUser("x@y.com", { role: "admin" })
    ).rejects.toThrow(/dev mode/);
  });

  it("deleteUser falla", async () => {
    await expect(deleteUser("x@y.com")).rejects.toThrow(/dev mode/);
  });
});

describe("isSystemAccount", () => {
  it("null/undefined → false", () => {
    expect(isSystemAccount(null)).toBe(false);
    expect(isSystemAccount(undefined)).toBe(false);
    expect(isSystemAccount("")).toBe(false);
  });

  it("cuentas de sistema exactas → true", () => {
    expect(isSystemAccount("seed@responsable.net")).toBe(true);
    expect(isSystemAccount("system@responsable.net")).toBe(true);
    expect(isSystemAccount("cron@responsable.net")).toBe(true);
  });

  it("regex: prefijos seed-*, system-*, cron-* → true", () => {
    expect(isSystemAccount("seed-2025@responsable.net")).toBe(true);
    expect(isSystemAccount("cron_daily@example.com")).toBe(true);
    expect(isSystemAccount("system-import@x.com")).toBe(true);
  });

  it("normaliza a lowercase antes de comparar", () => {
    expect(isSystemAccount("SEED@responsable.net")).toBe(true);
  });

  it("email de consultor normal → false", () => {
    expect(isSystemAccount("gwenaelle@responsable.net")).toBe(false);
    expect(isSystemAccount("normal@example.com")).toBe(false);
  });
});

describe("getUserRoles — dev mode", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.AUTHORIZED_EMAILS;
  });

  it("dev@localhost → isAdmin true, isClient false", async () => {
    const r = await getUserRoles("dev@localhost");
    expect(r.isAdmin).toBe(true);
    expect(r.isClient).toBe(false);
    expect(r.clientId).toBeNull();
    expect(r.featureFlags).toEqual({});
  });

  it("admin seed → isAdmin true", async () => {
    const r = await getUserRoles("gwenaelle@responsable.net");
    expect(r.isAdmin).toBe(true);
    expect(r.isClient).toBe(false);
    expect(r.clientId).toBeNull();
  });

  it("email desconocido sin AUTHORIZED_EMAILS → isAdmin false", async () => {
    const r = await getUserRoles("desconocido@example.com");
    expect(r.isAdmin).toBe(false);
    expect(r.isClient).toBe(false);
  });

  it("email desconocido con AUTHORIZED_EMAILS → isAdmin true via fallback", async () => {
    process.env.AUTHORIZED_EMAILS = "fallback@x.com";
    const r = await getUserRoles("fallback@x.com");
    expect(r.isAdmin).toBe(true);
  });
});

describe("recordLogin — dev mode (no-op)", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("resuelve sin error en dev mode", async () => {
    await expect(recordLogin("gwenaelle@responsable.net")).resolves.toBeUndefined();
  });
});
