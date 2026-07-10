// ── Precios canónicos de modelos IA ────────────────────────────────────────────
//
// FUENTE ÚNICA DE VERDAD para el costo de IA. Antes cada panel tenía su propia
// tabla de precios y divergían: usage.ts cobraba Haiku a $0.25/$1.25 (precio de
// Haiku 3.5, retirado) y ai-costs cobraba Opus a $15/$75 (precio de Opus 3).
// Los precios reales (platform.claude.com, jul-2026):
//   Haiku 4.5  = $1 / $5     · Sonnet = $3 / $15     · Opus 4.8 = $5 / $25
// cache_read = 0.1× input · cache_write (5 min) = 1.25× input.
// Voyage embeddings ≈ $0.10/M input, sin output.
//
// USD por MILLÓN de tokens.

export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const MODEL_PRICES = {
  haiku:  { input: 1,    output: 5,  cacheRead: 0.10, cacheWrite: 1.25 },
  sonnet: { input: 3,    output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  opus:   { input: 5,    output: 25, cacheRead: 0.50, cacheWrite: 6.25 },
  voyage: { input: 0.10, output: 0,  cacheRead: 0,    cacheWrite: 0    },
} as const satisfies Record<string, ModelPrice>;

/**
 * Precio por modelo a partir de su nombre. Voyage/Haiku/Opus por substring;
 * cualquier otro (Sonnet, Gemini fast-path, etc.) cae al precio de Sonnet.
 */
export function priceForModel(model: string | null | undefined): ModelPrice {
  const m = (model ?? "").toLowerCase();
  if (m.includes("voyage")) return MODEL_PRICES.voyage;
  if (m.includes("haiku")) return MODEL_PRICES.haiku;
  if (m.includes("opus")) return MODEL_PRICES.opus;
  return MODEL_PRICES.sonnet;
}
