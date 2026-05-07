/**
 * lib/ai/client.ts
 *
 * Factory del cliente Anthropic con configuración centralizada.
 * - maxRetries: 3 → reintentos automáticos en 503/529 con backoff exponencial.
 * - timeout: 300 000 ms → 5 min (cubre Opus con web_search; Vercel maxDuration ≤ 300).
 * - User-Agent: facilita debug en logs de Anthropic cuando hay incidentes.
 *
 * Uso: `const anthropic = createAnthropicClient();`
 * No instanciar `new Anthropic()` directamente en las rutas.
 */

import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 3,
    timeout: 300_000,
    defaultHeaders: {
      "User-Agent": "ResponSable-App/1.0",
    },
  });
}
