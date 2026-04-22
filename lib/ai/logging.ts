import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoleId } from "@/lib/ai/models";

export type AiCallLog = {
  userEmail: string;
  role: RoleId;
  clientId: string | null;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  stopReason?: string | null;
  latencyMs: number;
  error?: string | null;
};

/**
 * Inserta una fila en ai_calls. No lanza — si falla, solo logea.
 * Escribir este log nunca debe romper la respuesta al usuario.
 */
export async function logAiCall(call: AiCallLog): Promise<void> {
  if (isDevMode()) return;
  try {
    const admin = createAdminClient();
    await admin.from("ai_calls").insert({
      user_email: call.userEmail,
      role: call.role,
      client_id: call.clientId,
      model: call.model,
      input_tokens: call.inputTokens ?? null,
      output_tokens: call.outputTokens ?? null,
      cache_creation_tokens: call.cacheCreationTokens ?? null,
      cache_read_tokens: call.cacheReadTokens ?? null,
      stop_reason: call.stopReason ?? null,
      latency_ms: call.latencyMs,
      error: call.error ?? null,
    });
  } catch (e) {
    console.error("[ai/logging] failed to log call:", e);
  }
}
