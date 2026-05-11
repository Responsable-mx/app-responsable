import { describe, it, expect } from "vitest";
import { validateAiResponse, hasBlockingWarnings } from "@/lib/ai/response-validator";

describe("validateAiResponse", () => {
  it("texto vacío → error", () => {
    const w = validateAiResponse("");
    expect(w[0]?.severity).toBe("error");
    expect(w[0]?.code).toBe("empty");
  });

  it("texto muy corto → warn", () => {
    const w = validateAiResponse("ok");
    expect(w.some((x) => x.code === "too_short")).toBe(true);
  });

  it("código catálogo expuesto → warn (lowercase)", () => {
    const w = validateAiResponse(
      "La empresa cumple con doble_materialidad según el estándar gri_standards aplicable."
    );
    expect(w.some((x) => x.code === "catalog_code_leak")).toBe(true);
  });

  it("siglas legítimas en mayúsculas NO disparan warn", () => {
    const w = validateAiResponse(
      "La empresa publica reportes conforme a GRI, SASB y TCFD. Ha obtenido el distintivo ESR."
    );
    expect(w.some((x) => x.code === "catalog_code_leak")).toBe(false);
  });

  it("disclaimer genérico → info", () => {
    const w = validateAiResponse(
      "La empresa tiene 1000 empleados. Esta información está sujeta a verificación."
    );
    expect(w.some((x) => x.code === "generic_disclaimer" && x.severity === "info")).toBe(true);
  });

  it("jerga inglesa → warn", () => {
    const w = validateAiResponse(
      "Sobre el reporte de emisiones: please note that the data is partial."
    );
    expect(w.some((x) => x.code === "english_leak")).toBe(true);
  });

  it("URL válida no dispara warn", () => {
    const w = validateAiResponse(
      "Consulta el reporte en https://www.empresa.com/sustentabilidad-2024.pdf para más detalle."
    );
    expect(w.some((x) => x.code === "malformed_url")).toBe(false);
  });

  it("texto correcto → sin warnings", () => {
    const w = validateAiResponse(
      "Grupo Bimbo tiene 134,000 empleados en 33 países. Publica reporte GRI Standards desde 2014."
    );
    expect(w).toEqual([]);
  });
});

describe("hasBlockingWarnings", () => {
  it("warn cuenta como blocking", () => {
    expect(hasBlockingWarnings([{ code: "x", severity: "warn", message: "" }])).toBe(true);
  });

  it("info no cuenta como blocking", () => {
    expect(hasBlockingWarnings([{ code: "x", severity: "info", message: "" }])).toBe(false);
  });

  it("vacío no es blocking", () => {
    expect(hasBlockingWarnings([])).toBe(false);
  });
});
