import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tipos de entidad que se loguean. Mantén esto en sincronía con
 * `audit_log.entity_type`. Se valida en cliente y server, pero la columna
 * acepta string libre para no requerir migración cuando se agrega un tipo
 * nuevo (registrar el nuevo tipo aquí basta).
 */
export type AuditEntityType =
  | "prompts"
  | "users"
  | "catalogs"
  | "catalogs_reorder"
  | "clients"
  | "client_services"
  | "questionnaire_response"
  | "materiality_topic"
  | "client_consultors"
  | "service_stage"
  | "stage_activity"
  | "stage_template"
  | "client_document"
  | "dm_iro_config"
  | "dm_config"
  | "dm_validacion"
  | "dm_nis"
  | "dm_resumen"
  | "dm_benchmark_company"
  | "questionnaire_snapshot"
  | "auto_update_config"
  | "client_engagement";

export type AuditAction = "create" | "update" | "delete" | "restore" | "review";

export type AuditEntry = {
  actorEmail: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Inserta una fila en audit_log. Patrón fail-open: si falla, solo logea —
 * nunca rompe la mutación principal. STARTER_OBS §2 + lib/ai/logging.ts.
 *
 * Solo service role puede escribir aquí (RLS de 0020). El resto del código
 * llama a este helper que usa createAdminClient internamente.
 */
export async function logChange(entry: AuditEntry): Promise<void> {
  if (isDevMode()) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_email: entry.actorEmail,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (e) {
    console.error("[audit-log] failed to log change:", e);
  }
}
