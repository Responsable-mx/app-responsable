import { describe, it, expect, beforeEach } from "vitest";
import {
  listUsers,
  getUser,
  isAuthorized,
  isAdmin,
  createUser,
  updateUser,
  deleteUser,
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
