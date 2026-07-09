// ── Clasificación canónica de cuadrante de doble materialidad ──────────────────
//
// FUENTE ÚNICA DE VERDAD para "¿este tema es material?". Antes había dos reglas
// divergentes: DoubleMaterialidadTab clasificaba con `score >= 2` (conteos KPI)
// mientras MatrizDM usaba eje `>= 5` (equivalente a `score >= 3`). El mismo IRO
// (impacto=2, financiero=2) salía "doble material" en las tarjetas de resumen y
// "en seguimiento" en la gráfica — un entregable que se contradecía a sí mismo.
//
// Umbral canónico: midpoint de la escala 1-5 → score >= 3 = material. En ejes
// 0-10 (patrón BCG/McKinsey, midpoint 5) equivale a axis >= 5. Es el estándar de
// matrices de doble materialidad: material = mitad alta de la escala.

export type Quadrant = "doble_material" | "solo_impacto" | "solo_financiero" | "en_seguimiento";

/** Umbral de materialidad en el eje 0-10. Midpoint de la matriz. */
export const MATERIAL_AXIS_THRESHOLD = 5;

/** Score 1-5 → coord eje 0-10. score null → midpoint 5. (1→0, 2→2.5, 3→5, 4→7.5, 5→10) */
export function scoreToAxis(score: number | null | undefined): number {
  if (score == null) return 5;
  return ((score - 1) / 4) * 10;
}

/** Clasifica un cuadrante desde coordenadas de eje 0-10. x = financiero, y = impacto. */
export function classifyQuadrant(x: number, y: number): Quadrant {
  const xMat = x >= MATERIAL_AXIS_THRESHOLD;
  const yMat = y >= MATERIAL_AXIS_THRESHOLD;
  if (xMat && yMat) return "doble_material";
  if (!xMat && yMat) return "solo_impacto";
  if (xMat && !yMat) return "solo_financiero";
  return "en_seguimiento";
}

/**
 * Clasifica un IRO directamente desde sus scores 1-5 (sin override manual).
 * Úsalo para conteos/KPIs. La matriz visual además respeta pos_x/pos_y cuando
 * el consultor movió el punto manualmente (ver resolveIroAxes).
 */
export function classifyIroByScore(
  scoreImpacto: number | null | undefined,
  scoreFinanciero: number | null | undefined,
): Quadrant {
  return classifyQuadrant(scoreToAxis(scoreFinanciero), scoreToAxis(scoreImpacto));
}

/**
 * Coordenadas de eje 0-10 de un IRO respetando override manual del consultor.
 * Si pos_override, usa pos_x/pos_y; si no, deriva del score. x = financiero,
 * y = impacto — misma convención que classifyQuadrant.
 */
export function resolveIroAxes(iro: {
  score_impacto: number | null;
  score_financiero: number | null;
  pos_x: number | null;
  pos_y: number | null;
  pos_override: boolean;
}): { x: number; y: number } {
  if (iro.pos_override && iro.pos_x != null && iro.pos_y != null) {
    return { x: iro.pos_x, y: iro.pos_y };
  }
  return { x: scoreToAxis(iro.score_financiero), y: scoreToAxis(iro.score_impacto) };
}
