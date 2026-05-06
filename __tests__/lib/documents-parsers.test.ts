import { describe, it, expect } from "vitest";
import { detectFileType, parseToMarkdown, truncateMarkdown } from "@/lib/documents/parsers";

describe("detectFileType", () => {
  it("detecta PDF por mime", () => {
    expect(detectFileType("application/pdf", "x.pdf")).toBe("pdf");
  });

  it("detecta DOCX por mime", () => {
    expect(detectFileType(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "doc.docx"
    )).toBe("docx");
  });

  it("detecta XLSX por extensión cuando mime es genérico", () => {
    expect(detectFileType("application/octet-stream", "data.xlsx")).toBe("xlsx");
  });

  it("detecta PPTX por extensión", () => {
    expect(detectFileType("", "slides.pptx")).toBe("pptx");
  });

  it("detecta TXT por mime", () => {
    expect(detectFileType("text/plain", "notas.txt")).toBe("txt");
  });

  it("detecta MD por mime", () => {
    expect(detectFileType("text/markdown", "readme.md")).toBe("md");
  });

  it("retorna null cuando no es soportado", () => {
    expect(detectFileType("image/png", "foto.png")).toBeNull();
    expect(detectFileType("video/mp4", "movie.mp4")).toBeNull();
  });
});

describe("parseToMarkdown - TXT/MD", () => {
  it("TXT pasa contenido raw", async () => {
    const text = "Hola mundo\nLínea 2";
    const buf = Buffer.from(text, "utf-8");
    expect(await parseToMarkdown(buf, "txt")).toBe(text);
  });

  it("MD pasa contenido raw", async () => {
    const md = "# Título\n\n- item 1\n- item 2";
    const buf = Buffer.from(md, "utf-8");
    expect(await parseToMarkdown(buf, "md")).toBe(md);
  });
});

describe("truncateMarkdown", () => {
  it("no trunca si está bajo el tope (200k chars)", () => {
    const small = "x".repeat(1000);
    expect(truncateMarkdown(small)).toBe(small);
  });

  it("trunca con sufijo si excede tope", () => {
    const big = "x".repeat(250_000);
    const out = truncateMarkdown(big);
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain("contenido truncado");
  });
});
