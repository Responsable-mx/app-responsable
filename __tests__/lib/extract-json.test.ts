import { describe, it, expect } from "vitest";
import { extractJsonObject } from "@/lib/ai/extract-json";

describe("extractJsonObject", () => {
  it("extrae JSON simple de texto plano", () => {
    const result = extractJsonObject('{"key": "value"}');
    expect(result).toBe('{"key": "value"}');
  });

  it("extrae JSON de text con contenido antes y después", () => {
    const result = extractJsonObject('Aquí va la respuesta: {"score": 8} fin.');
    expect(result).toBe('{"score": 8}');
  });

  it("extrae JSON de code block json", () => {
    const result = extractJsonObject('```json\n{"a": 1}\n```');
    expect(result).toBe('{"a": 1}');
  });

  it("extrae JSON de code block sin lenguaje", () => {
    const result = extractJsonObject('```\n{"b": 2}\n```');
    expect(result).toBe('{"b": 2}');
  });

  it("maneja JSON anidado correctamente (balanced-brace)", () => {
    const result = extractJsonObject('{"outer": {"inner": true}, "x": 1}');
    expect(result).toBe('{"outer": {"inner": true}, "x": 1}');
  });

  it("maneja strings con llaves dentro", () => {
    const result = extractJsonObject('{"text": "valor con } llave", "ok": true}');
    expect(result).toBe('{"text": "valor con } llave", "ok": true}');
  });

  it("maneja escape de comillas en string", () => {
    const result = extractJsonObject('{"quote": "say \\"hi\\""}');
    expect(result).toBe('{"quote": "say \\"hi\\""}');
  });

  it("devuelve null si no hay JSON", () => {
    expect(extractJsonObject("sin json aquí")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject("[1, 2, 3]")).toBeNull();
  });

  it("devuelve null si JSON no está balanceado", () => {
    expect(extractJsonObject('{"sin": "cerrar')).toBeNull();
  });

  it("extrae solo el primer objeto cuando hay varios", () => {
    const result = extractJsonObject('{"first": 1} y luego {"second": 2}');
    expect(result).toBe('{"first": 1}');
  });
});
