import { describe, it, expect } from "vitest";
import { computeStatus, StageInputSchema, ActivityInputSchema } from "../../lib/stages";

// computeStatus es pura — `today` inyectado fijo para tests deterministas
// (sin depender de la hora/TZ de corrida).
describe("computeStatus", () => {
  const today = "2026-06-15";
  const yesterday = "2026-06-14";
  const tomorrow = "2026-06-16";

  it("completed si actual_end tiene valor", () => {
    expect(
      computeStatus({ planned_start: today, planned_end: today, actual_start: today, actual_end: today }, today)
    ).toBe("completed");
  });

  it("in_progress si actual_start pero sin actual_end", () => {
    expect(
      computeStatus({ planned_start: yesterday, planned_end: tomorrow, actual_start: today, actual_end: null }, today)
    ).toBe("in_progress");
  });

  it("delayed si planned_end en pasado y sin actual_start", () => {
    expect(
      computeStatus({ planned_start: yesterday, planned_end: yesterday, actual_start: null, actual_end: null }, today)
    ).toBe("delayed");
  });

  it("pending si sin fechas reales y planned_end en futuro", () => {
    expect(
      computeStatus({ planned_start: today, planned_end: tomorrow, actual_start: null, actual_end: null }, today)
    ).toBe("pending");
  });

  it("pending si todas las fechas null", () => {
    expect(
      computeStatus({ planned_start: null, planned_end: null, actual_start: null, actual_end: null }, today)
    ).toBe("pending");
  });

  it("completed tiene precedencia sobre delayed (actual_end presente, planned_end en pasado)", () => {
    expect(
      computeStatus({ planned_start: yesterday, planned_end: yesterday, actual_start: yesterday, actual_end: yesterday }, today)
    ).toBe("completed");
  });

  it("delayed tiene precedencia sobre in_progress (actual_start sin actual_end, planned_end pasado)", () => {
    // Una actividad iniciada pero vencida debe contarse como retrasada: antes
    // quedaba oculta como in_progress, contradiciendo el correo de alertas.
    expect(
      computeStatus({ planned_start: yesterday, planned_end: yesterday, actual_start: yesterday, actual_end: null }, today)
    ).toBe("delayed");
  });

  it("in_progress si actual_start y planned_end NO ha pasado", () => {
    expect(
      computeStatus({ planned_start: yesterday, planned_end: tomorrow, actual_start: yesterday, actual_end: null }, today)
    ).toBe("in_progress");
  });

  it("usa hoy-en-México por default cuando no se pasa `today`", () => {
    // planned_end muy en el pasado → delayed sin importar la TZ de corrida.
    expect(
      computeStatus({ planned_start: "2020-01-01", planned_end: "2020-01-02", actual_start: null, actual_end: null })
    ).toBe("delayed");
  });
});

describe("StageInputSchema", () => {
  it("acepta nombre válido", () => {
    const r = StageInputSchema.safeParse({ name: "Diagnóstico" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = StageInputSchema.safeParse({ name: "  " });
    expect(r.success).toBe(false);
  });

  it("acepta order_index numérico", () => {
    const r = StageInputSchema.safeParse({ name: "Etapa 1", order_index: 0 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.order_index).toBe(0);
  });

  it("rechaza order_index negativo", () => {
    const r = StageInputSchema.safeParse({ name: "Etapa 1", order_index: -1 });
    expect(r.success).toBe(false);
  });
});

describe("ActivityInputSchema", () => {
  it("acepta actividad mínima", () => {
    const r = ActivityInputSchema.safeParse({ name: "Entrevistas" });
    expect(r.success).toBe(true);
  });

  it("acepta fechas válidas YYYY-MM-DD", () => {
    const r = ActivityInputSchema.safeParse({
      name: "Taller",
      planned_start: "2026-05-01",
      planned_end: "2026-05-15",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza fecha en formato incorrecto", () => {
    const r = ActivityInputSchema.safeParse({ name: "Taller", planned_start: "01/05/2026" });
    expect(r.success).toBe(false);
  });

  it("acepta fecha null", () => {
    const r = ActivityInputSchema.safeParse({ name: "Taller", planned_start: null });
    expect(r.success).toBe(true);
  });

  it("rechaza email de asignado inválido", () => {
    const r = ActivityInputSchema.safeParse({ name: "Taller", assignee_email: "no-es-email" });
    expect(r.success).toBe(false);
  });

  it("acepta assignee_email null", () => {
    const r = ActivityInputSchema.safeParse({ name: "Taller", assignee_email: null });
    expect(r.success).toBe(true);
  });

  it("acepta assignee_email válido", () => {
    const r = ActivityInputSchema.safeParse({ name: "Taller", assignee_email: "consul@responsable.net" });
    expect(r.success).toBe(true);
  });
});
