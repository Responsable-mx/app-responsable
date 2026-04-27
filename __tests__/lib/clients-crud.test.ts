import { describe, it, expect, vi, beforeEach } from "vitest";

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
});

describe("clients CRUD con Supabase mock", () => {
  it("listClients devuelve data", async () => {
    chainResult.value = {
      data: [{ id: "1", name: "Cliente X" }],
      error: null,
    };
    const { listClients } = await import("@/lib/clients");
    const out = await listClients();
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Cliente X");
  });

  it("listClients propaga error", async () => {
    chainResult.value = { data: null, error: { message: "boom" } };
    const { listClients } = await import("@/lib/clients");
    await expect(listClients()).rejects.toThrow(/boom/);
  });

  it("getClient con id existente", async () => {
    chainResult.value = { data: { id: "1", name: "X" }, error: null };
    const { getClient } = await import("@/lib/clients");
    const out = await getClient("1");
    expect(out?.id).toBe("1");
  });

  it("getClient con id inexistente devuelve null", async () => {
    chainResult.value = { data: null, error: null };
    const { getClient } = await import("@/lib/clients");
    expect(await getClient("nope")).toBeNull();
  });

  it("getClient propaga error", async () => {
    chainResult.value = { data: null, error: { message: "db" } };
    const { getClient } = await import("@/lib/clients");
    await expect(getClient("1")).rejects.toThrow(/db/);
  });

  it("createClientRow inyecta created_by + updated_by", async () => {
    chainResult.value = {
      data: { id: "1", name: "Nuevo" },
      error: null,
    };
    const { createClientRow } = await import("@/lib/clients");
    await createClientRow({ name: "Nuevo" }, "user@x.com");
    const inserted = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.created_by).toBe("user@x.com");
    expect(inserted.updated_by).toBe("user@x.com");
    expect(inserted.name).toBe("Nuevo");
  });

  it("createClientRow propaga error", async () => {
    chainResult.value = { data: null, error: { message: "duplicado" } };
    const { createClientRow } = await import("@/lib/clients");
    await expect(
      createClientRow({ name: "X" }, "u@x.com")
    ).rejects.toThrow(/duplicado/);
  });

  it("updateClientRow sobreescribe updated_by + updated_at", async () => {
    chainResult.value = {
      data: { id: "1", name: "X" },
      error: null,
    };
    const { updateClientRow } = await import("@/lib/clients");
    await updateClientRow("1", { sector: "bebidas" }, "editor@x.com");
    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.updated_by).toBe("editor@x.com");
    expect(patch.updated_at).toBeTruthy();
    expect(patch.sector).toBe("bebidas");
  });

  it("deleteClientRow ejecuta DELETE + eq id", async () => {
    chainResult.value = { error: null };
    const { deleteClientRow } = await import("@/lib/clients");
    await deleteClientRow("abc");
    expect(deleteSpy).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith("id", "abc");
  });

  it("deleteClientRow propaga error", async () => {
    chainResult.value = { error: { message: "fk_violation" } };
    const { deleteClientRow } = await import("@/lib/clients");
    await expect(deleteClientRow("abc")).rejects.toThrow(/fk_violation/);
  });
});

describe("clientContextCompleteness (sin DB)", () => {
  it("0 atributos = filled 0", async () => {
    const { clientContextCompleteness } = await import("@/lib/clients");
    const out = clientContextCompleteness({
      business_segments: null,
      frameworks: null,
      applicable_regulations: null,
      policies_in_place: null,
      certifications: null,
      material_topics: null,
      maturity_level: null,
      has_double_materiality: null,
      info_general_json: null,
      business_model_json: null,
      impacts_json: null,
      regulatory_context_json: null,
      sustainability_strategy_json: null,
      stakeholders_json: null,
    });
    expect(out.filled).toBe(0);
    expect(out.total).toBeGreaterThan(0);
  });

  it("8 atributos llenos cuentan", async () => {
    const { clientContextCompleteness } = await import("@/lib/clients");
    const out = clientContextCompleteness({
      business_segments: ["b2b"],
      frameworks: ["gri"],
      applicable_regulations: ["nis_mx"],
      policies_in_place: ["etica"],
      certifications: ["esr_cemefi"],
      material_topics: ["agua"],
      maturity_level: "avanzado",
      has_double_materiality: true,
      info_general_json: null,
      business_model_json: null,
      impacts_json: null,
      regulatory_context_json: null,
      sustainability_strategy_json: null,
      stakeholders_json: null,
    });
    expect(out.filled).toBe(8);
  });
});
