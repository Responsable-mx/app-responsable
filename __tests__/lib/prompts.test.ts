import { describe, it, expect, beforeEach } from "vitest";
import {
  getPrompt,
  getPromptDetail,
  listPromptsMeta,
  listPromptVersions,
  upsertPrompt,
  deletePromptOverride,
  restorePromptVersion,
  labelPromptVersion,
  DEFAULT_PROMPTS,
  PROMPT_KEYS,
  PROMPT_LABELS,
  buildRoleSystemText,
} from "@/lib/ai/prompts";

describe("dev mode — fallback a DEFAULT_PROMPTS", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("getPrompt devuelve el default del código", async () => {
    const p = await getPrompt("role.aurora");
    expect(p).toBe(DEFAULT_PROMPTS["role.aurora"]);
  });

  it("getPromptDetail has_override=false en dev mode", async () => {
    const d = await getPromptDetail("role.elena");
    expect(d.has_override).toBe(false);
    expect(d.content).toBe(DEFAULT_PROMPTS["role.elena"]);
  });

  it("listPromptsMeta devuelve las 6 keys sin override", async () => {
    const metas = await listPromptsMeta();
    expect(metas).toHaveLength(6);
    expect(metas.every((m) => !m.has_override)).toBe(true);
  });

  it("listPromptVersions devuelve [] en dev mode", async () => {
    const v = await listPromptVersions("role.aurora");
    expect(v).toEqual([]);
  });

  it("upsertPrompt falla en dev mode", async () => {
    await expect(
      upsertPrompt("role.aurora", "nuevo contenido", "admin@x.com")
    ).rejects.toThrow(/dev mode/);
  });

  it("deletePromptOverride falla en dev mode", async () => {
    await expect(deletePromptOverride("role.aurora")).rejects.toThrow(
      /dev mode/
    );
  });

  it("restorePromptVersion falla en dev mode", async () => {
    await expect(
      restorePromptVersion("role.aurora", "some-id", "admin@x.com")
    ).rejects.toThrow(/dev mode/);
  });

  it("labelPromptVersion falla en dev mode", async () => {
    await expect(labelPromptVersion("some-id", "v1")).rejects.toThrow(
      /dev mode/
    );
  });
});

describe("buildRoleSystemText compone 3 piezas", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it("aurora incluye rol + navegación + reglas", async () => {
    const text = await buildRoleSystemText("aurora");
    expect(text).toContain("Aurora");
    expect(text).toContain("<app_navigation>");
    expect(text).toContain("<rules>");
  });

  it("los 4 roles devuelven texto consistente", async () => {
    for (const r of ["aurora", "rebeca", "elena", "valeria"] as const) {
      const text = await buildRoleSystemText(r);
      expect(text.length).toBeGreaterThan(1000);
    }
  });
});

describe("PROMPT_KEYS y PROMPT_LABELS", () => {
  it("hay 6 keys canónicas", () => {
    expect(PROMPT_KEYS).toHaveLength(6);
  });

  it("cada key tiene label", () => {
    for (const k of PROMPT_KEYS) {
      expect(PROMPT_LABELS[k]).toBeTruthy();
    }
  });
});
