import type Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import { extractJsonObject } from "@/lib/ai/extract-json";

/**
 * Resultado consolidado de procesar TODOS los items de un Anthropic Batch.
 * Para batches con 1 item (uso típico DM), `parsed` contiene el resultado del único item.
 * `error` no-null indica fallo (batch errored, JSON ausente, schema inválido).
 */
export type BatchResultExtraction<T> = {
  parsed: T | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  error: string | null;
};

/**
 * Itera resultados de Anthropic Batch API y extrae el primer JSON válido contra `schema`.
 * Reemplaza el patrón duplicado en dm-benchmark, dm-iros, dm-report (D-162 — sesión 27).
 *
 * El SDK beta no exporta types discriminados para Batch result union — se usa `as any` interno
 * justificado en este helper único en lugar de duplicar en cada route.
 *
 * `contextLog` aparece en console.error si falla parseo (ej. "dm-benchmark batch").
 */
export async function extractBatchResult<T>(
  anthropic: Anthropic,
  batchId: string,
  schema: ZodSchema<T>,
  contextLog: string
): Promise<BatchResultExtraction<T>> {
  const out: BatchResultExtraction<T> = {
    parsed: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    error: null,
  };

  for await (const result of await anthropic.beta.messages.batches.results(batchId)) {
    if (result.result.type === "succeeded") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta — Batch API result union sin discriminated type (centralizado D-162)
      const msg = result.result.message as any;
      out.inputTokens = msg.usage?.input_tokens ?? 0;
      out.outputTokens = msg.usage?.output_tokens ?? 0;
      out.cacheCreationTokens = msg.usage?.cache_creation_input_tokens ?? 0;
      out.cacheReadTokens = msg.usage?.cache_read_input_tokens ?? 0;

      const textOut = (msg.content as Array<{ type: string; text?: string }>)
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");

      const jsonText = extractJsonObject(textOut);
      if (jsonText) {
        try {
          const parsed = schema.safeParse(JSON.parse(jsonText));
          if (parsed.success) {
            out.parsed = parsed.data;
          } else {
            out.error = "Schema IA inválido";
          }
        } catch {
          out.error = "JSON malformado en respuesta IA";
        }
      } else {
        out.error = "Respuesta IA sin JSON";
        console.error(
          `[${contextLog}] stop_reason:`,
          msg.stop_reason,
          "output_tokens:",
          msg.usage?.output_tokens,
          "textOut tail:",
          textOut.slice(-500)
        );
      }
    } else if (result.result.type === "errored") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SDK beta — Batch API errored union sin discriminated type (centralizado D-162)
      out.error = (result.result as any).error?.message ?? "Error en batch";
    }
  }

  return out;
}
