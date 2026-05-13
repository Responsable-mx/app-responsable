import type { Metadata } from "next";
import { getUsageSummary } from "@/lib/ai/usage";
import { Sparkline } from "@/components/Sparkline";
import { createAdminClient } from "@/lib/supabase/admin";

type DocStats = {
  total: number;
  by_kind: { general: number; sustainability_report: number; financial_report: number };
  by_parse_status: { ok: number; pending: number; failed: number };
  total_bytes: number;
  recent_count: number; // últimos 7d
};

async function getDocumentsStats(): Promise<DocStats | null> {
  try {
    const sb = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from("client_documents")
      .select("kind, parse_status, size_bytes, created_at");
    if (error) {
      console.error("[uso-ia] documents stats:", error.message);
      return null;
    }
    const rows = data ?? [];
    return {
      total: rows.length,
      by_kind: {
        general: rows.filter((r) => r.kind === "general").length,
        sustainability_report: rows.filter((r) => r.kind === "sustainability_report").length,
        financial_report: rows.filter((r) => r.kind === "financial_report").length,
      },
      by_parse_status: {
        ok: rows.filter((r) => r.parse_status === "ok").length,
        pending: rows.filter((r) => r.parse_status === "pending").length,
        failed: rows.filter((r) => r.parse_status === "failed").length,
      },
      total_bytes: rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
      recent_count: rows.filter((r) => r.created_at >= since).length,
    };
  } catch {
    return null;
  }
}

export const metadata: Metadata = { title: "Uso IA · Configuración · App ResponSable" };
export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "symbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ── Umbrales de alerta de gasto IA ─────────────────────────
// Configurables vía env vars en Vercel. Defaults para 8 consultores piloto.
const COST_ALERT_THRESHOLD_USD = Number(process.env.IA_COST_ALERT_USD ?? 150);
const OPUS_DOMINANCE_THRESHOLD_PCT = Number(process.env.IA_OPUS_DOMINANCE_PCT ?? 60);

type CostAlert = {
  tone: "warn" | "danger";
  title: string;
  detail: string;
};

function computeCostAlerts(s: { cost_usd_estimate_max: number; by_model: Array<{ family: string; cost_usd: number }> }): CostAlert[] {
  const alerts: CostAlert[] = [];
  // Alerta 1: gasto total supera umbral
  if (s.cost_usd_estimate_max > COST_ALERT_THRESHOLD_USD) {
    alerts.push({
      tone: "danger",
      title: `Gasto IA supera $${COST_ALERT_THRESHOLD_USD} USD/mes`,
      detail: `Gasto actual: $${s.cost_usd_estimate_max.toFixed(2)} (últimos 30 días). Revisa la tabla "Gasto por modelo" para ver qué modelo domina y migrar tareas rutinarias a Haiku.`,
    });
  }
  // Alerta 2: Opus domina el gasto
  const opus = s.by_model.find((m) => m.family === "opus");
  if (opus && s.cost_usd_estimate_max > 0) {
    const pct = (opus.cost_usd / s.cost_usd_estimate_max) * 100;
    if (pct >= OPUS_DOMINANCE_THRESHOLD_PCT) {
      alerts.push({
        tone: "warn",
        title: `Opus consume ${Math.round(pct)}% del gasto IA`,
        detail: `Opus es el modelo más caro ($5/$25 por 1M tokens). Solo Elena (insights estratégicos) y reportes finales lo justifican. Si otras tareas lo usan, considera migrar a Sonnet o Haiku.`,
      });
    }
  }
  return alerts;
}

export default async function UsoIaPage() {
  const [s, docs] = await Promise.all([
    getUsageSummary(30).catch(() => null),
    getDocumentsStats(),
  ]);
  const alerts = s ? computeCostAlerts(s) : [];

  // Errores LLM solamente (excluye cron de embeddings/Voyage)
  const llmErrors = s
    ? s.by_role.filter(r => r.role !== "embeddings").reduce((sum, r) => sum + r.errors, 0)
    : 0;
  const voyageSystemErrors = s ? Math.max(0, s.total_errors - llmErrors) : 0;

  // Desglose de llamadas: equipo vs. cron de indexación
  const voyageCalls = s ? (s.by_role.find(r => r.role === "embeddings")?.calls ?? 0) : 0;
  const llmCalls = s ? s.total_calls - voyageCalls : 0;

  // Top consultores sin entradas del sistema (cron@, service_role)
  const realTopUsers = s
    ? s.top_users.filter(u =>
        !u.user_email.toLowerCase().startsWith("cron") &&
        !u.user_email.includes("service_role") &&
        !u.user_email.includes("@system")
      )
    : [];

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              role="alert"
              className={`border-l-4 rounded-r p-3 ${
                a.tone === "danger"
                  ? "border-l-rose-500 bg-rose-50 text-rose-900"
                  : "border-l-amber-500 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="text-sm font-bold flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5l7 13H1l7-13zM8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
                {a.title}
              </p>
              <p className="text-xs mt-1 leading-relaxed">{a.detail}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-600 mb-4 inline-flex flex-wrap items-center gap-1.5">
        Uso de los 4 roles IA en los últimos 30 días.
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold cursor-help"
          title="Costo real por modelo (Haiku $0.25/$1.25, Sonnet $3/$15, Opus $5/$25, Voyage $0.10/$0 por 1M tokens). Cache hits reducen ~90% el costo de input. Ver desglose por modelo abajo."
          aria-label="Más información sobre el cálculo de costo"
        >
          ⓘ
        </span>
        <span className="text-slate-300 select-none">·</span>
        <a href="/configuracion/auditoria-ia" className="text-brand-primary text-xs font-medium hover:underline underline-offset-2">
          Para decisiones accionables → Auditoría IA
        </a>
      </p>

      {!s ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          Error al cargar. Revisa logs del servidor.
        </div>
      ) : (
        <>
          {(() => {
            // Bucketear by_day_role en serie diaria total para sparkline.
            // Trend visual >= 1 valor numérico aislado.
            const byDay = new Map<string, { calls: number; cost: number; cache: number; errors: number }>();
            for (const r of s.by_day_role) {
              const k = r.day.slice(0, 10);
              const acc = byDay.get(k) ?? { calls: 0, cost: 0, cache: 0, errors: 0 };
              acc.calls += r.calls;
              acc.cache += r.total_cache_hits;
              acc.errors += r.errors;
              // Estimación simple por día (input + output Sonnet).
              acc.cost += (r.total_input_tokens * 3 + r.total_output_tokens * 15) / 1_000_000;
              byDay.set(k, acc);
            }
            const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            const callsSeries = sortedDays.map(([, v]) => v.calls);
            const costSeries = sortedDays.map(([, v]) => v.cost);
            const cacheSeries = sortedDays.map(([, v]) => v.cache);
            const errorsSeries = sortedDays.map(([, v]) => v.errors);
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Metric
                  label="Llamadas"
                  value={numFmt.format(s.total_calls)}
                  hint={llmCalls > 0 && voyageCalls > 0
                    ? `${numFmt.format(llmCalls)} del equipo · ${numFmt.format(voyageCalls)} indexación`
                    : s.avg_latency_ms > 0 ? `Latencia promedio: ${(s.avg_latency_ms / 1000).toFixed(1)} s` : undefined}
                  spark={callsSeries}
                  sparkColor="#0f766e"
                />
                <Metric
                  label="Costo estimado"
                  value={usdFmt.format(s.cost_usd_estimate_max)}
                  spark={costSeries}
                  sparkColor="#7c3aed"
                />
                <Metric
                  label="Hits de caché"
                  value={
                    s.total_input_tokens > 0
                      ? `${Math.round(
                          (s.total_cache_read_tokens /
                            (s.total_input_tokens + s.total_cache_read_tokens)) *
                            100
                        )}%`
                      : "—"
                  }
                  hint={`${numFmt.format(s.total_cache_read_tokens)} tokens ahorrados`}
                  spark={cacheSeries}
                  sparkColor="#0891b2"
                />
                <Metric
                  label="Errores IA"
                  value={String(llmErrors)}
                  tone={llmErrors > 0 ? "red" : "ok"}
                  hint={voyageSystemErrors > 0
                    ? `+${voyageSystemErrors} del sistema (indexación nocturna)`
                    : llmErrors === 0 ? "Sin errores en el período" : undefined}
                  spark={errorsSeries}
                  sparkColor={llmErrors > 0 ? "#be123c" : "#94a3b8"}
                />
              </div>
            );
          })()}

          {s.by_model.length > 0 && (
            <div className="mb-6">
              <Panel title="Gasto por modelo (últimos 30 días)">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Modelo</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                      <th className="pb-1.5 text-right cursor-help" title="Tokens de entrada = texto enviado a la IA. 1 página de Word ≈ 700 tokens.">T. entrada ⓘ</th>
                      <th className="pb-1.5 text-right cursor-help" title="Tokens de salida = respuesta generada por la IA.">T. salida ⓘ</th>
                      <th className="pb-1.5 text-right">Costo USD</th>
                      <th className="pb-1.5 text-right">% costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.by_model.map((m) => {
                      const pct = s.cost_usd_estimate_max > 0
                        ? Math.round((m.cost_usd / s.cost_usd_estimate_max) * 100)
                        : 0;
                      const label = m.family === "haiku" ? "Haiku (barato)"
                        : m.family === "sonnet" ? "Sonnet (medio)"
                        : m.family === "opus" ? "Opus (caro)"
                        : m.family === "voyage" ? "Voyage (embeddings)"
                        : "Otro";
                      const tone = m.family === "haiku" ? "text-emerald-700"
                        : m.family === "opus" ? "text-rose-700"
                        : m.family === "voyage" ? "text-indigo-700"
                        : "text-slate-700";
                      return (
                        <tr key={m.family}>
                          <td className={`py-1.5 font-semibold ${tone}`}>{label}</td>
                          <td className="py-1.5 text-right text-slate-900 tabular-nums">{numFmt.format(m.calls)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(m.input_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(m.output_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{usdFmt.format(m.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2">
                  Haiku = ~12× más barato que Sonnet. Si Sonnet/Opus dominan llamadas
                  rutinarias (extracción, validación), revisa si pueden migrar a Haiku.
                </p>
              </Panel>
            </div>
          )}

          {s.by_role.length > 0 && (
            <div className="mb-6">
              <Panel title="Uso por rol IA (últimos 30 días)">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Rol</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                      <th className="pb-1.5 text-right cursor-help" title="Tokens de entrada = texto enviado a la IA. 1 página de Word ≈ 700 tokens.">T. entrada ⓘ</th>
                      <th className="pb-1.5 text-right cursor-help" title="Tokens de salida = respuesta generada por la IA.">T. salida ⓘ</th>
                      <th className="pb-1.5 text-right">Costo</th>
                      <th className="pb-1.5 text-right">% costo</th>
                      <th className="pb-1.5 text-right">Latencia</th>
                      <th className="pb-1.5 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* ── Roles conversacionales (Aurora/Rebeca/Elena/Valeria) ── */}
                    {s.by_role.filter(r => r.role !== "embeddings").map((r) => {
                      const pct = s.cost_usd_estimate_max > 0
                        ? Math.round((r.cost_usd / s.cost_usd_estimate_max) * 100)
                        : 0;
                      const ROLE_LABELS: Record<string, { name: string; model: string }> = {
                        aurora:  { name: "Aurora · Autor",      model: "Sonnet" },
                        rebeca:  { name: "Rebeca · Revisor",    model: "Sonnet" },
                        elena:   { name: "Elena · Elevador",    model: "Opus"   },
                        valeria: { name: "Valeria · Validador", model: "Haiku"  },
                      };
                      const meta = ROLE_LABELS[r.role] ?? { name: r.role, model: "—" };
                      return (
                        <tr key={r.role}>
                          <td className="py-1.5 font-semibold text-slate-800">
                            {meta.name}
                            <span className="ml-1.5 text-[10px] font-normal text-slate-500">({meta.model})</span>
                          </td>
                          <td className="py-1.5 text-right text-slate-900 tabular-nums">{numFmt.format(r.calls)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.input_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.output_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{pct}%</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{(r.avg_latency_ms / 1000).toFixed(1)}s</td>
                          <td className={`py-1.5 text-right tabular-nums ${r.errors > 0 ? "text-rose-700" : "text-slate-400"}`}>
                            {r.errors > 0 ? r.errors : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {/* ── Proceso automático (cron de indexación) ── */}
                    {s.by_role.some(r => r.role === "embeddings") && (
                      <tr>
                        <td colSpan={8} className="pt-3 pb-1 px-0">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-t border-slate-100 pt-2">
                            Proceso automático — indexación de documentos (cron nocturno, no es un consultor)
                          </p>
                        </td>
                      </tr>
                    )}
                    {s.by_role.filter(r => r.role === "embeddings").map((r) => {
                      const pct = s.cost_usd_estimate_max > 0
                        ? Math.round((r.cost_usd / s.cost_usd_estimate_max) * 100)
                        : 0;
                      return (
                        <tr key={r.role} className="opacity-60">
                          <td className="py-1.5 font-semibold text-indigo-700">
                            Búsqueda semántica
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">(Voyage · cron)</span>
                          </td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.calls)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.input_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">—</td>
                          <td className="py-1.5 text-right text-slate-600 font-medium tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{pct}%</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">—</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums"
                              title="Errores del cron de indexación — no afectan el chat de consultores">
                            {r.errors > 0
                              ? <span>{r.errors} <span className="text-[10px]">(cron)</span></span>
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  Elena (Opus) debería tener pocas llamadas pero alto costo unitario — es la voz estratégica.
                  Valeria (Haiku) puede tener muchas llamadas con costo bajo — verifica DoD.
                  Aurora y Rebeca dominan volumen normal (cadena Autor → Revisor).
                </p>
              </Panel>
            </div>
          )}

          {s.feedback_by_client.length > 0 && (
            <div className="mb-6">
              <Panel title="Razones de rechazo IA por cliente">
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
                  Top 5 clientes con más rechazos. Útil para identificar si la IA falla más con
                  sectores específicos o clientes problemáticos — y curar prompts dirigidos.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Cliente</th>
                      <th className="pb-1.5 text-right">Total 👎</th>
                      <th className="pb-1.5 text-left pl-4">Top razones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.feedback_by_client.map((c) => {
                      const REASON_LABELS: Record<string, string> = {
                        factually_wrong: "Datos incorrectos",
                        sector_off: "Sector equivocado",
                        bad_format: "Mal formato",
                        language: "Idioma raro",
                        too_generic: "Muy genérico",
                        missed_context: "Ignoró contexto",
                        other: "Otro",
                      };
                      return (
                        <tr key={c.client_id}>
                          <td className="py-1.5 font-medium text-slate-800">
                            {c.client_name ?? (
                              <span className="font-mono text-slate-500 text-[10px]">{c.client_id.slice(0, 8)}…</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-slate-900 font-bold tabular-nums">{c.total}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex flex-wrap gap-1">
                              {c.top_reasons.map((r, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-sm"
                                >
                                  {REASON_LABELS[r.reason_code] ?? r.reason_code} <span className="opacity-60">×{r.count}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}

          {s.feedback_total_down > 0 && (
            <div className="mb-6">
              <Panel title={`Razones de rechazo IA (${s.feedback_total_down} 👎 últimos 30 días)`}>
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
                  Cada rechazo se inyecta al system prompt del rol + cliente correspondiente como ejemplo
                  a evitar. La IA aprende automáticamente de estos rechazos.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Rol</th>
                      <th className="pb-1.5 text-left">Razón</th>
                      <th className="pb-1.5 text-right">Rechazos</th>
                      <th className="pb-1.5 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.feedback_top_reasons.map((r, i) => {
                      const pct = Math.round((r.count / s.feedback_total_down) * 100);
                      const reasonLabel = ({
                        factually_wrong: "Datos incorrectos",
                        sector_off: "Sector equivocado",
                        bad_format: "Mal formato",
                        language: "Idioma raro",
                        too_generic: "Muy genérico",
                        missed_context: "Ignoró contexto",
                        other: "Otro",
                      } as Record<string, string>)[r.reason_code] ?? r.reason_code;
                      const roleLabel = r.role.charAt(0).toUpperCase() + r.role.slice(1);
                      return (
                        <tr key={i}>
                          <td className="py-1.5 font-medium text-slate-800">{roleLabel}</td>
                          <td className="py-1.5 text-slate-700">{reasonLabel}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{r.count}</td>
                          <td className="py-1.5 text-right text-slate-500 tabular-nums">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Panel title="Top consultores">
              {realTopUsers.length === 0 ? (
                <Empty />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Consultor</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {realTopUsers.map((u) => (
                      <tr key={u.user_email}>
                        <td className="py-1.5 font-mono text-slate-700">{u.user_email}</td>
                        <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{u.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Top clientes">
              {s.top_clients.length === 0 ? (
                <Empty />
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Cliente</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.top_clients.map((c) => (
                      <tr key={c.client_id}>
                        <td className="py-1.5 text-slate-700">
                          {c.client_name ?? (
                            <span className="text-slate-400 italic">Cliente eliminado</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{c.calls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <Panel title="Llamadas diarias por rol">
            {s.by_day_role.length === 0 ? (
              <Empty text="Aún sin actividad. Los datos aparecerán cuando los roles reciban mensajes." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-600 text-left uppercase tracking-wide text-[10px]">
                    <tr>
                      <th className="py-2 pr-3">Día</th>
                      <th className="py-2 pr-3">Rol</th>
                      <th className="py-2 pr-3 text-right">Llamadas</th>
                      <th className="py-2 pr-3 text-right cursor-help" title="Tokens de entrada = texto enviado a la IA. 1 página de Word ≈ 700 tokens.">T. entrada ⓘ</th>
                      <th className="py-2 pr-3 text-right cursor-help" title="Tokens de salida = respuesta generada por la IA.">T. salida ⓘ</th>
                      <th className="py-2 pr-3 text-right">Caché</th>
                      <th className="py-2 pr-3 text-right">Latencia (s)</th>
                      <th className="py-2 pr-3 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.by_day_role.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-slate-600">
                          {new Date(r.day).toLocaleDateString("es-MX", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="py-1.5 pr-3 font-medium text-slate-800">
                          {r.role.charAt(0).toUpperCase() + r.role.slice(1)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {numFmt.format(r.calls)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {numFmt.format(r.total_input_tokens)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {numFmt.format(r.total_output_tokens)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-brand-primary-hover">
                          {numFmt.format(r.total_cache_hits)}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-slate-600">
                          {(r.avg_latency_ms / 1000).toFixed(1)} s
                        </td>
                        <td
                          className={`py-1.5 pr-3 text-right ${
                            r.errors > 0 ? "text-red-700" : "text-slate-600"
                          }`}
                        >
                          {r.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* Herramientas externas — referencia de costo */}
      <div className="mt-8 mb-6">
        <Panel title="Costo de herramientas conectadas">
          <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
            Servicios externos que procesan documentos. Se cobran por uso — no por mes.
            Referencia para estimar gasto según volumen de informes.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                <th className="pb-1.5 text-left">Herramienta</th>
                <th className="pb-1.5 text-left">Qué cobra</th>
                <th className="pb-1.5 text-right">Precio</th>
                <th className="pb-1.5 text-right">Free tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 font-semibold text-indigo-700">Voyage AI</td>
                <td className="py-1.5 text-slate-600">Por millón de tokens (fragmentos de documentos)</td>
                <td className="py-1.5 text-right text-slate-900 tabular-nums">$0.10 / 1M tokens</td>
                <td className="py-1.5 text-right text-emerald-700 tabular-nums">200M tokens/mes</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-amber-700">LlamaParse</td>
                <td className="py-1.5 text-slate-600">Por página de PDF procesada (1 vez por informe)</td>
                <td className="py-1.5 text-right text-slate-900 tabular-nums">$3.00 / 1k páginas</td>
                <td className="py-1.5 text-right text-emerald-700 tabular-nums">10,000 páginas</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-rose-700">Mistral OCR</td>
                <td className="py-1.5 text-slate-600">Por página (fallback de LlamaParse, batch más barato)</td>
                <td className="py-1.5 text-right text-slate-900 tabular-nums">$1.00 / 1k páginas</td>
                <td className="py-1.5 text-right text-slate-400 tabular-nums">Sin free tier</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-teal-700">QStash</td>
                <td className="py-1.5 text-slate-600">Por mensaje despachado (1 empresa = 1 mensaje/día)</td>
                <td className="py-1.5 text-right text-slate-900 tabular-nums">$1.00 / 100k msgs</td>
                <td className="py-1.5 text-right text-emerald-700 tabular-nums">1,000 msgs/día</td>
              </tr>
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
            Estimado piloto (10 clientes, 8 competidoras c/u, reportes ~100 pág):
            LlamaParse ~8,000 páginas = <span className="font-semibold text-slate-700">gratis</span> con free tier ·
            QStash ~80 msgs/día = <span className="font-semibold text-slate-700">gratis</span> con free tier ·
            Voyage AI embeddings = <span className="font-semibold text-slate-700">gratis</span> con free tier.
            Costo variable total estimado: <span className="font-semibold text-slate-700">$0 en el piloto</span>.
          </p>
        </Panel>
      </div>

      {/* ── Documentos del cliente ─────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Documentos del cliente — base de toda la IA
          </p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            La calidad de las respuestas IA depende directamente de los documentos subidos. Sin documentos,
            la IA trabaja solo con datos públicos. Con ellos, cita cifras y compromisos reales del cliente.
          </p>
        </div>

        {/* KPIs de documentos */}
        {docs && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <DocStat label="Total documentos" value={numFmt.format(docs.total)} />
              <DocStat label="Últimos 7 días" value={numFmt.format(docs.recent_count)} />
              <DocStat label="Informe sustentabilidad" value={numFmt.format(docs.by_kind.sustainability_report)} tone="emerald" />
              <DocStat label="Informe financiero" value={numFmt.format(docs.by_kind.financial_report)} tone="amber" />
              <DocStat label="Documentos generales" value={numFmt.format(docs.by_kind.general)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <DocStat label="Leídos correctamente" value={numFmt.format(docs.by_parse_status.ok)} tone="emerald" />
              <DocStat label="En proceso" value={numFmt.format(docs.by_parse_status.pending)} />
              <DocStat label="Con error de lectura" value={numFmt.format(docs.by_parse_status.failed)} tone={docs.by_parse_status.failed > 0 ? "rose" : "neutral"} />
              <DocStat label="Espacio usado" value={`${(docs.total_bytes / 1024 / 1024).toFixed(1)} MB`} />
            </div>
            {docs.by_parse_status.failed > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded px-4 py-2.5 mb-4 text-xs text-rose-800 leading-relaxed">
                <span className="font-bold">⚠ {docs.by_parse_status.failed} documento{docs.by_parse_status.failed > 1 ? "s" : ""} con error.</span>{" "}
                La IA no puede leer su contenido. Revisa el tab Documentos de cada cliente y vuelve a subir en formato PDF plano (sin protección de contraseña).
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function DocStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "amber" | "rose";
}) {
  const toneColor = {
    neutral: "text-slate-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone];
  return (
    <div className="border border-slate-200 rounded bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${toneColor}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  hintTone,
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "red";
  hintTone?: "ok" | "warn" | "red";
  spark?: number[];
  sparkColor?: string;
}) {
  const valueClass =
    tone === "red"
      ? "text-red-700"
      : tone === "ok"
      ? "text-green-700"
      : "text-slate-900";
  const hintClass =
    hintTone === "ok"
      ? "text-emerald-700"
      : hintTone === "warn"
      ? "text-amber-600"
      : hintTone === "red"
      ? "text-red-700"
      : "text-slate-600";
  return (
    <div className="bg-white border border-slate-200 rounded px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-600">
          {label}
        </div>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} color={sparkColor} width={64} height={20} />
        )}
      </div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className={`text-[10px] mt-0.5 ${hintClass}`}>{hint}</div>}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="text-xs uppercase tracking-wide text-slate-600 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text?: string } = {}) {
  return (
    <div className="text-sm text-slate-600 text-center py-6">
      {text ?? "Sin datos en el período."}
    </div>
  );
}
