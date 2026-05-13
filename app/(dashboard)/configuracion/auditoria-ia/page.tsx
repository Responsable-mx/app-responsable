import type { Metadata } from "next";
import { getUsageSummary } from "@/lib/ai/usage";

export const metadata: Metadata = {
  title: "Auditoría IA · Configuración · App ResponSable",
};
export const dynamic = "force-dynamic";

// ── Helpers UI ────────────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4 mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">{title}</p>
      {children}
    </div>
  );
}

// ── Tabla: configuración actual tarea → modelo ────────────────────────────────

type TaskConfig = {
  task: string;
  flow: string;
  model: string;
  costInput: string;
  costOutput: string;
  why: string;
  status: "active" | "active-partial" | "proposed";
};

const TASK_CONFIGS: TaskConfig[] = [
  { task: "Chat — Aurora (autora)",       flow: "Chat IA",         model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Balance velocidad + calidad para borradores con contexto del cliente.",                           status: "active" },
  { task: "Chat — Rebeca (revisora)",     flow: "Chat IA",         model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Checklist estructurado no requiere el modelo más caro.",                                          status: "active" },
  { task: "Chat — Elena (elevadora)",     flow: "Chat IA",         model: "Opus 4.7",                  costInput: "$15",    costOutput: "$75",    why: "Insights estratégicos y narrativa ejecutiva requieren máxima capacidad.",                          status: "active" },
  { task: "Chat — Valeria (validadora)",  flow: "Chat IA",         model: "Haiku 4.5",                 costInput: "$0.25",  costOutput: "$1.25",  why: "Validación estructurada (DoD, consistencia) — no requiere narrativa.",                            status: "active" },
  { task: "AI-fill cuestionario",         flow: "DM-IA · Etapa 1", model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Combina extracción con síntesis contextual. Gemini Flash propuesto para extracción pura.",         status: "active" },
  { task: "Benchmark empresas",           flow: "DM-IA · Etapa 3", model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Propuesta de empresas + narrativa comparativa.",                                                  status: "active" },
  { task: "IROs propios",                 flow: "DM-IA · Etapa 4", model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Inventario de Impactos, Riesgos y Oportunidades con scores.",                                     status: "active" },
  { task: "Resumen ejecutivo",            flow: "DM-IA · Etapa 5", model: "Sonnet 4.6",                costInput: "$3",     costOutput: "$15",    why: "Síntesis síncrona — consultor necesita el resultado al instante.",                                status: "active" },
  { task: "Reporte PDF",                  flow: "DM-IA · Etapa 7", model: "Opus 4.7",                  costInput: "$15",    costOutput: "$75",    why: "Entregable final al cliente — máxima calidad narrativa. Candidato a Batch API (50% off).",         status: "active" },
  { task: "Recuperación contexto chat",   flow: "Chat IA · Paso 2",model: "BM25 (keywords)",            costInput: "$0",     costOutput: "$0",     why: "Activo en prod. Voyage embeddings pendiente — mejora +25% precisión semántica.",                  status: "active-partial" },
  { task: "AI-fill — extracción pura",    flow: "DM-IA · Etapa 1", model: "Gemini Flash 2.0 (propuesto)", costInput: "$0.075", costOutput: "$0.30", why: "Extracción de datos sin síntesis: 40× más barato que Sonnet.",                                   status: "proposed" },
  { task: "Reporte PDF (async)",          flow: "DM-IA · Etapa 7", model: "Batch API (propuesto)",      costInput: "$7.50",  costOutput: "$37.50", why: "50% descuento automático. El consultor recibe notificación cuando está listo.",                  status: "proposed" },
];

function StatusDot({ status }: { status: TaskConfig["status"] }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Activo
    </span>
  );
  if (status === "active-partial") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Parcial
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />Propuesto
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuditoriaIaPage() {
  const usage = await getUsageSummary(30).catch(() => null);

  // ── Métricas derivadas ──────────────────────────────────────────────────────
  const voyageModel = usage?.by_model.find(m => m.family === "voyage");
  const voyageCalls  = voyageModel?.calls ?? 0;
  const llmCalls     = (usage?.total_calls ?? 0) - voyageCalls;
  const llmModels    = usage?.by_model.filter(m => m.family !== "voyage") ?? [];
  const totalErrors  = usage?.total_errors ?? 0;
  const errorRate    = llmCalls > 0 ? totalErrors / llmCalls : 0;
  const opusModel    = usage?.by_model.find(m => m.family === "opus");
  const opusPctLlm   = pct(opusModel?.calls ?? 0, llmCalls);
  const cacheRatio   = usage && (usage.total_input_tokens + usage.total_cache_read_tokens) > 0
    ? usage.total_cache_read_tokens / (usage.total_input_tokens + usage.total_cache_read_tokens)
    : 0;
  const voyageActive = voyageCalls > 100;

  // ── Alertas ─────────────────────────────────────────────────────────────────
  type Alert = { tone: "warn" | "info" | "error"; title: string; detail: string };
  const alerts: Alert[] = [];

  if (usage) {
    // Error rate en LLM calls
    if (errorRate > 0.1 && llmCalls > 10) {
      alerts.push({
        tone: "error",
        title: `${totalErrors} errores en ${numFmt.format(llmCalls)} llamadas LLM (${Math.round(errorRate * 100)}%)`,
        detail: "Tasa alta. Causas frecuentes: timeout en prompts largos, crédito de API agotado, o error en una herramienta (web_search, QStash). Revisar Uso IA → detalle por rol para identificar el rol afectado.",
      });
    } else if (errorRate > 0.02 && llmCalls > 10) {
      alerts.push({
        tone: "warn",
        title: `${totalErrors} errores detectados (${Math.round(errorRate * 100)}% de llamadas LLM)`,
        detail: "Tasa baja pero monitoreable. Revisar Uso IA para identificar si se concentran en un rol o cliente específico.",
      });
    }

    // Opus overuse
    if (opusPctLlm > 40) {
      alerts.push({
        tone: "warn",
        title: `Opus representa el ${opusPctLlm}% de las llamadas LLM`,
        detail: `Debería ser ≤20% (Elena + Reporte PDF). Si supera el 40%, hay llamadas rutinarias enrutadas a Elena que podrían ir a Aurora o Rebeca. Revisar distribución de roles en Uso IA.`,
      });
    }

    // Alta latencia
    if (usage.avg_latency_ms > 15_000) {
      alerts.push({
        tone: "warn",
        title: `Latencia promedio alta: ${(usage.avg_latency_ms / 1000).toFixed(1)} s`,
        detail: "Las llamadas más lentas son Opus y el Reporte PDF. Batch API procesa esas llamadas async al 50% del costo — el consultor recibe notificación en vez de esperar bloqueado.",
      });
    }

    // Caché funcionando bien
    if (cacheRatio > 0.4) {
      alerts.push({
        tone: "info",
        title: `Caché de prompt eficiente: ${Math.round(cacheRatio * 100)}% de tokens ahorrados`,
        detail: `${numFmt.format(usage.total_cache_read_tokens)} tokens no se cobraron a precio normal. Los 2 breakpoints ephemeral (contexto cliente + rol) están funcionando.`,
      });
    }

    // Voyage sin activar en prod
    if (!voyageActive) {
      alerts.push({
        tone: "info",
        title: "Voyage AI embeddings no activo en producción",
        detail: "VOYAGE_API_KEY configurada localmente. Activar en Vercel + migración 0076 mejora +25% precisión del chat. Ver pasos en Herramientas.",
      });
    }

    // Feedback negativo frecuente
    if (usage.feedback_total_down > 10) {
      const topReason = usage.feedback_top_reasons[0];
      alerts.push({
        tone: "warn",
        title: `Feedback negativo: ${usage.feedback_total_down} rechazos en 30 días`,
        detail: `${topReason ? `Razón más común: "${topReason.reason_code}" (${topReason.count}×). ` : ""}Revisar en Uso IA qué rol y cliente concentran los rechazos.`,
      });
    }
  }

  // ── Recomendaciones dinámicas ────────────────────────────────────────────────
  type Rec = { action: string; why: string; gain: string; effort: string; tone: "emerald" | "amber" | "rose" };
  const recs: Rec[] = [];

  if (usage) {
    // 1. Errores altos
    if (errorRate > 0.05 && llmCalls > 10) {
      recs.push({
        tone: "rose",
        action: `Investigar los ${totalErrors} errores (${Math.round(errorRate * 100)}% de llamadas LLM)`,
        why: `Revisar Uso IA → por rol para identificar cuál falla. Causas comunes: timeout de contexto largo, crédito agotado, o bug en herramienta (web_search, QStash). Logs en Vercel Functions.`,
        gain: "Recuperar fiabilidad — un error se ve como respuesta vacía o lentitud extrema",
        effort: "1–2h diagnóstico",
      });
    }

    // 2. Voyage embeddings
    if (!voyageActive) {
      recs.push({
        tone: "emerald",
        action: "Activar Voyage AI embeddings en producción",
        why: "VOYAGE_API_KEY configurada localmente. Pasos: agregar en Vercel + aplicar migración 0076 + activar en ai-fill. Ver Herramientas → Voyage AI.",
        gain: "+25% precisión semántica en chat",
        effort: "2h",
      });
    }

    // 3. Voyage Rerank (siempre relevante, urgencia depende de si voyage activo)
    recs.push({
      tone: voyageActive ? "emerald" : "amber",
      action: "Activar Voyage Rerank",
      why: voyageActive
        ? "Voyage ya activo en prod. Rerank usa la misma API key — una llamada extra de <100ms por respuesta selecciona los fragmentos más relevantes antes de enviárselos a la IA."
        : "Se activa justo después de que embeddings esté activo. Misma API key de Voyage, sin costo adicional.",
      gain: "+15% precisión retrieval, costo $0",
      effort: "1h",
    });

    // 4. Opus overuse
    if (opusPctLlm > 20 && llmCalls > 20) {
      recs.push({
        tone: "amber",
        action: `Opus al ${opusPctLlm}% de llamadas LLM — revisar distribución de roles`,
        why: `Debería ser ≤20%. Si consultores usan Elena para revisiones rutinarias o benchmarks, reconfigurar flujo hacia Aurora/Rebeca. El ahorro es significativo: Opus cuesta 5× más que Sonnet.`,
        gain: `Reducir el ${opusPctLlm - 20}% de llamadas Opus por encima del umbral`,
        effort: "2h revisión de uso por rol",
      });
    }

    // 5. Alta latencia → Batch API
    if (usage.avg_latency_ms > 10_000) {
      recs.push({
        tone: "amber",
        action: "Migrar Reporte PDF a Anthropic Batch API",
        why: `Latencia promedio ${(usage.avg_latency_ms / 1000).toFixed(1)} s. El reporte DM (Opus, 3–5 min) bloquea al consultor. Batch API lo procesa en segundo plano al 50% del costo — el consultor recibe notificación cuando está listo.`,
        gain: "−50% costo Reporte PDF + consultor no espera bloqueado",
        effort: "6h",
      });
    }

    // 6. Costo alto → Gemini Flash
    const sonnetModel = usage.by_model.find(m => m.family === "sonnet");
    if (usage.cost_usd_estimate_max > 5 && (sonnetModel?.calls ?? 0) > 10) {
      recs.push({
        tone: "amber",
        action: "Migrar extracción AI-fill a Gemini Flash",
        why: "El paso de extracción pura de datos del cuestionario (sin síntesis) es candidato ideal — Gemini Flash es 40× más barato que Sonnet en esa tarea. La síntesis y el contexto siguen en Sonnet.",
        gain: `−40× costo en extracción · ahorro estimado ~${usdFmt.format(usage.cost_usd_estimate_max * 0.15)}/mes`,
        effort: "8h",
      });
    }

    // 7. Redis cache (siempre recomendable si no está activo)
    recs.push({
      tone: "amber",
      action: "Configurar Upstash Redis para caché de benchmarks",
      why: "Ya tenemos cuenta Upstash vía QStash — solo agregar 2 variables de entorno. Benchmarks sectoriales repetidos (GRI, ESRS, TCFD) se responden en <10ms sin cobrar tokens.",
      gain: "−30–50% llamadas IA en benchmarks sectoriales repetidos",
      effort: "4h",
    });

    // 8. Feedback negativo
    if (usage.feedback_total_down > 5) {
      const topReason = usage.feedback_top_reasons[0];
      recs.push({
        tone: "amber",
        action: "Revisar prompts — feedback negativo frecuente",
        why: `${usage.feedback_total_down} rechazos en 30 días.${topReason ? ` Razón más común: "${topReason.reason_code}" (${topReason.count}×).` : ""} Ver distribución por rol y cliente en Uso IA para priorizar qué prompt revisar primero.`,
        gain: "Mejorar calidad de respuestas al consultor",
        effort: "2–4h por prompt revisado",
      });
    }
  } else {
    // Fallback sin datos
    recs.push(
      { tone: "emerald", action: "Activar Voyage AI embeddings en producción", why: "VOYAGE_API_KEY configurada localmente. Agregar en Vercel + migración 0076 + activar en ai-fill.", gain: "+25% precisión semántica en chat", effort: "2h" },
      { tone: "emerald", action: "Activar Voyage Rerank", why: "Misma API key de Voyage. Se activa después de embeddings.", gain: "+15% precisión retrieval, costo $0", effort: "1h" },
      { tone: "amber",   action: "Configurar Upstash Redis para caché", why: "Ya tenemos cuenta Upstash vía QStash. 2 env vars.", gain: "−30–50% llamadas IA en benchmarks repetidos", effort: "4h" },
      { tone: "amber",   action: "Migrar Reporte PDF a Anthropic Batch API", why: "Reporte DM (Opus, 3–5 min) bloquea al consultor. Batch API al 50% del costo.", gain: "−50% costo Reporte PDF", effort: "6h" },
      { tone: "amber",   action: "Migrar extracción AI-fill a Gemini Flash", why: "Extracción pura de datos: 40× más barato que Sonnet.", gain: "−40× costo en extracción de cuestionario", effort: "8h" },
    );
  }

  const toneMap = {
    rose:    "border-rose-200 bg-rose-50",
    emerald: "border-emerald-200 bg-emerald-50",
    amber:   "border-amber-200 bg-amber-50",
  };
  const circleTone = {
    rose:    "bg-rose-200 text-rose-800",
    emerald: "bg-emerald-200 text-emerald-800",
    amber:   "bg-amber-200 text-amber-800",
  };
  const gainTone = {
    rose:    "text-rose-700 border-rose-200",
    emerald: "text-emerald-700 border-emerald-200",
    amber:   "text-emerald-700 border-emerald-200",
  };

  return (
    <div className="px-8 py-6 max-w-5xl">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Auditoría de decisiones IA
      </p>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        Revisa si la app usa los modelos y herramientas correctos en cada tarea,
        y qué optimizaciones concretas hay disponibles. Las recomendaciones se generan
        a partir de los datos reales de los últimos 30 días.
      </p>

      {/* ── Alertas ─────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((a, i) => (
            <div
              key={i}
              role="alert"
              className={`border-l-4 rounded-r p-3 ${
                a.tone === "error"   ? "border-l-rose-500 bg-rose-50 text-rose-900"
                : a.tone === "warn" ? "border-l-amber-500 bg-amber-50 text-amber-900"
                : "border-l-teal-500 bg-teal-50 text-teal-900"
              }`}
            >
              <p className="text-sm font-bold">{a.title}</p>
              <p className="text-xs mt-0.5 leading-relaxed opacity-90">{a.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Llamadas LLM (30d)",
              value: numFmt.format(llmCalls),
              sub: voyageCalls > 0 ? `+ ${numFmt.format(voyageCalls)} embeddings` : undefined,
            },
            { label: "Costo estimado", value: usdFmt.format(usage.cost_usd_estimate_max) },
            {
              label: "Caché activo",
              value: usage.total_input_tokens > 0 ? `${Math.round(cacheRatio * 100)}%` : "—",
            },
            {
              label: "Tasa de error",
              value: llmCalls > 0 ? `${Math.round(errorRate * 100)}%` : "—",
              red: errorRate > 0.05,
              sub: totalErrors > 0 ? `${totalErrors} errores` : "0 errores",
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{kpi.label}</p>
              <p className={`text-xl font-bold mt-0.5 tabular-nums ${"red" in kpi && kpi.red ? "text-rose-700" : "text-slate-900"}`}>
                {kpi.value}
              </p>
              {"sub" in kpi && kpi.sub && (
                <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Distribución de modelos ──────────────────────────────────────────── */}
      {usage && usage.by_model.length > 0 && (
        <Panel title="Distribución real de modelos — últimos 30 días">

          {/* LLMs */}
          {llmModels.length > 0 && (
            <div className="mb-5">
              <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                Modelos LLM — {numFmt.format(llmCalls)} llamadas
              </p>
              <div className="space-y-2">
                {llmModels.map((m) => {
                  const p_ = pct(m.calls, llmCalls);
                  const isOver = m.family === "opus" && p_ > 20;
                  const barColor =
                    isOver         ? "bg-rose-400"
                    : m.family === "opus"    ? "bg-violet-400"
                    : m.family === "sonnet"  ? "bg-teal-500"
                    : m.family === "haiku"   ? "bg-emerald-400"
                    : "bg-slate-400";
                  const expected: Record<string, string> = {
                    opus: "≤20% recomendado", sonnet: "50–70% normal", haiku: "10–30% normal",
                  };
                  return (
                    <div key={m.family}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className={`font-semibold capitalize ${isOver ? "text-rose-600" : "text-slate-700"}`}>
                          {m.family}
                        </span>
                        <span className="text-slate-500">
                          {numFmt.format(m.calls)} llamadas · {p_}%
                          {expected[m.family] && (
                            <span className={`ml-1 ${isOver ? "text-rose-400" : "text-slate-400"}`}>
                              ({expected[m.family]})
                            </span>
                          )}
                          <span className="ml-1 text-slate-400">· {usdFmt.format(m.cost_usd)}</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded h-1">
                        <div className={`h-1 rounded ${barColor}`} style={{ width: `${p_}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Embeddings (Voyage) — separado de LLMs */}
          {voyageModel && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                Embeddings — {numFmt.format(voyageCalls)} llamadas
              </p>
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="font-semibold text-slate-700">Voyage AI</span>
                  <span className="text-slate-500">
                    {numFmt.format(voyageModel.calls)} llamadas
                    <span className="text-slate-400 ml-1">· proporcional a docs</span>
                    <span className="ml-1 text-slate-400">· {usdFmt.format(voyageModel.cost_usd)}</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded h-1">
                  <div className="h-1 rounded bg-indigo-400" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 mt-3">
            Ver detalle completo (tokens, costo, latencia, errores) en{" "}
            <a href="/configuracion/uso-ia" className="text-brand-primary underline underline-offset-2">Uso IA →</a>
          </p>
        </Panel>
      )}

      {/* ── Por rol ─────────────────────────────────────────────────────────── */}
      {usage && usage.by_role.length > 0 && (
        <Panel title="Uso por rol — últimos 30 días">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                  <th className="pb-2 text-left">Rol</th>
                  <th className="pb-2 text-right">Llamadas</th>
                  <th className="pb-2 text-right">Costo</th>
                  <th className="pb-2 text-right">Latencia prom.</th>
                  <th className="pb-2 text-right">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usage.by_role.map((r) => {
                  const roleErrors = r.errors;
                  const roleErrorRate = r.calls > 0 ? roleErrors / r.calls : 0;
                  return (
                    <tr key={r.role} className="hover:bg-slate-50">
                      <td className="py-2 font-semibold text-slate-800 capitalize">{r.role}</td>
                      <td className="py-2 text-right text-slate-600 tabular-nums">{numFmt.format(r.calls)}</td>
                      <td className="py-2 text-right text-slate-600 tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                      <td className="py-2 text-right text-slate-600 tabular-nums">
                        {r.avg_latency_ms > 0 ? `${(r.avg_latency_ms / 1000).toFixed(1)} s` : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums font-medium ${roleErrorRate > 0.05 ? "text-rose-600" : "text-slate-500"}`}>
                        {roleErrors > 0 ? `${roleErrors} (${Math.round(roleErrorRate * 100)}%)` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── Configuración actual de modelos ─────────────────────────────────── */}
      <Panel title="Configuración actual — tarea → modelo → costo">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                <th className="pb-2 text-left">Tarea</th>
                <th className="pb-2 text-left">Flujo</th>
                <th className="pb-2 text-left">Modelo</th>
                <th className="pb-2 text-right">Entrada/1M</th>
                <th className="pb-2 text-right">Salida/1M</th>
                <th className="pb-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {TASK_CONFIGS.map((tc) => (
                <tr key={tc.task} className={`hover:bg-slate-50 ${tc.status === "proposed" ? "opacity-55" : ""}`}>
                  <td className="py-2 font-semibold text-slate-800">
                    {tc.task}
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-relaxed max-w-[260px]">{tc.why}</p>
                  </td>
                  <td className="py-2 text-slate-500">{tc.flow}</td>
                  <td className="py-2 font-mono text-slate-700 text-[11px]">{tc.model}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{tc.costInput}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{tc.costOutput}</td>
                  <td className="py-2 text-right"><StatusDot status={tc.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Costo en USD por millón de tokens (entrada / salida). Cache hits reducen el costo de entrada ~90%.
        </p>
      </Panel>

      {/* ── Recomendaciones ─────────────────────────────────────────────────── */}
      <Panel title="Próximos ajustes recomendados — basados en datos reales">
        <div className="flex flex-col gap-3">
          {recs.map((rec, idx) => (
            <div key={idx} className={`border rounded p-3 ${toneMap[rec.tone]}`}>
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${circleTone[rec.tone]}`}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">{rec.action}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{rec.why}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
                    <span className={`bg-white/70 font-semibold px-1.5 py-0.5 rounded-sm border ${gainTone[rec.tone]}`}>
                      Ganancia: {rec.gain}
                    </span>
                    <span className="bg-white/70 text-slate-600 px-1.5 py-0.5 rounded-sm border border-slate-200">
                      Esfuerzo: {rec.effort}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-4">
          Detalle de implementación:{" "}
          <a href="/configuracion/flujos-ia" className="text-brand-primary underline underline-offset-2">Flujos IA →</a>
          {" · "}
          <a href="/configuracion/herramientas" className="text-brand-primary underline underline-offset-2">Herramientas →</a>
          {" · "}
          <a href="/configuracion/uso-ia" className="text-brand-primary underline underline-offset-2">Uso IA →</a>
        </p>
      </Panel>
    </div>
  );
}
