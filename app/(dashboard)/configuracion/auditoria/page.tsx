import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuditoriaTable } from "@/components/config/AuditoriaTable";

export const metadata: Metadata = { title: "Auditoría · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

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
        <AuditoriaTable
          rows={rows}
          clientNames={[...clientNames.entries()]}
        />
      )}
    </div>
  );
}
