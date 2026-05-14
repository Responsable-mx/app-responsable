import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getUsageSummary } from "@/lib/ai/usage";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sparkline } from "@/components/Sparkline";
import { MonitoreoIaTabs } from "@/components/config/MonitoreoIaTabs";

export const metadata: Metadata = {
  title: "Monitoreo IA · Configuración · App ResponSable",
};
export const dynamic = "force-dynamic";

// ── Formatters ────────────────────────────────────────────────────────────────
const numFmt = new Intl.NumberFormat("es-MX");
const usdFmt = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function latenciaLabel(ms: number) {
  if (ms <= 0) return "—";
  const s = ms / 1000;
  if (s < 3)  return `Muy rápida (${s.toFixed(1)} s)`;
  if (s < 8)  return `Normal (${s.toFixed(1)} s)`;
  if (s < 15) return `Lenta (${s.toFixed(1)} s)`;
  return `Muy lenta (${s.toFixed(1)} s)`;
}

// ── Umbrales de auditoría ─────────────────────────────────────────────────────
const THRESHOLDS = {
  errorRate:    { rate: 0.10, minCalls: 30 },
  opusPct:      { pct: 35,   minCalls: 30 },
  benchmarkMin: 5,
  cacheRatio:   { max: 0.20, minCalls: 50 },
  costoAiFill:  { usd: 20,   minCalls: 30 },
  feedbackDown: 15,
  latenciaMs:   30_000,
} as const;

const COST_ALERT_THRESHOLD_USD    = Number(process.env.IA_COST_ALERT_USD    ?? 150);
const OPUS_DOMINANCE_THRESHOLD_PCT = Number(process.env.IA_OPUS_DOMINANCE_PCT ?? 60);

// ── Tipos ────────────────────────────────────────────────────────────────────
type Prioridad   = "urgente" | "importante" | "conveniente";
type HealthStatus = "verde" | "amarillo" | "rojo" | "neutral";

type Decision = {
  prioridad:      Prioridad;
  titulo:         string;
  queMejora:      string;
  porQueImporta:  string;
  ejemplo?:       string;
  necesita:       string;
  recomendacion:  "activar" | "revisar" | "planear" | "investigar";
};

type TrendChip   = { arrow: "↑" | "↓" | "→"; delta: string; improving: boolean };
type HealthCheck = { label: string; status: HealthStatus; valor: string; meta?: string; trend?: TrendChip | null };
type CostAlert   = { tone: "warn" | "danger"; title: string; detail: string };

const HEALTH_STYLE: Record<HealthStatus, { dot: string; badge: string; label: string }> = {
  verde:    { dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "OK"        },
  amarillo: { dot: "bg-amber-400",   badge: "bg-amber-50   text-amber-700   border-amber-200",   label: "Revisar"   },
  rojo:     { dot: "bg-rose-500",    badge: "bg-rose-50    text-rose-700    border-rose-200",     label: "Atención"  },
  neutral:  { dot: "bg-slate-200",   badge: "bg-slate-50   text-slate-400   border-slate-200",    label: "Sin datos" },
};

// ── Data fetchers ─────────────────────────────────────────────────────────────
type DocStats = {
  total: number;
  by_kind: { general: number; sustainability_report: number; financial_report: number };
  by_parse_status: { ok: number; pending: number; failed: number };
  total_bytes: number;
  recent_count: number;
};

async function getDocumentsStats(): Promise<DocStats | null> {
  try {
    const sb   = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb.from("client_documents").select("kind, parse_status, size_bytes, created_at");
    if (error) { console.error("[monitoreo-ia] doc stats:", error.message); return null; }
    const rows = data ?? [];
    return {
      total:          rows.length,
      by_kind: {
        general:               rows.filter(r => r.kind === "general").length,
        sustainability_report: rows.filter(r => r.kind === "sustainability_report").length,
        financial_report:      rows.filter(r => r.kind === "financial_report").length,
      },
      by_parse_status: {
        ok:      rows.filter(r => r.parse_status === "ok").length,
        pending: rows.filter(r => r.parse_status === "pending").length,
        failed:  rows.filter(r => r.parse_status === "failed").length,
      },
      total_bytes:  rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
      recent_count: rows.filter(r => r.created_at >= since).length,
    };
  } catch { return null; }
}

async function getDocStats() {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("client_documents").select("parse_status");
    if (error) return null;
    const rows = data ?? [];
    return {
      total:   rows.length,
      failed:  rows.filter(r => r.parse_status === "failed").length,
      pending: rows.filter(r => r.parse_status === "pending").length,
    };
  } catch { return null; }
}

async function getNullEmbeddingsCount(): Promise<number> {
  try {
    const sb = createAdminClient();
    const { count, error } = await sb
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null);
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded p-4">
      <div className="text-xs uppercase tracking-wide text-slate-600 mb-3">{title}</div>
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

function Metric({
  label, value, hint, tone = "neutral", hintTone, spark, sparkColor,
}: {
  label: string; value: string; hint?: string;
  tone?: "neutral" | "ok" | "red"; hintTone?: "ok" | "warn" | "red";
  spark?: number[]; sparkColor?: string;
}) {
  const valueClass = tone === "red" ? "text-red-700" : tone === "ok" ? "text-green-700" : "text-slate-900";
  const hintClass  = hintTone === "ok" ? "text-emerald-700" : hintTone === "warn" ? "text-amber-600" : hintTone === "red" ? "text-red-700" : "text-slate-600";
  return (
    <div className="bg-white border border-slate-200 rounded px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-600">{label}</div>
        {spark && spark.length > 0 && <Sparkline values={spark} color={sparkColor} width={64} height={20} />}
      </div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className={`text-[10px] mt-0.5 ${hintClass}`}>{hint}</div>}
    </div>
  );
}

function DocStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "emerald" | "amber" | "rose" }) {
  const toneColor = { neutral: "text-slate-900", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" }[tone];
  return (
    <div className="border border-slate-200 rounded bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${toneColor}`}>{value}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function MonitoreoIaPage() {
  const [s, docs, docStats, nullEmbeddings] = await Promise.all([
    getUsageSummary(30).catch(() => null),
    getDocumentsStats(),
    getDocStats(),
    getNullEmbeddingsCount(),
  ]);

  // ── Métricas derivadas compartidas ────────────────────────────────────────
  const voyageModel = s?.by_model.find(m => m.family === "voyage");
  const voyageCalls = voyageModel?.calls ?? 0;
  const llmCalls    = (s?.total_calls ?? 0) - voyageCalls;
  const llmErrors   = (s?.by_role ?? []).filter(r => r.role !== "embeddings").reduce((sum, r) => sum + r.errors, 0);
  const errorRate   = llmCalls > 0 ? llmErrors / llmCalls : 0;
  const successRate = Math.max(0, 100 - Math.round(errorRate * 100));
  const opusModel   = s?.by_model.find(m => m.family === "opus");
  const opusPct     = pct(opusModel?.calls ?? 0, llmCalls);
  const cacheRatio  = s && (s.total_input_tokens + s.total_cache_read_tokens) > 0
    ? s.total_cache_read_tokens / (s.total_input_tokens + s.total_cache_read_tokens) : 0;
  const voyageActive    = voyageCalls > 0;
  const rerankActive    = (s?.by_stage ?? []).some(st => st.stage === "rerank");
  const _dmReportActive = (s?.by_stage ?? []).some(st => st.stage === "dm_report" && st.calls > 0);
  const benchmarkCalls  = (s?.by_stage ?? []).filter(st => st.stage.startsWith("dm_benchmark")).reduce((sum, st) => sum + st.calls, 0);
  const benchmarkActive = benchmarkCalls >= THRESHOLDS.benchmarkMin;
  const auroraRole      = s?.by_role.find(r => r.role === "aurora");
  const latenciaMs      = auroraRole?.avg_latency_ms ?? s?.avg_latency_ms ?? 0;
  const costoMes        = s?.cost_usd_estimate_max ?? 0;
  const cacheSavingsUsd = s ? Number((s.total_cache_read_tokens * 2.7 / 1_000_000).toFixed(2)) : 0;
  const voyageSystemErrors = s ? Math.max(0, s.total_errors - llmErrors) : 0;
  const realTopUsers = s ? s.top_users.filter(u =>
    !u.user_email.toLowerCase().startsWith("cron") &&
    !u.user_email.includes("service_role") &&
    !u.user_email.includes("@system")
  ) : [];

  // ── Tendencia — primera vs segunda mitad del período ──────────────────────
  const sortedDayRows = [...(s?.by_day_role ?? [])].sort((a, b) => a.day.localeCompare(b.day));
  const midpoint = Math.floor(sortedDayRows.length / 2);

  function halfStats(rows: typeof sortedDayRows) {
    const llm   = rows.filter(r => r.role !== "embeddings");
    const calls  = llm.reduce((acc, r) => acc + r.calls, 0);
    const errors = llm.reduce((acc, r) => acc + r.errors, 0);
    const allCache = rows.reduce((acc, r) => acc + r.total_cache_hits, 0);
    const allInput = rows.reduce((acc, r) => acc + r.total_input_tokens, 0);
    return {
      calls,
      errorRate:  calls >= 15 ? errors / calls : null,
      cacheRatio: (allInput + allCache) > 0 ? allCache / (allInput + allCache) : null,
    };
  }
  const olderStats = halfStats(sortedDayRows.slice(0, midpoint));
  const newerStats = halfStats(sortedDayRows.slice(midpoint));

  function computeTrend(older: number | null, newer: number | null, higherIsBetter: boolean, minCalls: number): TrendChip | null {
    if (older === null || newer === null || minCalls < 15) return null;
    const deltaPct = Math.round((newer - older) * 100);
    if (Math.abs(deltaPct) < 2) return { arrow: "→", delta: "estable", improving: true };
    const goingUp = newer > older;
    return { arrow: goingUp ? "↑" : "↓", delta: `${goingUp ? "+" : ""}${deltaPct}pp`, improving: higherIsBetter ? goingUp : !goingUp };
  }
  const trendErrorRate  = computeTrend(olderStats.errorRate,  newerStats.errorRate,  false, olderStats.calls);
  const trendCacheRatio = computeTrend(olderStats.cacheRatio, newerStats.cacheRatio, true,  olderStats.calls);

  // ── Semáforo de salud ─────────────────────────────────────────────────────
  const semaforo: "verde" | "amarillo" | "rojo" =
    errorRate > 0.2 || costoMes > 100 ? "rojo"
    : errorRate > 0.05 || !voyageActive || opusPct > 40 ? "amarillo"
    : "verde";

  const semaforoLabel = { verde: "Sistema funcionando bien", amarillo: "Mejoras disponibles", rojo: "Requiere atención" };
  const semaforoColor = {
    verde:    { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-800" },
    amarillo: { bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-400",   text: "text-amber-800"   },
    rojo:     { bg: "bg-rose-50",    border: "border-rose-200",    dot: "bg-rose-500",    text: "text-rose-800"    },
  };
  const sc = semaforoColor[semaforo];

  const semaforoDesc =
    semaforo === "rojo"
      ? `La IA falló en ${Math.round(errorRate * 100)}% de las respuestas — esto afecta directamente a los consultores.`
      : semaforo === "amarillo"
      ? `La IA funciona correctamente pero hay mejoras concretas disponibles que aumentarían la precisión de las respuestas y/o reducirían el costo mensual sin trabajo técnico mayor.`
      : `La IA responde bien, el costo está bajo control y los consultores reciben respuestas de calidad.`;

  const roleLabel: Record<string, string> = {
    aurora:     "Aurora — Autora",
    rebeca:     "Rebeca — Revisora",
    elena:      "Elena — Elevadora",
    valeria:    "Valeria — Validadora",
    embeddings: "Indexación de documentos",
  };

  // ── Decisiones disponibles ────────────────────────────────────────────────
  const decisions: Decision[] = [];

  if (s) {
    // Error rate crítico
    if (errorRate > THRESHOLDS.errorRate.rate && llmCalls >= THRESHOLDS.errorRate.minCalls) {
      const llmRolesWithErrors = s.by_role.filter(r => r.role !== "embeddings" && r.errors > 0).sort((a, b) => b.errors - a.errors);
      const topRole    = llmRolesWithErrors[0];
      const topRolePct = topRole && llmErrors > 0 ? Math.round((topRole.errors / llmErrors) * 100) : 0;
      const isConcentrated = topRolePct >= 60;
      let diagnostico: string;
      let accion: string;

      if (isConcentrated && topRole) {
        const rLabel   = roleLabel[topRole.role.toLowerCase()] ?? topRole.role;
        const rErrRate = Math.round((topRole.errors / topRole.calls) * 100);
        if (topRole.avg_latency_ms > 25_000) {
          diagnostico = `${rLabel} concentra el ${topRolePct}% de los errores. Latencia promedio: ${(topRole.avg_latency_ms / 1000).toFixed(0)}s — probable timeout por documentos de cliente demasiado largos.`;
          accion      = `Revisar los documentos subidos de los clientes que usan ${rLabel}. Si tienen más de 200 páginas, fragmentarlos antes de subir.`;
        } else if (topRole.avg_latency_ms < 2_000 && rErrRate > 20) {
          diagnostico = `${rLabel} falla de forma instantánea — ${rErrRate}% de error rate con ${(topRole.avg_latency_ms / 1000).toFixed(1)}s de latencia media. Un fallo sin tiempo de proceso indica rechazo por cuota de API (rate limit) o mensaje demasiado largo para el modelo.`;
          accion      = `Revisar en el panel de Anthropic si se alcanzó el límite de velocidad en los días con más errores. Si el problema persiste, pedir al consultor que divida preguntas largas en partes más pequeñas.`;
        } else if (rErrRate > 50) {
          diagnostico = `${rLabel} falla en ${rErrRate}% de sus solicitudes (${topRole.errors} errores en ${topRole.calls} llamadas). Causa probable: herramienta externa caída o prompt con error de configuración.`;
          accion      = `Verificar el estado de las herramientas en la sección Herramientas. Si están verdes, pedir al equipo técnico que revise el registro de errores filtrando por "${topRole.role}".`;
        } else {
          diagnostico = `${rLabel} concentra el ${topRolePct}% de los errores (${topRole.errors} de ${llmErrors} totales, tasa ${rErrRate}%). El resto de roles funciona bien.`;
          accion      = `Revisar si los errores de ${rLabel} ocurren con un cliente o documento específico — indicaría problema de datos, no de infraestructura.`;
        }
      } else if (llmRolesWithErrors.length > 1) {
        const rolesList = llmRolesWithErrors.slice(0, 3).map(r => `${roleLabel[r.role.toLowerCase()] ?? r.role} (${r.errors})`).join(", ");
        diagnostico = `Los errores están distribuidos entre varios roles: ${rolesList}. Cuando múltiples roles fallan al mismo tiempo, la causa suele ser externa: cuota de API agotada o fallo de herramienta compartida.`;
        accion      = `Verificar el estado de las herramientas en la sección Herramientas. Revisar si los errores se agrupan en el mismo período.`;
      } else if (topRole) {
        const rLabel = roleLabel[topRole.role.toLowerCase()] ?? topRole.role;
        diagnostico  = `Todos los errores vienen de ${rLabel} (${topRole.errors} errores en ${topRole.calls} llamadas, tasa ${Math.round((topRole.errors / topRole.calls) * 100)}%).`;
        accion       = `Revisar los últimos mensajes enviados a ${rLabel} — buscar patrón común (mismo cliente, mismo documento, misma pregunta).`;
      } else {
        diagnostico = `No se identificó un rol específico como fuente de los errores.`;
        accion      = `Pedir al equipo técnico que revise el registro de errores del período con más fallas para identificar el mensaje exacto.`;
      }

      const highRateSecondary = llmRolesWithErrors.find(r => r !== topRole && r.calls >= 5 && (r.errors / r.calls) > 0.2);
      if (highRateSecondary && isConcentrated) {
        const rLabelSec = roleLabel[highRateSecondary.role.toLowerCase()] ?? highRateSecondary.role;
        const rRateSec  = Math.round((highRateSecondary.errors / highRateSecondary.calls) * 100);
        diagnostico += ` Además, ${rLabelSec} tiene una tasa de falla del ${rRateSec}% (${highRateSecondary.errors}/${highRateSecondary.calls} llamadas) — monitorear aunque el volumen sea bajo.`;
      }

      // Agregar desglose real de tipos de error cuando hay datos suficientes
      const et = s.error_type_summary;
      const errorTotal = et.timeout + et.overloaded + et.rate_limit + et.other;
      if (errorTotal >= 3) {
        const parts: string[] = [];
        if (et.timeout    > 0) parts.push(`${et.timeout} timeout${et.timeout > 1 ? "s" : ""}`);
        if (et.overloaded > 0) parts.push(`${et.overloaded} por sobrecarga`);
        if (et.rate_limit > 0) parts.push(`${et.rate_limit} por límite de velocidad`);
        if (et.other      > 0) parts.push(`${et.other} otro${et.other > 1 ? "s" : ""}`);
        diagnostico += ` Desglose de ${errorTotal} errores registrados: ${parts.join(", ")}.`;
      }

      decisions.push({
        prioridad:     errorRate > 0.2 ? "urgente" : "importante",
        titulo:        "La IA está fallando con frecuencia",
        queMejora:     "Identificar y corregir la causa de las respuestas fallidas.",
        porQueImporta: `En los últimos 30 días, ${llmErrors} de ${numFmt.format(llmCalls)} solicitudes terminaron en error — el consultor vio una respuesta vacía o un mensaje de falla. Eso interrumpe el trabajo y genera desconfianza en la herramienta.`,
        ejemplo:       diagnostico,
        necesita:      accion,
        recomendacion: "investigar",
      });
    }

    if (!voyageActive) decisions.push({
      prioridad:     "importante",
      titulo:        "Activar búsqueda inteligente de documentos",
      queMejora:     "La IA encontraría información relevante en los documentos aunque el consultor use palabras diferentes a las del informe.",
      porQueImporta: "Hoy la búsqueda en documentos funciona por coincidencia de palabras exactas. Si el cuestionario pregunta «emisiones de carbono» y el informe del cliente dice «huella climática», la IA no los conecta.",
      ejemplo:       "Con esta mejora activa, Aurora encontraría los datos correctos aunque el consultor use terminología distinta a la del informe GRI del cliente.",
      necesita:      "Media jornada de trabajo técnico. Sin costo adicional en los primeros 100,000 búsquedas al mes.",
      recomendacion: "activar",
    });

    if (voyageActive && !rerankActive) decisions.push({
      prioridad:     "conveniente",
      titulo:        "Confirmar que la selección precisa de fragmentos está activa",
      queMejora:     "La IA recibe solo los fragmentos más útiles del documento antes de responder — menos ruido, más precisión.",
      porQueImporta: "Cuando un informe del cliente tiene 200 páginas, la búsqueda extrae múltiples fragmentos candidatos. Sin selección precisa, la IA recibe algunos irrelevantes y puede perder el dato clave.",
      ejemplo:       "En un informe de 180 páginas sobre Nuvoil, la diferencia entre recibir el fragmento correcto de la tabla GRI vs. uno genérico de la introducción.",
      necesita:      "Ya implementado — se activará automáticamente en cuanto un consultor use el chat con un cliente que tiene documentos indexados. No requiere acción adicional.",
      recomendacion: "revisar",
    });

    if (opusPct > THRESHOLDS.opusPct.pct && llmCalls >= THRESHOLDS.opusPct.minCalls) decisions.push({
      prioridad:     "conveniente",
      titulo:        `La IA de máxima capacidad se usa más de lo recomendado (${opusPct}%)`,
      queMejora:     "Reasignar algunas tareas a una IA de menor costo sin pérdida visible de calidad.",
      porQueImporta: `La IA de máxima capacidad (Elena y Reporte PDF) cuesta 5 veces más que la estándar. Con ${opusPct}% del volumen siendo Opus, hay tareas que podrían resolverse igual con una IA más económica.`,
      ejemplo:       "Si los consultores abren Elena para tareas de revisión rápida que Aurora resolvería igual de bien, el costo sube sin beneficio real.",
      necesita:      "Revisar con el equipo de consultores qué tareas usan qué rol — 1 hora de conversación.",
      recomendacion: "revisar",
    });


    if (benchmarkActive) decisions.push({
      prioridad:     "conveniente",
      titulo:        "Evitar pagar dos veces por la misma información de benchmark",
      queMejora:     "Si dos consultores consultan datos del mismo sector, la segunda respuesta se reutiliza sin cobrar.",
      porQueImporta: "Los benchmarks sectoriales (marcos GRI, ESRS, TCFD por industria) son iguales para todos los clientes del mismo giro. Hoy cada consulta llama a la IA y cobra tokens aunque la pregunta ya fue respondida antes.",
      ejemplo:       "Si esta semana 3 proyectos del sector energético generaron benchmarks, con esta mejora el segundo y tercer benchmark se responden al instante y sin costo de IA.",
      necesita:      "Medio día de trabajo técnico. Sin costo: usamos la cuenta de infraestructura que ya tenemos.",
      recomendacion: "planear",
    });

    if (cacheRatio < THRESHOLDS.cacheRatio.max && llmCalls >= THRESHOLDS.cacheRatio.minCalls) decisions.push({
      prioridad:     "conveniente",
      titulo:        `El caché de IA está poco aprovechado (hoy: ${Math.round(cacheRatio * 100)}%)`,
      queMejora:     "Más respuestas leen de caché en lugar de procesar todo de nuevo — menos costo, misma calidad.",
      porQueImporta: `El caché está en ${Math.round(cacheRatio * 100)}% cuando el objetivo es >40%. Subir al 40% ahorraría ~${usdFmt.format(costoMes * 0.25)}/mes adicional.`,
      ejemplo:       "Si Aurora procesa el mismo contexto de cliente 20 veces al mes, hoy paga 20 veces el costo completo. Con caché al 40%, paga 1 vez completo + 19 veces al 10% — ahorro del 82% en ese bloque.",
      necesita:      "Ya corregido esta semana — el orden de bloques de sistema fue ajustado. Las métricas mejorarán en los próximos 7-14 días conforme el período de 30 días avanza.",
      recomendacion: "revisar",
    });

    const sonnetModel = s.by_model.find(m => m.family === "sonnet");
    if (costoMes > THRESHOLDS.costoAiFill.usd && (sonnetModel?.calls ?? 0) >= THRESHOLDS.costoAiFill.minCalls) decisions.push({
      prioridad:     "conveniente",
      titulo:        "Reducir el costo del llenado automático del cuestionario",
      queMejora:     "Usar una IA más económica para extraer datos del informe del cliente — sin afectar la calidad de análisis.",
      porQueImporta: `El AI-fill tiene dos fases: extraer datos del informe (mecánico) y sintetizarlos (requiere criterio). Hoy ambas usan la misma IA cara. Separar la extracción reduce el costo de esa tarea hasta 40 veces.`,
      ejemplo:       `Con el volumen actual (${numFmt.format(sonnetModel?.calls ?? 0)} consultas en 30 días), el ahorro estimado sería ~${usdFmt.format(costoMes * 0.15)}/mes.`,
      necesita:      "Un día de trabajo técnico. Requiere configurar una clave de servicio adicional.",
      recomendacion: "planear",
    });

    if (s.feedback_total_down > THRESHOLDS.feedbackDown) {
      const topReason = s.feedback_top_reasons[0];
      decisions.push({
        prioridad:     s.feedback_total_down > 20 ? "importante" : "conveniente",
        titulo:        "Los consultores están rechazando respuestas con frecuencia",
        queMejora:     "Identificar qué tipo de respuesta no satisface a los consultores y ajustar las instrucciones de la IA.",
        porQueImporta: `${s.feedback_total_down} respuestas fueron calificadas negativamente en los últimos 30 días. Cada rechazo significa que el consultor tuvo que reescribir o ignorar la respuesta — tiempo perdido.`,
        ejemplo:       topReason ? `La razón más frecuente de rechazo: "${topReason.reason_code}" (${topReason.count} veces).` : undefined,
        necesita:      "Revisión de las instrucciones del rol afectado. 2–4 horas según la complejidad.",
        recomendacion: "revisar",
      });
    }
  } else {
    decisions.push(
      {
        prioridad: "importante", titulo: "Activar búsqueda inteligente de documentos",
        queMejora: "La IA encontraría información relevante en documentos aunque el consultor use palabras diferentes.",
        porQueImporta: "Hoy la búsqueda funciona solo por coincidencia exacta de palabras.",
        necesita: "Media jornada de trabajo técnico. Sin costo adicional en los primeros 100,000 búsquedas/mes.",
        recomendacion: "activar",
      },
    );
  }

  if (docStats !== null) {
    if (docStats.failed > 0) decisions.push({
      prioridad:     docStats.failed > 3 ? "urgente" : "importante",
      titulo:        `${docStats.failed} documento${docStats.failed > 1 ? "s" : ""} no se pudo${docStats.failed > 1 ? "ieron" : ""} leer — la IA los ignora`,
      queMejora:     "Recuperar el contenido de esos archivos para que la IA los use en chat y AI-fill.",
      porQueImporta: `Cuando un informe falla al leerse, el consultor cree que está disponible pero la IA lo ignora. Aurora y el AI-fill responden con datos públicos en lugar de los datos reales del cliente — sin avisar.`,
      ejemplo:       `Si el informe financiero de un cliente falló al parsearse, Rebeca no puede citar sus cifras aunque el consultor lo haya subido hace días.`,
      necesita:      "Ir al tab Documentos de cada cliente. Volver a subir en PDF plano (sin protección de contraseña). Toma 2 minutos por documento.",
      recomendacion: "investigar",
    });
    if (docStats.total === 0) decisions.push({
      prioridad:     "importante",
      titulo:        "Sin documentos del cliente — la IA trabaja solo con datos públicos",
      queMejora:     "Subir el informe de sustentabilidad del cliente multiplica la precisión del AI-fill y el chat.",
      porQueImporta: "Sin documentos, Aurora responde con benchmarks públicos y búsqueda web. Con el informe del cliente, cita cifras y compromisos reales.",
      ejemplo:       "Si el informe GRI de Nuvoil reporta 12% de reducción de emisiones, Aurora puede citarlo exactamente en lugar de usar un estimado sectorial.",
      necesita:      "El consultor sube el PDF desde el tab Documentos de cada cliente. Tarda <30 segundos. Sin costo adicional.",
      recomendacion: "activar",
    });
  }

  if (nullEmbeddings > 0) decisions.push({
    prioridad:     nullEmbeddings > 100 ? "importante" : "conveniente",
    titulo:        `${nullEmbeddings} fragmento${nullEmbeddings > 1 ? "s" : ""} de documentos sin indexar — la búsqueda puede tener huecos`,
    queMejora:     "Cuando todos los fragmentos estén indexados, Aurora puede buscar en el documento completo del cliente.",
    porQueImporta: `Hay ${nullEmbeddings} fragmento${nullEmbeddings > 1 ? "s" : ""} de documentos subidos que aún no se convirtieron en búsquedas inteligentes. El cron nocturno los procesa automáticamente — si llevan más de 24h pendientes, puede haber un problema en el proceso de indexación.`,
    ejemplo:       `Si el informe GRI de un cliente tiene fragmentos sin indexar, Aurora no puede encontrar esa información en el chat aunque el documento aparezca como "subido" en el tab Documentos.`,
    necesita:      "El cron nocturno (embed-chunks) los procesa automáticamente cada 6 horas. Si el número no baja en 24h, pedir revisión técnica.",
    recomendacion: "investigar",
  });

  const ordenPrioridad: Record<Prioridad, number> = { urgente: 0, importante: 1, conveniente: 2 };
  decisions.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);

  // ── Health checklist ──────────────────────────────────────────────────────
  const healthChecks: HealthCheck[] = s ? [
    { label: "Respuestas exitosas", status: errorRate > THRESHOLDS.errorRate.rate && llmCalls >= THRESHOLDS.errorRate.minCalls ? "rojo" : errorRate > 0.05 && llmCalls > 10 ? "amarillo" : llmCalls === 0 ? "neutral" : "verde", valor: llmCalls > 0 ? `${successRate}% (${llmErrors} fallas de ${numFmt.format(llmCalls)})` : "Sin actividad", meta: "Objetivo: >95%", trend: trendErrorRate },
    { label: "Búsqueda semántica en documentos", status: !voyageActive ? "amarillo" : nullEmbeddings > 0 ? "amarillo" : "verde", valor: voyageActive ? `Activa — ${numFmt.format(voyageCalls)} búsquedas${nullEmbeddings > 0 ? ` · ${nullEmbeddings} fragmentos sin indexar` : ""}` : "Inactiva" },
    { label: "Selección precisa de fragmentos", status: !voyageActive ? "neutral" : rerankActive ? "verde" : "amarillo", valor: !voyageActive ? "Requiere búsqueda semántica primero" : rerankActive ? "Activa" : "Lista para activar" },
    { label: "Uso de IA de máxima capacidad (Elena/Reporte)", status: llmCalls === 0 ? "neutral" : opusPct > THRESHOLDS.opusPct.pct && llmCalls >= THRESHOLDS.opusPct.minCalls ? "amarillo" : "verde", valor: llmCalls > 0 ? `${opusPct}% del volumen total` : "Sin datos", meta: `Objetivo: <${THRESHOLDS.opusPct.pct}%` },
    { label: "Velocidad de Aurora (rol más usado)", status: latenciaMs === 0 ? "neutral" : latenciaMs > THRESHOLDS.latenciaMs * 2 ? "rojo" : latenciaMs > THRESHOLDS.latenciaMs ? "amarillo" : "verde", valor: latenciaMs > 0 ? `${(latenciaMs / 1000).toFixed(1)} s` : "Sin datos", meta: `Objetivo: <${THRESHOLDS.latenciaMs / 1000}s` },
    { label: "Caché de benchmarks sectoriales", status: benchmarkCalls === 0 ? "neutral" : benchmarkCalls >= THRESHOLDS.benchmarkMin ? "amarillo" : "neutral", valor: benchmarkCalls === 0 ? "Sin estudios DM este mes" : `${benchmarkCalls} estudio${benchmarkCalls > 1 ? "s" : ""} — ${benchmarkCalls >= THRESHOLDS.benchmarkMin ? "caché pendiente de implementar" : "volumen aún bajo"}` },
    { label: "Eficiencia del caché IA", status: llmCalls < THRESHOLDS.cacheRatio.minCalls ? "neutral" : cacheRatio >= 0.40 ? "verde" : cacheRatio >= THRESHOLDS.cacheRatio.max ? "amarillo" : "rojo", valor: cacheRatio > 0 ? `${Math.round(cacheRatio * 100)}% — ~${usdFmt.format(cacheSavingsUsd)} ahorrados` : "Sin datos", meta: "Objetivo: >40%", trend: trendCacheRatio },
    { label: "Satisfacción de consultores", status: s.feedback_total_down > THRESHOLDS.feedbackDown ? "rojo" : s.feedback_total_down > 10 ? "amarillo" : "verde", valor: s.feedback_total_down === 0 ? "Sin rechazos registrados" : `${s.feedback_total_down} respuesta${s.feedback_total_down > 1 ? "s" : ""} rechazada${s.feedback_total_down > 1 ? "s" : ""}`, meta: `Objetivo: <${THRESHOLDS.feedbackDown} rechazos/mes` },
  ] : [];

  // ── Alertas de costo (solo Métricas) ─────────────────────────────────────
  const costAlerts: CostAlert[] = s ? (() => {
    const alerts: CostAlert[] = [];
    if (s.cost_usd_estimate_max > COST_ALERT_THRESHOLD_USD) alerts.push({ tone: "danger", title: `Gasto IA supera $${COST_ALERT_THRESHOLD_USD} USD/mes`, detail: `Gasto actual: $${s.cost_usd_estimate_max.toFixed(2)} (últimos 30 días). Revisa la tabla "Gasto por modelo" para ver qué modelo domina y migrar tareas rutinarias a Haiku.` });
    if (opusModel && s.cost_usd_estimate_max > 0) {
      const pctOpus = (opusModel.cost_usd / s.cost_usd_estimate_max) * 100;
      if (pctOpus >= OPUS_DOMINANCE_THRESHOLD_PCT) alerts.push({ tone: "warn", title: `Opus consume ${Math.round(pctOpus)}% del gasto IA`, detail: `Opus es el modelo más caro. Solo Elena (insights estratégicos) y reportes finales lo justifican. Si otras tareas lo usan, considera migrar a Sonnet o Haiku.` });
    }
    return alerts;
  })() : [];

  // ── Estilos por prioridad ────────────────────────────────────────────────
  const prioridadStyle: Record<Prioridad, { badge: string; border: string }> = {
    urgente:     { badge: "bg-rose-100 text-rose-800",   border: "border-l-rose-400"  },
    importante:  { badge: "bg-amber-100 text-amber-800", border: "border-l-amber-400" },
    conveniente: { badge: "bg-slate-100 text-slate-600", border: "border-l-slate-300" },
  };

  // Links destino por recomendación — "investigar" apunta al tab Métricas en la misma página
  const recLinks: Partial<Record<Decision["recomendacion"], string>> = {
    investigar: "?tab=metricas",
    activar:    "/configuracion/herramientas",
    revisar:    "/configuracion/prompts",
  };
  const recLabel: Record<Decision["recomendacion"], string> = {
    activar: "Activar pronto", revisar: "Revisar con el equipo", planear: "Planear", investigar: "Ver métricas detalladas",
  };
  const recSvg: Record<Decision["recomendacion"], ReactNode> = {
    activar: <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>,
    revisar: <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>,
    planear: <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
    investigar: <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>,
  };

  // ── JSX: Tab "Salud y decisiones" ─────────────────────────────────────────
  const saludContent = (
    <div className="px-8 py-6 max-w-4xl">

      {/* Encabezado */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Monitoreo IA</p>
        <p className="text-xs text-slate-600 leading-relaxed">
          Salud del sistema, costos y decisiones concretas de mejora — basado en los últimos 30 días de uso real.
        </p>
      </div>

      {/* Estado general */}
      <div className={`flex items-start gap-3 border ${sc.border} ${sc.bg} rounded-lg px-4 py-3 mb-6`}>
        <span className={`w-3 h-3 rounded-full ${sc.dot} shrink-0 mt-1`} />
        <div>
          <p className={`text-sm font-bold ${sc.text}`}>{semaforoLabel[semaforo]}</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${sc.text} opacity-90`}>{semaforoDesc}</p>
        </div>
      </div>

      {/* Health checklist */}
      {healthChecks.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Qué vigila la auditoría</p>
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <table className="min-w-full w-max text-xs">
              <tbody className="divide-y divide-slate-50">
                {healthChecks.map((h) => {
                  const hs = HEALTH_STYLE[h.status];
                  return (
                    <tr key={h.label} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 w-5"><span className={`inline-block w-2 h-2 rounded-full ${hs.dot}`} /></td>
                      <td className="px-2 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{h.label}</td>
                      <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                        {h.valor}
                        {h.trend && (
                          <span className={`ml-2 text-[10px] font-semibold ${h.trend.arrow === "→" ? "text-slate-400" : h.trend.improving ? "text-emerald-600" : "text-rose-600"}`}>
                            {h.trend.arrow} {h.trend.delta}
                          </span>
                        )}
                        {h.meta && <span className="ml-2 text-[10px] text-slate-400 italic">{h.meta}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${hs.badge}`}>{hs.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decisiones disponibles */}
      <div className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Decisiones disponibles</p>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          Cada tarjeta describe una mejora concreta: qué cambia, por qué importa y qué se necesita para activarla.
          Están ordenadas por prioridad basada en los datos de los últimos 30 días.{" "}
          <a href="?tab=metricas" className="text-brand-primary text-xs hover:underline underline-offset-2">
            Ver métricas detalladas →
          </a>
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {decisions.map((d, i) => {
            const ps = prioridadStyle[d.prioridad];
            const isLastOdd = decisions.length % 2 !== 0 && i === decisions.length - 1;
            return (
              <div key={i} className={`bg-white border border-l-4 ${ps.border} border-slate-200 rounded-lg p-5${isLastOdd ? " lg:col-span-2" : ""}`}>
                <div className="flex flex-wrap items-start gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${ps.badge}`}>{d.prioridad}</span>
                  <p className="text-sm font-bold text-slate-900 leading-snug flex-1">{d.titulo}</p>
                </div>
                <p className="text-xs font-semibold text-slate-700 mb-0.5">¿Qué mejora?</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{d.queMejora}</p>
                <p className="text-xs font-semibold text-slate-700 mb-0.5">¿Por qué importa?</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{d.porQueImporta}</p>
                {d.ejemplo && (
                  <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Ejemplo</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.ejemplo}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Lo que se necesita</p>
                    <p className="text-[11px] text-slate-600">{d.necesita}</p>
                  </div>
                  {recLinks[d.recomendacion] ? (
                    <a href={recLinks[d.recomendacion]} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary bg-brand-primary-light border border-brand-primary/20 px-2 py-1 rounded-sm whitespace-nowrap hover:underline underline-offset-2">
                      {recSvg[d.recomendacion]}
                      {recLabel[d.recomendacion]}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-sm whitespace-nowrap">
                      {recSvg[d.recomendacion]}
                      {recLabel[d.recomendacion]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Uso por rol — resumen en lenguaje de negocio */}
      {s && s.by_role.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Cómo se usó cada rol IA — últimos 30 días</p>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">Cuántas veces usó el equipo cada asistente, qué tan rápido respondió y si hubo fallas.</p>
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full w-max text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left">Rol</th>
                    <th className="px-4 py-2.5 text-right">Veces usado</th>
                    <th className="px-4 py-2.5 text-right">Velocidad promedio</th>
                    <th className="px-4 py-2.5 text-right">Costo</th>
                    <th className="px-4 py-2.5 text-right">Fallas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {s.by_role.filter(r => r.role !== "embeddings").map((r) => {
                    const roleErr     = r.errors;
                    const roleErrRate = r.calls > 0 ? roleErr / r.calls : 0;
                    const label       = roleLabel[r.role.toLowerCase()] ?? r.role;
                    return (
                      <tr key={r.role} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{label}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.calls)} veces</td>
                        <td
                          className="px-4 py-2.5 text-right text-slate-600"
                          title={r.avg_latency_ms > 15_000 ? "Sonnet responde más lento en textos largos — es normal. Si supera los 30 s con frecuencia, divide los documentos del cliente en partes más pequeñas antes de subirlos." : undefined}
                        >
                          {r.avg_latency_ms > 0 ? latenciaLabel(r.avg_latency_ms) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${roleErrRate > 0.05 ? "text-rose-600" : "text-slate-400"}`}>
                          {roleErr > 0 ? `${roleErr} (${Math.round(roleErrRate * 100)}%)` : "Ninguna"}
                        </td>
                      </tr>
                    );
                  })}
                  {s.by_role.some(r => r.role === "embeddings") && (
                    <>
                      <tr>
                        <td colSpan={5} className="px-4 pt-3 pb-1">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-t border-slate-100 pt-2">
                            Proceso automático — indexación nocturna (cron, no es un consultor)
                          </p>
                        </td>
                      </tr>
                      {s.by_role.filter(r => r.role === "embeddings").map((r) => (
                        <tr key={r.role} className="opacity-60 bg-slate-50/60">
                          <td className="px-4 py-2.5 font-semibold text-indigo-700">
                            {roleLabel[r.role.toLowerCase()] ?? r.role}
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">(Voyage · cron)</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.calls)} veces</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{r.avg_latency_ms > 0 ? latenciaLabel(r.avg_latency_ms) : "—"}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums" title="Errores del cron — no afectan el chat de consultores">
                            {r.errors > 0 ? <span>{r.errors} <span className="text-[10px]">(cron)</span></span> : "—"}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Costo por etapa */}
      {s && s.by_stage.length > 0 && (() => {
        const stageLabel: Record<string, string> = {
          chat: "Chat con los 4 roles", dm_referentes: "DM — Referentes ESG",
          dm_benchmark_empresas: "DM — Propuesta de empresas", dm_benchmark: "DM — Comparativa benchmark",
          dm_benchmark_company_iros: "DM — IROs por empresa", dm_iros: "DM — IROs del cliente",
          dm_resumen: "DM — Resumen ejecutivo", dm_report: "DM — Reporte PDF",
          ai_fill: "Cuestionario — AI-fill", doc_fill: "Cuestionario — Doc-fill",
          research_reports: "Búsqueda de informes", extract_profile: "Extracción de perfil",
          embeddings: "Indexación de documentos", rerank: "Reranking semántico",
        };
        const DM_STAGES   = new Set(["dm_referentes","dm_benchmark_empresas","dm_benchmark","dm_benchmark_company_iros","dm_iros","dm_resumen","dm_report"]);
        const dmStages    = s.by_stage.filter(st => DM_STAGES.has(st.stage));
        const otherStages = s.by_stage.filter(st => !DM_STAGES.has(st.stage));
        const dmCost      = dmStages.reduce((a, st) => a + st.cost_usd, 0);
        const dmCalls     = dmStages.reduce((a, st) => a + st.calls, 0);
        const totalCost   = s.by_stage.reduce((a, st) => a + st.cost_usd, 0);
        const dmPct       = totalCost > 0 ? Math.round((dmCost / totalCost) * 100) : 0;

        const StageRow = ({ st }: { st: typeof s.by_stage[0] }) => {
          const errRate = st.calls > 0 ? st.errors / st.calls : 0;
          return (
            <tr className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-800">{stageLabel[st.stage] ?? st.stage}</td>
              <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{numFmt.format(st.calls)}</td>
              <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{usdFmt.format(st.cost_usd)}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{st.avg_latency_ms > 0 ? latenciaLabel(st.avg_latency_ms) : "—"}</td>
              <td className={`px-4 py-2.5 text-right font-medium ${errRate > 0.05 ? "text-rose-600" : "text-slate-400"}`}>{st.errors > 0 ? `${st.errors} (${Math.round(errRate * 100)}%)` : "Ninguna"}</td>
            </tr>
          );
        };
        const tableHead = (
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
              <th className="px-4 py-2.5 text-left">Etapa</th>
              <th className="px-4 py-2.5 text-right">Llamadas</th>
              <th className="px-4 py-2.5 text-right">Costo total</th>
              <th className="px-4 py-2.5 text-right">Velocidad promedio</th>
              <th className="px-4 py-2.5 text-right">Fallas</th>
            </tr>
          </thead>
        );

        return (
          <div className="mb-8">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Costo y velocidad por etapa — últimos 30 días</p>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">Qué parte del flujo consume más presupuesto. Útil para priorizar dónde optimizar.</p>
            {dmStages.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">Doble Materialidad IA</p>
                  <span className="text-[10px] text-slate-400 tabular-nums">{numFmt.format(dmCalls)} llamadas · {usdFmt.format(dmCost)} · {dmPct}% del costo total</span>
                </div>
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full w-max text-xs">{tableHead}
                      <tbody className="divide-y divide-slate-50">{dmStages.map(st => <StageRow key={st.stage} st={st} />)}</tbody>
                      {dmStages.length > 1 && (
                        <tfoot>
                          <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
                            <td className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500">Total DM-IA</td>
                            <td className="px-4 py-2 text-right tabular-nums">{numFmt.format(dmCalls)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-brand-primary">{usdFmt.format(dmCost)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}
            {otherStages.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Chat y otras funciones</p>
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full w-max text-xs">{tableHead}
                      <tbody className="divide-y divide-slate-50">{otherStages.map(st => <StageRow key={st.stage} st={st} />)}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-2">Solo se muestran etapas con actividad en los últimos 30 días.</p>
          </div>
        );
      })()}

      {/* Qué IA se usa en cada tarea — FIX: whitespace-normal en columna "por qué" */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Qué IA se usa en cada tarea y por qué</p>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">Cada tarea usa el tipo de IA adecuado a su complejidad — no siempre la más potente es la mejor opción.</p>
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Tarea</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Tipo de IA</th>
                  <th className="px-4 py-2.5 text-left min-w-[220px]">Por qué esta y no otra</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { tarea: "Aurora — redactar borrador",          tipo: "IA estándar",                       porque: "Necesita velocidad y calidad narrativa, sin el costo de la IA de máxima capacidad.",                          estado: "Activo" },
                  { tarea: "Rebeca — revisar y detectar fallas",  tipo: "IA estándar",                       porque: "Un checklist estructurado no requiere el modelo más caro — Rebeca verifica, no crea.",                        estado: "Activo" },
                  { tarea: "Elena — elevar al estratégico",       tipo: "IA de máxima capacidad",            porque: "Los insights de negocio, trade-offs y narrativa ejecutiva requieren el razonamiento más profundo.",             estado: "Activo" },
                  { tarea: "Valeria — validar entregable",        tipo: "IA ligera",                         porque: "Verificar listas de criterios no requiere narrativa — una IA más simple lo hace igual de bien a menor costo.", estado: "Activo" },
                  { tarea: "AI-fill — rellenar cuestionario",     tipo: "IA estándar",                       porque: "Combina extracción de datos con síntesis contextual. Hay potencial de usar IA más económica en extracción pura.", estado: "Activo" },
                  { tarea: "Benchmark de empresas",               tipo: "IA estándar",                       porque: "Proponer empresas comparables y generar narrativa de brechas y fortalezas.",                                   estado: "Activo" },
                  { tarea: "IROs — inventario de impactos",       tipo: "IA estándar",                       porque: "Análisis ESG con scores de impacto financiero y de negocio.",                                                 estado: "Activo" },
                  { tarea: "Resumen ejecutivo",                   tipo: "IA estándar",                       porque: "El consultor necesita el resultado de inmediato — no puede esperar un procesamiento en segundo plano.",        estado: "Activo" },
                  { tarea: "Reporte PDF final",                   tipo: "IA de máxima capacidad",            porque: "Es el entregable al cliente — requiere la máxima calidad narrativa y análisis.",                              estado: "Activo" },
                  { tarea: "Búsqueda en documentos del cliente",  tipo: "Búsqueda semántica (Voyage AI)",    porque: "Usa vectores semánticos para encontrar fragmentos relevantes aunque se usen sinónimos o términos distintos al informe.", estado: "Activo" },
                  { tarea: "Extracción de datos AI-fill",         tipo: "IA económica (propuesto)",          porque: "Solo extrae datos sin interpretarlos — una IA más económica hace el mismo trabajo a 40× menor costo.",        estado: "Propuesto" },
                  { tarea: "Reporte PDF en segundo plano",        tipo: "Procesamiento diferido (Batch API)", porque: "El consultor no espera bloqueado — el reporte se genera en segundo plano al 50% del costo. Ya activo.",        estado: "Activo" },
                ].map((row) => {
                  const estadoColor = row.estado === "Activo" ? "text-emerald-700" : row.estado === "Parcial" ? "text-amber-700" : "text-slate-400";
                  return (
                    <tr key={row.tarea} className={`hover:bg-slate-50 ${row.estado === "Propuesto" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{row.tarea}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{row.tipo}</td>
                      <td className="px-4 py-2.5 text-slate-500 leading-relaxed">{row.porque}</td>
                      <td className={`px-4 py-2.5 text-right font-medium whitespace-nowrap ${estadoColor}`}>{row.estado}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Para el detalle técnico:{" "}
          <a href="/configuracion/flujos-ia" className="text-brand-primary underline underline-offset-2">Flujos IA →</a>
          {" · "}
          <a href="/configuracion/herramientas" className="text-brand-primary underline underline-offset-2">Herramientas →</a>
        </p>
      </div>
    </div>
  );

  // ── JSX: Tab "Métricas detalladas" ────────────────────────────────────────
  const metricasContent = (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      {/* Alertas de costo */}
      {costAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {costAlerts.map((a, i) => (
            <div key={i} role="alert" className={`border-l-4 rounded-r p-3 ${a.tone === "danger" ? "border-l-rose-500 bg-rose-50 text-rose-900" : "border-l-amber-500 bg-amber-50 text-amber-900"}`}>
              <p className="text-sm font-bold flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5l7 13H1l7-13zM8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" /></svg>
                {a.title}
              </p>
              <p className="text-xs mt-1 leading-relaxed">{a.detail}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-slate-600 mb-4 inline-flex flex-wrap items-center gap-1.5">
        Uso de los 4 roles IA en los últimos 30 días.
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold cursor-help" title="Costo real por modelo (Haiku $0.25/$1.25, Sonnet $3/$15, Opus $5/$25, Voyage $0.10/$0 por 1M tokens). Cache hits reducen ~90% el costo de input." aria-label="Más información sobre el cálculo de costo">ⓘ</span>
      </p>

      {!s ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">Error al cargar. Revisa los registros del servidor.</div>
      ) : (
        <>
          {/* KPI cards */}
          {(() => {
            const byDay = new Map<string, { calls: number; cost: number; cache: number; errors: number }>();
            for (const r of s.by_day_role) {
              const k   = r.day.slice(0, 10);
              const acc = byDay.get(k) ?? { calls: 0, cost: 0, cache: 0, errors: 0 };
              acc.calls  += r.calls;
              acc.cache  += r.total_cache_hits;
              acc.errors += r.errors;
              acc.cost   += (r.total_input_tokens * 3 + r.total_output_tokens * 15) / 1_000_000;
              byDay.set(k, acc);
            }
            const sortedDays  = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            const callsSeries = sortedDays.map(([, v]) => v.calls);
            const costSeries  = sortedDays.map(([, v]) => v.cost);
            const cacheSeries = sortedDays.map(([, v]) => v.cache);
            const errorSeries = sortedDays.map(([, v]) => v.errors);
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <Metric label="Llamadas" value={numFmt.format(s.total_calls)} hint={llmCalls > 0 && voyageCalls > 0 ? `${numFmt.format(llmCalls)} del equipo · ${numFmt.format(voyageCalls)} indexación` : s.avg_latency_ms > 0 ? `Latencia promedio: ${(s.avg_latency_ms / 1000).toFixed(1)} s` : undefined} spark={callsSeries} sparkColor="#0f766e" />
                <Metric label="Costo estimado" value={usdFmt.format(s.cost_usd_estimate_max)} spark={costSeries} sparkColor="#7c3aed" />
                <Metric label="Hits de caché" value={s.total_input_tokens > 0 ? `${Math.round((s.total_cache_read_tokens / (s.total_input_tokens + s.total_cache_read_tokens)) * 100)}%` : "—"} hint={`${numFmt.format(s.total_cache_read_tokens)} tokens ahorrados`} spark={cacheSeries} sparkColor="#0891b2" />
                <Metric label="Errores de consultores" value={String(llmErrors)} tone={llmErrors > 0 ? "red" : "ok"} hint={voyageSystemErrors > 0 ? `${voyageSystemErrors} automáticos del cron (no afectan consultores)` : llmErrors === 0 ? "Sin errores en el período" : undefined} spark={errorSeries} sparkColor={llmErrors > 0 ? "#be123c" : "#94a3b8"} />
              </div>
            );
          })()}

          {/* Gasto por modelo */}
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
                      const mPct   = s.cost_usd_estimate_max > 0 ? Math.round((m.cost_usd / s.cost_usd_estimate_max) * 100) : 0;
                      const label  = m.family === "haiku" ? "Haiku (barato)" : m.family === "sonnet" ? "Sonnet (medio)" : m.family === "opus" ? "Opus (caro)" : m.family === "voyage" ? "Voyage (embeddings)" : "Otro";
                      const tone   = m.family === "haiku" ? "text-emerald-700" : m.family === "opus" ? "text-rose-700" : m.family === "voyage" ? "text-indigo-700" : "text-slate-700";
                      return (
                        <tr key={m.family}>
                          <td className={`py-1.5 font-semibold ${tone}`}>{label}</td>
                          <td className="py-1.5 text-right text-slate-900 tabular-nums">{numFmt.format(m.calls)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(m.input_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(m.output_tokens)}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{usdFmt.format(m.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{mPct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2">Haiku = ~12× más barato que Sonnet. Si Sonnet/Opus dominan llamadas rutinarias (extracción, validación), revisa si pueden migrar a Haiku.</p>
              </Panel>
            </div>
          )}

          {/* Uso por rol — FIX: sin T. ENTRADA / T. SALIDA */}
          {s.by_role.length > 0 && (
            <div className="mb-6">
              <Panel title="Uso por rol IA (últimos 30 días)">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      <th className="pb-1.5 text-left">Rol</th>
                      <th className="pb-1.5 text-right">Llamadas</th>
                      <th className="pb-1.5 text-right">Costo</th>
                      <th className="pb-1.5 text-right">% costo</th>
                      <th className="pb-1.5 text-right" title="Latencia total promedio (request → finalMessage)">Latencia</th>
                      <th className="pb-1.5 text-right" title="Tiempo al primer token (usuario ve la primera letra)">TTFT</th>
                      <th className="pb-1.5 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.by_role.filter(r => r.role !== "embeddings").map((r) => {
                      const rPct = s.cost_usd_estimate_max > 0 ? Math.round((r.cost_usd / s.cost_usd_estimate_max) * 100) : 0;
                      const ROLE_LABELS: Record<string, { name: string; model: string }> = {
                        aurora:  { name: "Aurora · Autor",      model: "Sonnet" },
                        rebeca:  { name: "Rebeca · Revisor",    model: "Sonnet" },
                        elena:   { name: "Elena · Elevador",    model: "Opus"   },
                        valeria: { name: "Valeria · Validador", model: "Haiku"  },
                      };
                      const meta = ROLE_LABELS[r.role] ?? { name: r.role, model: "—" };
                      return (
                        <tr key={r.role}>
                          <td className="py-1.5 font-semibold text-slate-800">{meta.name}<span className="ml-1.5 text-[10px] font-normal text-slate-500">({meta.model})</span></td>
                          <td className="py-1.5 text-right text-slate-900 tabular-nums">{numFmt.format(r.calls)}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{rPct}%</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{(r.avg_latency_ms / 1000).toFixed(1)}s</td>
                          <td className="py-1.5 text-right text-slate-500 tabular-nums">{r.avg_ttft_ms > 0 ? `${(r.avg_ttft_ms / 1000).toFixed(1)}s` : "—"}</td>
                          <td className={`py-1.5 text-right tabular-nums ${r.errors > 0 ? "text-rose-700" : "text-slate-400"}`}>{r.errors > 0 ? r.errors : "—"}</td>
                        </tr>
                      );
                    })}
                    {s.by_role.some(r => r.role === "embeddings") && (
                      <tr>
                        <td colSpan={7} className="pt-3 pb-1 px-0">
                          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-t border-slate-100 pt-2">
                            Proceso automático — indexación de documentos (cron nocturno, no es un consultor)
                          </p>
                        </td>
                      </tr>
                    )}
                    {s.by_role.filter(r => r.role === "embeddings").map((r) => {
                      const rPct = s.cost_usd_estimate_max > 0 ? Math.round((r.cost_usd / s.cost_usd_estimate_max) * 100) : 0;
                      return (
                        <tr key={r.role} className="opacity-60">
                          <td className="py-1.5 font-semibold text-indigo-700">Búsqueda semántica<span className="ml-1.5 text-[10px] font-normal text-slate-400">(Voyage · cron)</span></td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{numFmt.format(r.calls)}</td>
                          <td className="py-1.5 text-right text-slate-600 font-medium tabular-nums">{usdFmt.format(r.cost_usd)}</td>
                          <td className="py-1.5 text-right text-slate-600 tabular-nums">{rPct}%</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">—</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums">—</td>
                          <td className="py-1.5 text-right text-slate-400 tabular-nums" title="Errores del cron — no afectan el chat de consultores">
                            {r.errors > 0 ? <span>{r.errors} <span className="text-[10px]">(cron)</span></span> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  Elena genera pocas respuestas pero costosas (análisis estratégico). Valeria genera muchas respuestas baratas (validación de listas). Aurora y Rebeca dominan el volumen — son la cadena principal de trabajo.
                </p>
              </Panel>
            </div>
          )}

          {/* Razones de rechazo por cliente */}
          {s.feedback_by_client.length > 0 && (
            <div className="mb-6">
              <Panel title="Razones de rechazo IA por cliente">
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">Top 5 clientes con más rechazos. Útil para identificar si la IA falla más con sectores específicos.</p>
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
                      const REASON_LABELS: Record<string, string> = { factually_wrong: "Datos incorrectos", sector_off: "Sector equivocado", bad_format: "Mal formato", language: "Idioma raro", too_generic: "Muy genérico", missed_context: "Ignoró contexto", other: "Otro" };
                      return (
                        <tr key={c.client_id}>
                          <td className="py-1.5 font-medium text-slate-800">{c.client_name ?? <span className="font-mono text-slate-500 text-[10px]">{c.client_id.slice(0, 8)}…</span>}</td>
                          <td className="py-1.5 text-right text-slate-900 font-bold tabular-nums">{c.total}</td>
                          <td className="py-1.5 pl-4">
                            <div className="flex flex-wrap gap-1">
                              {c.top_reasons.map((r, idx) => (
                                <span key={idx} className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-sm">
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
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">Cada rechazo se inyecta al system prompt del rol + cliente correspondiente como ejemplo a evitar.</p>
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
                      const rPct = Math.round((r.count / s.feedback_total_down) * 100);
                      const reasonLabel = ({ factually_wrong: "Datos incorrectos", sector_off: "Sector equivocado", bad_format: "Mal formato", language: "Idioma raro", too_generic: "Muy genérico", missed_context: "Ignoró contexto", other: "Otro" } as Record<string, string>)[r.reason_code] ?? r.reason_code;
                      return (
                        <tr key={i}>
                          <td className="py-1.5 font-medium text-slate-800">{r.role.charAt(0).toUpperCase() + r.role.slice(1)}</td>
                          <td className="py-1.5 text-slate-700">{reasonLabel}</td>
                          <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{r.count}</td>
                          <td className="py-1.5 text-right text-slate-500 tabular-nums">{rPct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
            </div>
          )}

          {/* Top consultores / Top clientes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Panel title="Top consultores">
              {realTopUsers.length === 0 ? <Empty /> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold"><th className="pb-1.5 text-left">Consultor</th><th className="pb-1.5 text-right">Llamadas</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {realTopUsers.map(u => <tr key={u.user_email}><td className="py-1.5 font-mono text-slate-700">{u.user_email}</td><td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{u.calls}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel title="Costo IA por cliente (últimos 30 días)">
              {(s.by_client ?? []).length === 0 ? <Empty text="Sin datos de clientes en el período." /> : (
                <table className="w-full text-xs">
                  <thead><tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    <th className="pb-1.5 text-left">Cliente</th>
                    <th className="pb-1.5 text-right">Llamadas</th>
                    <th className="pb-1.5 text-right">Costo USD</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(s.by_client ?? []).map(c => (
                      <tr key={c.client_id}>
                        <td className="py-1.5 text-slate-700">{c.client_name ?? <span className="text-slate-400 italic">Sin nombre</span>}</td>
                        <td className="py-1.5 text-right text-slate-600 tabular-nums">{c.calls}</td>
                        <td className="py-1.5 text-right text-slate-900 font-medium tabular-nums">{usdFmt.format(c.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          {/* Llamadas diarias */}
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
                      <th className="py-2 pr-3 text-right">Caché</th>
                      <th className="py-2 pr-3 text-right">Latencia (s)</th>
                      <th className="py-2 pr-3 text-right">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {s.by_day_role.map((r, i) => {
                      const isEmbed = r.role === "embeddings";
                      return (
                        <tr key={i} className={isEmbed ? "opacity-60" : ""}>
                          <td className="py-1.5 pr-3 text-slate-600">{new Date(r.day).toLocaleDateString("es-MX", { month: "short", day: "numeric" })}</td>
                          <td className="py-1.5 pr-3 font-medium text-slate-800">{r.role.charAt(0).toUpperCase() + r.role.slice(1)}</td>
                          <td className="py-1.5 pr-3 text-right">{numFmt.format(r.calls)}</td>
                          <td className="py-1.5 pr-3 text-right text-brand-primary-hover">{numFmt.format(r.total_cache_hits)}</td>
                          <td className="py-1.5 pr-3 text-right text-slate-600">{(r.avg_latency_ms / 1000).toFixed(1)} s</td>
                          <td className={`py-1.5 pr-3 text-right ${r.errors > 0 && !isEmbed ? "text-red-700" : "text-slate-600"}`}>{r.errors}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {/* Herramientas externas */}
      <div className="mt-8 mb-6">
        <Panel title="Costo de herramientas conectadas">
          <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">Servicios externos que procesan documentos. Se cobran por uso — no por mes.</p>
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
              <tr><td className="py-1.5 font-semibold text-indigo-700">Voyage AI</td><td className="py-1.5 text-slate-600">Por millón de tokens (fragmentos de documentos)</td><td className="py-1.5 text-right text-slate-900 tabular-nums">$0.10 / 1M tokens</td><td className="py-1.5 text-right text-emerald-700 tabular-nums">200M tokens/mes</td></tr>
              <tr><td className="py-1.5 font-semibold text-amber-700">LlamaParse</td><td className="py-1.5 text-slate-600">Por página de PDF procesada (1 vez por informe)</td><td className="py-1.5 text-right text-slate-900 tabular-nums">$3.00 / 1k páginas</td><td className="py-1.5 text-right text-emerald-700 tabular-nums">10,000 páginas</td></tr>
              <tr><td className="py-1.5 font-semibold text-rose-700">Mistral OCR</td><td className="py-1.5 text-slate-600">Por página (fallback de LlamaParse, batch más barato)</td><td className="py-1.5 text-right text-slate-900 tabular-nums">$1.00 / 1k páginas</td><td className="py-1.5 text-right text-slate-400 tabular-nums">Sin free tier</td></tr>
              <tr><td className="py-1.5 font-semibold text-teal-700">QStash</td><td className="py-1.5 text-slate-600">Por mensaje despachado (1 empresa = 1 mensaje/día)</td><td className="py-1.5 text-right text-slate-900 tabular-nums">$1.00 / 100k msgs</td><td className="py-1.5 text-right text-emerald-700 tabular-nums">1,000 msgs/día</td></tr>
            </tbody>
          </table>
          <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
            Estimado piloto (10 clientes, 8 competidoras c/u, reportes ~100 pág): LlamaParse ~8,000 páginas = <span className="font-semibold text-slate-700">gratis</span> · QStash ~80 msgs/día = <span className="font-semibold text-slate-700">gratis</span> · Voyage AI = <span className="font-semibold text-slate-700">gratis</span>. Costo variable total estimado: <span className="font-semibold text-slate-700">$0 en el piloto</span>.
          </p>
        </Panel>
      </div>

      {/* Documentos del cliente */}
      <div className="mt-8">
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Documentos del cliente — base de toda la IA</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">La calidad de las respuestas IA depende directamente de los documentos subidos.</p>
        </div>
        {docs && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <DocStat label="Total documentos"         value={numFmt.format(docs.total)} />
              <DocStat label="Últimos 7 días"           value={numFmt.format(docs.recent_count)} />
              <DocStat label="Informe sustentabilidad"  value={numFmt.format(docs.by_kind.sustainability_report)} tone="emerald" />
              <DocStat label="Informe financiero"       value={numFmt.format(docs.by_kind.financial_report)}      tone="amber" />
              <DocStat label="Documentos generales"     value={numFmt.format(docs.by_kind.general)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <DocStat label="Leídos correctamente"  value={numFmt.format(docs.by_parse_status.ok)}      tone="emerald" />
              <DocStat label="En proceso"            value={numFmt.format(docs.by_parse_status.pending)} />
              <DocStat label="Con error de lectura"  value={numFmt.format(docs.by_parse_status.failed)}  tone={docs.by_parse_status.failed > 0 ? "rose" : "neutral"} />
              <DocStat label="Espacio usado"         value={`${(docs.total_bytes / 1024 / 1024).toFixed(1)} MB`} />
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

  return <MonitoreoIaTabs salud={saludContent} metricas={metricasContent} />;
}
