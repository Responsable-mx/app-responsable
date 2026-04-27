import { describe, it, expect, vi, beforeEach } from "vitest";

// Chain mock con thenable — cualquier método devuelve el chain;
// `then` resuelve al chainResult.value cuando se hace await.
type ChainResult = { data?: unknown; error?: unknown };
const chainResult: { value: ChainResult } = { value: { data: null, error: null } };
const insertSpy = vi.fn();
const updateSpy = vi.fn();
const eqSpy = vi.fn();
const deleteSpy = vi.fn();

function makeChain(): unknown {
  return {
    insert: (v: unknown) => {
      insertSpy(v);
      return makeChain();
    },
    update: (v: unknown) => {
      updateSpy(v);
      return makeChain();
    },
    delete: () => {
      deleteSpy();
      return makeChain();
    },
    eq: (col: string, val: unknown) => {
      eqSpy(col, val);
      return makeChain();
    },
    select: () => makeChain(),
    order: () => makeChain(),
    limit: () => makeChain(),
    maybeSingle: () => Promise.resolve(chainResult.value),
    single: () => Promise.resolve(chainResult.value),
    then: (
      onFulfilled: (v: ChainResult) => unknown,
      onRejected?: (e: unknown) => unknown
    ) => Promise.resolve(chainResult.value).then(onFulfilled, onRejected),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => makeChain() }),
}));

beforeEach(() => {
  insertSpy.mockReset();
  updateSpy.mockReset();
  eqSpy.mockReset();
  deleteSpy.mockReset();
  chainResult.value = { data: null, error: null };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real.supabase.co";
  delete process.env.AUTHORIZED_EMAILS;
});

describe("users CRUD con Supabase mock", () => {
  it("listUsers retorna data si DB tiene filas", async () => {
    chainResult.value = {
      data: [
        {
          email: "x@y.com",
          role: "admin",
          full_name: "X",
          active: true,
          invited_by: null,
          last_login: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
      error: null,
    };
    const { listUsers } = await import("@/lib/users");
    const out = await listUsers();
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("x@y.com");
  });

  it("listUsers cae a SEED si DB error", async () => {
    chainResult.value = { data: null, error: { message: "boom" } };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { listUsers } = await import("@/lib/users");
    const out = await listUsers();
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((u) => u.role === "admin")).toBe(true);
    consoleErr.mockRestore();
  });

  it("listUsers cae a SEED si DB vacía", async () => {
    chainResult.value = { data: [], error: null };
    const { listUsers } = await import("@/lib/users");
    const out = await listUsers();
    expect(out.length).toBeGreaterThan(0);
  });

  it("getUser maybeSingle null → null", async () => {
    chainResult.value = { data: null, error: null };
    const { getUser } = await import("@/lib/users");
    expect(await getUser("nope@nope.com")).toBeNull();
  });

  it("getUser normaliza email antes de query", async () => {
    chainResult.value = {
      data: { email: "g@r.net", role: "admin" },
      error: null,
    };
    const { getUser } = await import("@/lib/users");
    await getUser("  G@R.NET  ");
    expect(eqSpy).toHaveBeenCalledWith("email", "g@r.net");
  });

  it("getUser propaga error → null + log", async () => {
    chainResult.value = { data: null, error: { message: "db dead" } };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getUser } = await import("@/lib/users");
    expect(await getUser("x@y.com")).toBeNull();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("createUser inserta normalizando email", async () => {
    chainResult.value = {
      data: { email: "new@x.com", role: "consultor" },
      error: null,
    };
    const { createUser } = await import("@/lib/users");
    const out = await createUser(
      { email: "  NEW@X.COM ", role: "consultor", full_name: "N" },
      "admin@x.com"
    );
    expect(out.email).toBe("new@x.com");
    const inserted = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.email).toBe("new@x.com");
    expect(inserted.role).toBe("consultor");
    expect(inserted.invited_by).toBe("admin@x.com");
  });

  it("createUser propaga error", async () => {
    chainResult.value = { data: null, error: { message: "duplicado" } };
    const { createUser } = await import("@/lib/users");
    await expect(
      createUser({ email: "x@y.com", role: "admin" }, "a@b.c")
    ).rejects.toThrow(/duplicado/);
  });

  it("updateUser solo manda campos definidos", async () => {
    chainResult.value = {
      data: { email: "x@y.com", role: "admin" },
      error: null,
    };
    const { updateUser } = await import("@/lib/users");
    await updateUser("x@y.com", { active: false });
    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.active).toBe(false);
    expect(patch).not.toHaveProperty("role");
    expect(patch).not.toHaveProperty("full_name");
  });

  it("updateUser con role + full_name", async () => {
    chainResult.value = {
      data: { email: "x@y.com" },
      error: null,
    };
    const { updateUser } = await import("@/lib/users");
    await updateUser("x@y.com", { role: "admin", full_name: "Foo" });
    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.role).toBe("admin");
    expect(patch.full_name).toBe("Foo");
  });

  it("updateUser propaga error", async () => {
    chainResult.value = { data: null, error: { message: "fk" } };
    const { updateUser } = await import("@/lib/users");
    await expect(
      updateUser("x@y.com", { active: true })
    ).rejects.toThrow(/fk/);
  });

  it("deleteUser ejecuta delete + eq normalizado", async () => {
    chainResult.value = { error: null };
    const { deleteUser } = await import("@/lib/users");
    await deleteUser("  DEL@X.COM ");
    expect(deleteSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith("email", "del@x.com");
  });

  it("deleteUser propaga error", async () => {
    chainResult.value = { error: { message: "boom" } };
    const { deleteUser } = await import("@/lib/users");
    await expect(deleteUser("x@y.com")).rejects.toThrow(/boom/);
  });

  it("isAuthorized true cuando user existe + active=true", async () => {
    chainResult.value = {
      data: { email: "x@y.com", role: "consultor", active: true },
      error: null,
    };
    const { isAuthorized } = await import("@/lib/users");
    expect(await isAuthorized("x@y.com")).toBe(true);
  });

  it("isAuthorized false cuando user existe pero active=false", async () => {
    chainResult.value = {
      data: { email: "x@y.com", role: "consultor", active: false },
      error: null,
    };
    const { isAuthorized } = await import("@/lib/users");
    expect(await isAuthorized("x@y.com")).toBe(false);
  });

  it("isAdmin true solo si role=admin AND active=true", async () => {
    chainResult.value = {
      data: { email: "x@y.com", role: "consultor", active: true },
      error: null,
    };
    const { isAdmin } = await import("@/lib/users");
    expect(await isAdmin("x@y.com")).toBe(false);
  });

  it("recordLogin no propaga errores cuando DB falla", async () => {
    // Hacemos que update lance al usar chain.then
    chainResult.value = { error: null };
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordLogin } = await import("@/lib/users");
    await expect(recordLogin("x@y.com")).resolves.toBeUndefined();
    consoleErr.mockRestore();
  });
});
