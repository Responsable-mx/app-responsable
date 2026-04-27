import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock isDevMode antes de importar el módulo bajo prueba.
const mocks = vi.hoisted(() => ({
  isDevMode: vi.fn(() => false),
  insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
  from: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  isDevMode: mocks.isDevMode,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

beforeEach(() => {
  mocks.isDevMode.mockReset().mockReturnValue(false);
  mocks.insert.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.from.mockReset().mockImplementation(() => ({ insert: mocks.insert }));
});

describe("logChange", () => {
  it("dev mode → no escribe DB", async () => {
    mocks.isDevMode.mockReturnValue(true);
    const { logChange } = await import("@/lib/audit-log");
    await logChange({
      actorEmail: "g@r.net",
      entityType: "prompts",
      entityId: "role.aurora",
      action: "update",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("inserta fila con campos básicos en prod", async () => {
    const { logChange } = await import("@/lib/audit-log");
    await logChange({
      actorEmail: "g@r.net",
      entityType: "users",
      entityId: "x@y.com",
      action: "delete",
      before: { role: "consultor" },
    });
    expect(mocks.from).toHaveBeenCalledWith("audit_log");
    expect(mocks.insert).toHaveBeenCalledWith({
      actor_email: "g@r.net",
      entity_type: "users",
      entity_id: "x@y.com",
      action: "delete",
      before: { role: "consultor" },
      after: null,
      metadata: null,
    });
  });

  it("DB error no propaga (fail-open) — solo logea", async () => {
    mocks.insert.mockRejectedValueOnce(new Error("supabase down"));
    const consoleErrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logChange } = await import("@/lib/audit-log");
    await expect(
      logChange({
        actorEmail: "g@r.net",
        entityType: "catalogs",
        action: "create",
      })
    ).resolves.toBeUndefined();
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });
});
