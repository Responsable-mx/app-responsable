import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Auditoría · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

// Colores semánticos por acción
const ACTION_BADGE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800",
  update: "bg-amber-100 text-amber-800",
  delete: "bg-rose-100 text-rose-800",
  restore: "bg-brand-primary-light text-brand-primary-dark",
};

const ACTION_LABEL: Record<string, string> = {
  create: "CREAR",
  update: "EDITAR",
  delete: "BORRAR",
  restore: "RESTAURAR",
};

const ENTITY_LABEL: Record<string, string> = {
  clients: "Cliente",
  users: "Usuario",
  prompts: "Prompt",
  catalogs: "Catálogo",
  catalogs_reorder: "Catálogo (orden)",
  client_services: "Servicio",
  questionnaire_response: "Cuestionario",
  materiality_topic: "Tema materialidad",
  client_consultors: "Equipo",
  service_stage: "Etapa",
  stage_activity: "Actividad",
  stage_template: "Plantilla",
  client_document: "Documento",
  // Módulo Doble Materialidad
  dm_benchmark_company: "Empresa benchmark",
  dm_config: "Config. DM",
  questionnaire_snapshot: "Snapshot cuestionario",
  client_engagement: "Participación cliente",
  auto_update_config: "Config. actualización automática",
};

type AuditRow = {
  id: string;
  actor_email: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

async function getAuditLog(limit = 200): Promise<AuditRow[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("id, actor_email, entity_type, entity_id, action, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[auditoria] query failed:", error.message);
    return [];
  }
  return (data ?? []) as AuditRow[];
}

async function buildClientNameMap(rows: AuditRow[]): Promise<Map<string, string>> {
  const clientIds = new Set<string>();
  for (const row of rows) {
    const obj = (row.after ?? row.before ?? {}) as Record<string, unknown>;
    if (typeof obj.client_id === "string") clientIds.add(obj.client_id);
  }
  if (clientIds.size === 0) return new Map();
  const sb = createAdminClient();
  const { data } = await sb
    .from("clients")
    .select("id, name")
    .in("id", [...clientIds]);
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

/** Extrae nombre/label del after o before para mostrar en la tabla */
function entityLabel(row: AuditRow, clientNames: Map<string, string>): string {
  const obj = (row.after ?? row.before ?? {}) as Record<string, unknown>;
  if (typeof obj.client_id === "string") {
    const clientName = clientNames.get(obj.client_id);
    if (clientName) return clientName;
  }
  const name = obj.name ?? obj.key ?? obj.email ?? obj.label ?? null;
  if (typeof name === "string" && name.length > 0) return name;
  return row.entity_id ? row.entity_id.slice(0, 8) + "…" : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditoriaPage() {
  const rows = await getAuditLog(200);
  const clientNames = await buildClientNameMap(rows);

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
          Registro de auditoría
        </p>
        <p className="text-xs text-slate-600">
          Últimas 200 mutaciones admin — quién hizo qué y cuándo.
          Los before/after solo son visibles aquí (nunca en el LLM).
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded p-10 text-center text-sm text-slate-500">
          Sin registros. Las mutaciones admin aparecen aquí en tiempo real.
        </div>
      ) : (
        <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full w-max text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Fecha
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Actor
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Acción
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Entidad
                  </th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Elemento
                  </th>
                  <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-4 py-2.5 whitespace-nowrap">
                    Cambio
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const afterKeys = Object.keys(row.after ?? {});
                  const changedKeys = row.before
                    ? afterKeys.filter((k) => {
                        const b = (row.before as Record<string, unknown>)[k];
                        const a = (row.after as Record<string, unknown>)?.[k];
                        return JSON.stringify(b) !== JSON.stringify(a);
                      })
                    : afterKeys;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-800 whitespace-nowrap">
                        {row.actor_email}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`text-[10px] font-bold uppercase rounded-sm px-1.5 py-0.5 ${
                            ACTION_BADGE[row.action] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {ACTION_LABEL[row.action] ?? row.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                        {ENTITY_LABEL[row.entity_type] ?? row.entity_type}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-800 max-w-[200px] truncate">
                        {entityLabel(row, clientNames)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {changedKeys.length > 0 ? (
                          <details className="text-right">
                            <summary className="text-[11px] text-brand-primary-dark hover:underline cursor-pointer select-none whitespace-nowrap">
                              {changedKeys.length} campo{changedKeys.length !== 1 ? "s" : ""}
                            </summary>
                            <div className="mt-1 text-left bg-slate-50 border border-slate-200 rounded p-2 text-[11px] font-mono text-slate-700 max-w-[340px]">
                              {changedKeys.map((k) => {
                                const before = row.before ? (row.before as Record<string, unknown>)[k] : undefined;
                                const after = (row.after as Record<string, unknown>)?.[k];
                                return (
                                  <div key={k} className="mb-1 last:mb-0">
                                    <span className="font-bold text-slate-900">{k}:</span>{" "}
                                    {row.before !== null && (
                                      <span className="text-rose-700 line-through mr-1">
                                        {JSON.stringify(before) ?? "—"}
                                      </span>
                                    )}
                                    <span className="text-emerald-700">
                                      {JSON.stringify(after) ?? "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 px-4 py-2 bg-slate-50 text-[11px] text-slate-500 text-right">
            Mostrando las últimas {rows.length} entradas · solo admins activos pueden ver este registro
          </div>
        </div>
      )}
    </div>
  );
}
