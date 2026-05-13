import type { Metadata } from "next";
import { getUsageSummary } from "@/lib/ai/usage";

export const metadata: Metadata = {
  title: "Auditoría IA · Configuración · App ResponSable",
};
export const dynamic = "force-dynamic";

// ── Tabla: decisiones de configuración actuales ───────────────────────────────

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
  // Chat
  {
    task: "Chat — Aurora (autora)",
    flow: "Chat IA",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Balance velocidad + calidad para construir borradores completos con contexto del cliente.",
    status: "active",
  },
  {
    task: "Chat — Rebeca (revisora)",
    flow: "Chat IA",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Checklist estructurado no requiere el modelo más caro; Sonnet es suficiente para detectar omisiones.",
    status: "active",
  },
  {
    task: "Chat — Elena (elevadora)",
    flow: "Chat IA",
    model: "Opus 4.7",
    costInput: "$15",
    costOutput: "$75",
    why: "Insights estratégicos, trade-offs y narrativa ejecutiva requieren máxima capacidad de razonamiento.",
    status: "active",
  },
  {
    task: "Chat — Valeria (validadora)",
    flow: "Chat IA",
    model: "Haiku 4.5",
    costInput: "$0.25",
    costOutput: "$1.25",
    why: "Validación estructurada (DoD, consistencia, evidencia) — no requiere narrativa, sólo verificar.",
    status: "active",
  },
  // DM-IA
  {
    task: "AI-fill cuestionario",
    flow: "DM-IA · Etapa 1",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Combina extracción de datos con síntesis contextual. Gemini Flash propuesto para la extracción pura.",
    status: "active",
  },
  {
    task: "Benchmark empresas — propuesta",
    flow: "DM-IA · Etapa 3",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Propone empresas comparables y genera narrativa de comparativa.",
    status: "active",
  },
  {
    task: "IROs propios",
    flow: "DM-IA · Etapa 4",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Inventario de Impactos, Riesgos y Oportunidades por tema ESG con scores.",
    status: "active",
  },
  {
    task: "Resumen ejecutivo",
    flow: "DM-IA · Etapa 5",
    model: "Sonnet 4.6",
    costInput: "$3",
    costOutput: "$15",
    why: "Síntesis ejecutiva síncrona — consultor necesita el resultado al instante.",
    status: "active",
  },
  {
    task: "Reporte PDF",
    flow: "DM-IA · Etapa 7",
    model: "Opus 4.7",
    costInput: "$15",
    costOutput: "$75",
    why: "Entregable final al cliente — máxima calidad narrativa. Candidato a Batch API (50% off).",
    status: "active",
  },
  // Recuperación de contexto
  {
    task: "Recuperación contexto chat",
    flow: "Chat IA · Paso 2",
    model: "BM25 (keywords)",
    costInput: "$0",
    costOutput: "$0",
    why: "Activo en prod. Voyage embeddings pendiente de activar — mejora +25% precisión semántica.",
    status: "active-partial",
  },
  // Propuestos
  {
    task: "AI-fill — extracción pura",
    flow: "DM-IA · Etapa 1",
    model: "Gemini Flash 2.0 (propuesto)",
    costInput: "$0.075",
    costOutput: "$0.30",
    why: "Migrar extracción de datos de Sonnet → Gemini Flash reduce costo 40×. Síntesis queda en Sonnet.",
    status: "proposed",
  },
  {
    task: "Reporte PDF (async)",
    flow: "DM-IA · Etapa 7",
    model: "Anthropic Batch API (propuesto)",
    costInput: "$7.50",
    costOutput: "$37.50",
    why: "50% descuento automático. El consultor no espera — recibe notificación cuando está listo.",
    status: "proposed",
  },
];

// ── Herramientas: estado de adopción ─────────────────────────────────────────

type ToolAdoption = {
  tool: string;
  status: "active" | "partial" | "proposed";
  impact: string;
  effort: "bajo" | "medio" | "alto";
  envKey?: string;
};

const TOOL_ADOPTION: ToolAdoption[] = [
  { tool: "Anthropic Claude (Haiku/Sonnet/Opus)", status: "active", impact: "Core — sin esto no hay IA", effort: "bajo" },
  { tool: "LlamaParse — PDFs complejos", status: "active", impact: "Alta fidelidad en tablas de informes ESG", effort: "bajo" },
  { tool: "Mistral OCR — fallback PDFs", status: "active", impact: "Continuidad si LlamaParse se agota", effort: "bajo" },
  { tool: "QStash — trabajos en paralelo", status: "active", impact: "Benchmark 10 empresas en paralelo vs. secuencial", effort: "bajo" },
  { tool: "Voyage AI — embeddings", status: "partial", impact: "+25% precisión RAG; activo local, pendiente prod", effort: "bajo", envKey: "VOYAGE_API_KEY + mig 0076" },
  { tool: "Voyage Rerank — selección fina", status: "proposed", impact: "+15–25% precisión retrieval sin costo extra", effort: "bajo", envKey: "VOYAGE_API_KEY (misma)" },
  { tool: "Upstash Redis — caché de respuestas", status: "proposed", impact: "−30–50% llamadas IA en benchmarks repetidos", effort: "bajo", envKey: "UPSTASH_REDIS_REST_URL + TOKEN" },
  { tool: "Anthropic Batch API — reportes async", status: "proposed", impact: "−50% costo en Reporte PDF + IROs masivos", effort: "medio", envKey: "ANTHROPIC_API_KEY (ya configurada)" },
  { tool: "Gemini Flash — extracción económica", status: "proposed", impact: "−40× costo en paso de extracción AI-fill", effort: "medio", envKey: "GOOGLE_AI_API_KEY" },
];

// ── Helpers UI ────────────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function StatusDot({ status }: { status: "active" | "active-partial" | "proposed" }) {
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
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />Propuesto
    </span>
  );
}

function ToolDot({ status }: { status: "active" | "partial" | "proposed" }) {
  if (status === "active") return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0 mt-1" />;
  if (status === "partial") return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0 mt-1" />;
  return <span className="w-2 h-2 rounded-full bg-slate-300 inline-block shrink-0 mt-1" />;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4 mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">{title}</p>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuditoriaIaPage() {
  const usage = await getUsageSummary(30).catch(() => null);

  // Alertas de optimización basadas en datos reales
  type Alert = { tone: "warn" | "info"; title: string; detail: string };
  const alerts: Alert[] = [];

  if (usage) {
    const opus = usage.by_model.find((m) => m.family === "opus");
    const sonnet = usage.by_model.find((m) => m.family === "sonnet");
    const totalCalls = usage.total_calls;

    // Alerta: Opus supera el 70% de llamadas (debería ser <20%)
    if (opus && totalCalls > 0) {
      const opusPct = Math.round((opus.calls / totalCalls) * 100);
      if (opusPct > 40) {
        alerts.push({
          tone: "warn",
          title: `Opus representa el ${opusPct}% de las llamadas`,
          detail: `Opus (Elena + Reporte PDF) debería ser ≤20% del volumen — son las tareas estratégicas de alto valor. Si supera el 40%, hay llamadas rutinarias que podrían moverse a Sonnet. Revisa qué rol genera más llamadas en "Uso IA".`,
        });
      }
    }

    // Alerta: Alta latencia promedio
    if (usage.avg_latency_ms > 15_000) {
      alerts.push({
        tone: "warn",
        title: `Latencia promedio alta: ${(usage.avg_latency_ms / 1000).toFixed(1)} s`,
        detail: `Las llamadas más lentas suelen ser Opus y el Reporte PDF. Considera activar Anthropic Batch API para reportes — el consultor recibe notificación cuando está listo en vez de esperar bloqueado.`,
      });
    }

    // Info: cache funciona bien
    if (usage.total_input_tokens > 0) {
      const cacheRatio = usage.total_cache_read_tokens / (usage.total_input_tokens + usage.total_cache_read_tokens);
      if (cacheRatio > 0.4) {
        alerts.push({
          tone: "info",
          title: `Caché de prompt eficiente: ${Math.round(cacheRatio * 100)}% de tokens ahorrados`,
          detail: `El sistema de caché de contexto (2 breakpoints ephemeral) está funcionando bien — ${numFmt.format(usage.total_cache_read_tokens)} tokens no se cobraron a precio normal.`,
        });
      }
    }

    // Info: embeddings pendientes
    const hasVoyage = usage.by_model.some((m) => m.family === "voyage");
    if (!hasVoyage) {
      alerts.push({
        tone: "info",
        title: "Voyage AI embeddings pendiente de activar en producción",
        detail: "La búsqueda semántica (BM25) está activa pero Voyage embeddings no aparece en los últimos 30 días de llamadas. Activar mejora +25% precisión del chat — ver pasos en tab Herramientas.",
      });
    }

    // Costo alto sin optimizaciones propuestas
    if (usage.cost_usd_estimate_max > 50 && sonnet && sonnet.calls > 20) {
      alerts.push({
        tone: "info",
        title: "Potencial de ahorro con Batch API y Gemini Flash",
        detail: `Gasto estimado últimos 30 días: ${usdFmt.format(usage.cost_usd_estimate_max)}. Migrar Reporte PDF a Batch API (−50%) + extracción AI-fill a Gemini Flash (−40×) podría reducir hasta ${usdFmt.format(usage.cost_usd_estimate_max * 0.30)} / mes.`,
      });
    }
  }

  const activeCount = TOOL_ADOPTION.filter((t) => t.status === "active").length;
  const partialCount = TOOL_ADOPTION.filter((t) => t.status === "partial").length;
  const proposedCount = TOOL_ADOPTION.filter((t) => t.status === "proposed").length;

  return (
    <div className="px-8 py-6 max-w-5xl">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Auditoría de decisiones IA
      </p>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        Estado actual de la configuración de modelos y herramientas IA. Útil para revisar si la app
        usa los recursos correctos en cada tarea y dónde hay oportunidades de mejora.
      </p>

      {/* ── Alertas ─────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((a, i) => (
            <div
              key={i}
              role="alert"
              className={`border-l-4 rounded-r p-3 ${
                a.tone === "warn"
                  ? "border-l-amber-500 bg-amber-50 text-amber-900"
                  : "border-l-teal-500 bg-teal-50 text-teal-900"
              }`}
            >
              <p className="text-sm font-bold">{a.title}</p>
              <p className="text-xs mt-0.5 leading-relaxed opacity-90">{a.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs rápidos ──────────────────────────────────────────────────── */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Llamadas (30d)", value: numFmt.format(usage.total_calls) },
            { label: "Costo estimado", value: usdFmt.format(usage.cost_usd_estimate_max) },
            {
              label: "Caché activo",
              value:
                usage.total_input_tokens > 0
                  ? `${Math.round((usage.total_cache_read_tokens / (usage.total_input_tokens + usage.total_cache_read_tokens)) * 100)}%`
                  : "—",
            },
            { label: "Errores", value: String(usage.total_errors), red: usage.total_errors > 0 },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{kpi.label}</p>
              <p className={`text-xl font-bold mt-0.5 tabular-nums ${"red" in kpi && kpi.red ? "text-rose-700" : "text-slate-900"}`}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Configuración de modelos ─────────────────────────────────────────── */}
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
                <tr key={tc.task} className={`hover:bg-slate-50 ${tc.status === "proposed" ? "opacity-60" : ""}`}>
                  <td className="py-2 font-semibold text-slate-800">
                    {tc.task}
                    <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-relaxed max-w-[260px]">
                      {tc.why}
                    </p>
                  </td>
                  <td className="py-2 text-slate-500">{tc.flow}</td>
                  <td className="py-2 font-mono text-slate-700">{tc.model}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{tc.costInput}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{tc.costOutput}</td>
                  <td className="py-2 text-right">
                    <StatusDot status={tc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          Costo en USD por millón de tokens (entrada / salida). Cache hits reducen el costo de entrada ~90%.
        </p>
      </Panel>

      {/* ── Herramientas: estado de adopción ─────────────────────────────────── */}
      <Panel title="Herramientas — adopción actual">
        <div className="flex gap-4 mb-4 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {activeCount} activas
          </span>
          <span className="flex items-center gap-1.5 text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            {partialCount} parcial
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            {proposedCount} propuestas
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {TOOL_ADOPTION.map((t) => (
            <div
              key={t.tool}
              className={`flex items-start gap-3 p-2.5 rounded ${
                t.status === "proposed" ? "bg-slate-50 opacity-70" : "bg-white border border-slate-100"
              }`}
            >
              <ToolDot status={t.status} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800">{t.tool}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t.impact}</p>
                {t.envKey && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Variable:{" "}
                    <code className="font-mono bg-slate-100 px-1 rounded">{t.envKey}</code>
                  </p>
                )}
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${
                  t.effort === "bajo" ? "text-emerald-700" : t.effort === "medio" ? "text-amber-700" : "text-rose-700"
                }`}
              >
                Esfuerzo {t.effort}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Distribución real de modelos ─────────────────────────────────────── */}
      {usage && usage.by_model.length > 0 && (
        <Panel title={`Distribución real de modelos — últimos 30 días`}>
          <div className="space-y-2">
            {usage.by_model.map((m) => {
              const pct = usage.total_calls > 0 ? Math.round((m.calls / usage.total_calls) * 100) : 0;
              const barColor =
                m.family === "opus" ? "bg-rose-400"
                  : m.family === "sonnet" ? "bg-teal-500"
                  : m.family === "haiku" ? "bg-emerald-400"
                  : "bg-indigo-400";
              const expected: Record<string, string> = {
                opus: "≤20% recomendado",
                sonnet: "50–70% normal",
                haiku: "10–30% normal",
                voyage: "proporcional a docs",
              };
              return (
                <div key={m.family}>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="font-semibold text-slate-700 capitalize">{m.family}</span>
                    <span className="text-slate-500">
                      {numFmt.format(m.calls)} llamadas · {pct}%
                      {expected[m.family] && (
                        <span className="text-slate-400 ml-1">({expected[m.family]})</span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded h-1">
                    <div
                      className={`h-1 rounded ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Ver detalle completo (tokens, costo, latencia, errores) en{" "}
            <a href="/configuracion/uso-ia" className="text-brand-primary underline underline-offset-2">
              Uso IA →
            </a>
          </p>
        </Panel>
      )}

      {/* ── Recomendaciones por prioridad ─────────────────────────────────────── */}
      <Panel title="Próximos ajustes recomendados">
        <div className="flex flex-col gap-3">
          {[
            {
              priority: "1",
              action: "Activar Voyage AI embeddings en producción",
              why: "Clave ya está configurada localmente. Solo falta: añadir VOYAGE_API_KEY en Vercel + aplicar migración 0076 + activar en ai-fill.",
              gain: "+25% precisión semántica en chat",
              effort: "2h",
              tone: "emerald" as const,
            },
            {
              priority: "2",
              action: "Activar Voyage Rerank",
              why: "Usa la misma API key de Voyage. Se activa después de que embeddings esté activo. Una llamada extra de <100ms por respuesta.",
              gain: "+15% adicional de precisión retrieval, costo $0",
              effort: "1h",
              tone: "emerald" as const,
            },
            {
              priority: "3",
              action: "Configurar Upstash Redis para caché",
              why: "Ya tenemos cuenta Upstash vía QStash. Agregar 2 variables de entorno y envolver las llamadas de benchmark en cache-aside.",
              gain: "−30–50% llamadas IA en benchmarks repetidos",
              effort: "4h",
              tone: "amber" as const,
            },
            {
              priority: "4",
              action: "Migrar Reporte PDF a Anthropic Batch API",
              why: "El reporte DM es la llamada más cara (Opus, ~3-5 min). Batch API lo procesa async al 50% del costo. El consultor recibe notificación.",
              gain: "−50% costo Reporte PDF",
              effort: "6h",
              tone: "amber" as const,
            },
            {
              priority: "5",
              action: "Migrar extracción AI-fill a Gemini Flash",
              why: "El paso de extracción pura de datos (sin síntesis) es candidato ideal para Gemini Flash — 40× más barato que Sonnet en esa tarea.",
              gain: "−40× costo en extracción de cuestionario",
              effort: "8h",
              tone: "amber" as const,
            },
          ].map((rec) => (
            <div
              key={rec.priority}
              className={`border rounded p-3 ${
                rec.tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    rec.tone === "emerald"
                      ? "bg-emerald-200 text-emerald-800"
                      : "bg-amber-200 text-amber-800"
                  }`}
                >
                  {rec.priority}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">{rec.action}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{rec.why}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px]">
                    <span className="bg-white/70 text-emerald-700 font-semibold px-1.5 py-0.5 rounded-sm border border-emerald-200">
                      Ganancia: {rec.gain}
                    </span>
                    <span className="bg-white/70 text-slate-600 px-1.5 py-0.5 rounded-sm border border-slate-200">
                      Esfuerzo estimado: {rec.effort}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-4">
          Detalle de implementación: ver tab{" "}
          <a href="/configuracion/flujos-ia" className="text-brand-primary underline underline-offset-2">
            Flujos IA
          </a>{" "}
          para contexto de cada herramienta en su flujo.
        </p>
      </Panel>
    </div>
  );
}
