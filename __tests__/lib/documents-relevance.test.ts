import { describe, it, expect } from "vitest";
import { chunkMarkdown, scoreChunk, selectTopChunks } from "@/lib/documents/relevance";

describe("chunkMarkdown", () => {
  it("texto corto pasa intacto", () => {
    const out = chunkMarkdown("Hola mundo");
    expect(out).toEqual(["Hola mundo"]);
  });

  it("texto vacío → array vacío", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  it("divide por párrafos respetando chunkSize", () => {
    const text = "P1 corto.\n\n" + "x".repeat(1500) + "\n\nP3 corto.";
    const chunks = chunkMarkdown(text, { chunkSize: 1000, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("párrafo único largo se parte por oraciones", () => {
    const text = ("Oración uno. Oración dos. Oración tres. ".repeat(50)).trim();
    const chunks = chunkMarkdown(text, { chunkSize: 200, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(220));
  });
});

describe("scoreChunk", () => {
  it("chunk irrelevante → score 0", () => {
    const score = scoreChunk("texto cualquiera sin relación", new Set(["emisiones", "carbono"]));
    expect(score).toBe(0);
  });

  it("chunk con matches → score > 0", () => {
    const score = scoreChunk(
      "La empresa reporta emisiones de carbono según GRI estándar",
      new Set(["emisiones", "carbono", "gri"])
    );
    expect(score).toBeGreaterThan(0);
  });

  it("normaliza accents", () => {
    const score = scoreChunk(
      "información sobre energía renovable",
      new Set(["energia", "renovable"])
    );
    expect(score).toBeGreaterThan(0);
  });
});

describe("selectTopChunks", () => {
  it("devuelve top chunks ordenados por orden documento original", () => {
    const chunks = [
      "Capítulo 1: nada relevante aquí.",
      "Capítulo 2: emisiones de carbono según GRI.",
      "Capítulo 3: emisiones más detalle carbono GRI estándar.",
      "Capítulo 4: tema diferente sin relación.",
    ];
    const selected = selectTopChunks(chunks, "emisiones carbono GRI", { maxChars: 200 });
    // Top relevantes son índices 1 y 2; deben aparecer en orden de doc
    expect(selected.length).toBeGreaterThan(0);
    const indices = selected.map((s) => s.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("respeta maxChars", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => `Chunk ${i}: emisiones gri carbono ${"x".repeat(50)}`);
    const selected = selectTopChunks(chunks, "emisiones gri carbono", { maxChars: 100 });
    const totalChars = selected.reduce((s, c) => s + c.chunk.length, 0);
    expect(totalChars).toBeLessThanOrEqual(100);
  });

  it("query vacío → primeros chunks hasta maxChars", () => {
    const chunks = ["a".repeat(50), "b".repeat(50), "c".repeat(50)];
    const selected = selectTopChunks(chunks, "", { maxChars: 110 });
    expect(selected.length).toBe(2);
    expect(selected[0]?.index).toBe(0);
  });
});
