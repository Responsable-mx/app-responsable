import type { Metadata } from "next";
import { getUsageSummary } from "@/lib/ai/usage";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Auditoría IA · Configuración · App ResponSable",
};
export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Prioridad = "urgente" | "importante" | "conveniente";

type Decision = {
  prioridad: Prioridad;
  titulo: string;
  queMejora: string;
  porQueImporta: string;
  ejemplo?: string;
  necesita: string;
  recomendacion: "activar" | "revisar" | "planear" | "investigar";
};

// ── Page ──────────────────────────────────────────────────────────────────────

async function getDocStats() {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("client_documents").select("parse_status");
    if (error) return null;
    const rows = data ?? [];
    return {
      total: rows.length,
      failed: rows.filter(r => r.parse_status === "failed").length,
      pending: rows.filter(r => r.parse_status === "pending").length,
    };
  } catch { return null; }
}

export default async function AuditoriaIaPage() {
  const [usage, docStats] = await Promise.all([
    getUsageSummary(30).catch(() => null),
    getDocStats(),
  ]);

  // Métricas derivadas
  const voyageModel  = usage?.by_model.find(m => m.family === "voyage");
  const voyageCalls  = voyageModel?.calls ?? 0;
  const llmCalls     = (usage?.total_calls ?? 0) - voyageCalls;
  const llmModels    = (usage?.by_model ?? []).filter(m => m.family !== "voyage");
  // LLM-only errors: excluye embeddings/voyage para que errorRate no supere 100%
  const llmErrors    = (usage?.by_role ?? [])
    .filter(r => r.role !== "embeddings")
    .reduce((sum, r) => sum + r.errors, 0);
  const errorRate    = llmCalls > 0 ? llmErrors / llmCalls : 0;
  const successRate  = Math.max(0, 100 - Math.round(errorRate * 100));
  const opusModel    = usage?.by_model.find(m => m.family === "opus");
  const opusPct      = pct(opusModel?.calls ?? 0, llmCalls);
  const cacheRatio   = usage && (usage.total_input_tokens + usage.total_cache_read_tokens) > 0
    ? usage.total_cache_read_tokens / (usage.total_input_tokens + usage.total_cache_read_tokens) : 0;
  const voyageActive = voyageCalls > 100;
  const latenciaMs   = usage?.avg_latency_ms ?? 0;
  const costoMes     = usage?.cost_usd_estimate_max ?? 0;

  // Semáforo de salud general
  const semaforo: "verde" | "amarillo" | "rojo" =
    errorRate > 0.2 || costoMes > 100 ? "rojo"
    : errorRate > 0.05 || !voyageActive || opusPct > 40 ? "amarillo"
    : "verde";

  const semaforoLabel = {
    verde:    "Sistema funcionando bien",
    amarillo: "Mejoras disponibles",
    rojo:     "Requiere atención",
  };
  const semaforoColor = {
    verde:    { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-800" },
    amarillo: { bg: "bg-amber-50",   border: "border-amber-200",   dot: "bg-amber-400",   text: "text-amber-800"   },
    rojo:     { bg: "bg-rose-50",    border: "border-rose-200",    dot: "bg-rose-500",    text: "text-rose-800"    },
  };
  const sc = semaforoColor[semaforo];

  // Ahorro real de caché: tokens que habrían costado precio completo pero se leyeron de caché
  // Sonnet: $3 input vs $0.30 cache read → ahorro $2.70 por 1M tokens reutilizados
  const cacheSavingsUsd = usage
    ? Number((usage.total_cache_read_tokens * 2.7 / 1_000_000).toFixed(2))
    : 0;

  // Descripción del estado en lenguaje simple
  const semaforoDesc =
    semaforo === "rojo"
      ? `La IA falló en ${Math.round(errorRate * 100)}% de las respuestas — esto afecta directamente a los consultores. Es necesario investigar la causa antes de seguir usando el sistema.`
      : semaforo === "amarillo"
      ? `La IA funciona correctamente pero hay mejoras concretas disponibles que aumentarían la precisión de las respuestas y/o reducirían el costo mensual sin trabajo técnico mayor.`
      : `La IA responde bien, el costo está bajo control y los consultores reciben respuestas de calidad. Hay optimizaciones menores disponibles para el siguiente período.`;

  // Etiqueta legible por rol
  const roleLabel: Record<string, string> = {
    aurora:  "Aurora — Autora",
    rebeca:  "Rebeca — Revisora",
    elena:   "Elena — Elevadora",
    valeria: "Valeria — Validadora",
  };

  // ── Decisiones disponibles ────────────────────────────────────────────────
  const decisions: Decision[] = [];

  if (usage) {
    // Error rate crítico — con diagnóstico automático por rol
    if (errorRate > 0.05 && llmCalls > 10) {
      const llmRolesWithErrors = usage.by_role
        .filter(r => r.role !== "embeddings" && r.errors > 0)
        .sort((a, b) => b.errors - a.errors);
      const topRole = llmRolesWithErrors[0];
      const topRolePct = topRole && llmErrors > 0
        ? Math.round((topRole.errors / llmErrors) * 100) : 0;
      const isConcentrated = topRolePct >= 60;

      let diagnostico: string;
      let accion: string;

      if (isConcentrated && topRole) {
        const rLabel = roleLabel[topRole.role.toLowerCase()] ?? topRole.role;
        const rErrRate = Math.round((topRole.errors / topRole.calls) * 100);
        if (topRole.avg_latency_ms > 25_000) {
          diagnostico = `${rLabel} concentra el ${topRolePct}% de los errores. Latencia promedio: ${(topRole.avg_latency_ms / 1000).toFixed(0)}s — probable timeout por documentos de cliente demasiado largos.`;
          accion = `Revisar los documentos subidos de los clientes que usan ${rLabel}. Si tienen más de 200 páginas, fragmentarlos antes de subir.`;
        } else if (rErrRate > 50) {
          diagnostico = `${rLabel} falla en ${rErrRate}% de sus solicitudes (${topRole.errors} errores en ${topRole.calls} llamadas). Causa probable: herramienta externa caída (web_search, QStash) o prompt del sistema con error de configuración.`;
          accion = `Verificar el estado de las herramientas en la sección Herramientas. Si están verdes, revisar logs de Vercel filtrando por "${topRole.role}" para ver el mensaje de error exacto.`;
        } else {
          diagnostico = `${rLabel} concentra el ${topRolePct}% de los errores (${topRole.errors} de ${llmErrors} totales, tasa ${rErrRate}%). El resto de roles funciona bien.`;
          accion = `Revisar si los errores de ${rLabel} ocurren con un cliente o documento específico. Eso indicaría un problema de datos, no de infraestructura.`;
        }
      } else if (llmRolesWithErrors.length > 1) {
        const rolesList = llmRolesWithErrors
          .slice(0, 3)
          .map(r => `${roleLabel[r.role.toLowerCase()] ?? r.role} (${r.errors})`)
          .join(", ");
        diagnostico = `Los errores están distribuidos entre varios roles: ${rolesList}. Cuando múltiples roles fallan al mismo tiempo, la causa suele ser externa: cuota de API agotada o fallo de herramienta compartida (web_search, QStash).`;
        accion = `Verificar el estado de las herramientas en la sección Herramientas. Revisar si los errores se agrupan en el mismo período (cluster de tiempo = fallo externo).`;
      } else if (topRole) {
        const rLabel = roleLabel[topRole.role.toLowerCase()] ?? topRole.role;
        diagnostico = `Todos los errores vienen de ${rLabel} (${topRole.errors} errores en ${topRole.calls} llamadas, tasa ${Math.round((topRole.errors / topRole.calls) * 100)}%).`;
        accion = `Revisar los últimos mensajes enviados a ${rLabel} — buscar patrón común (mismo cliente, mismo documento, misma pregunta).`;
      } else {
        diagnostico = `No se identificó un rol específico como fuente de los errores.`;
        accion = `Revisar logs de Vercel del período con más errores y buscar el mensaje exacto.`;
      }

      decisions.push({
        prioridad: errorRate > 0.2 ? "urgente" : "importante",
        titulo: "La IA está fallando con frecuencia",
        queMejora: "Identificar y corregir la causa de las respuestas fallidas.",
        porQueImporta: `En los últimos 30 días, ${llmErrors} de ${numFmt.format(llmCalls)} solicitudes terminaron en error — el consultor vio una respuesta vacía o un mensaje de falla. Eso interrumpe el trabajo y genera desconfianza en la herramienta.`,
        ejemplo: diagnostico,
        necesita: accion,
        recomendacion: "investigar",
      });
    }

    // Voyage no activo
    if (!voyageActive) {
      decisions.push({
        prioridad: "importante",
        titulo: "Activar búsqueda inteligente de documentos",
        queMejora: "La IA encontraría información relevante en los documentos aunque el consultor use palabras diferentes a las del informe.",
        porQueImporta: "Hoy la búsqueda en documentos funciona por coincidencia de palabras exactas. Si el cuestionario pregunta «emisiones de carbono» y el informe del cliente dice «huella climática», la IA no los conecta y puede inventar la respuesta o dejarla en blanco.",
        ejemplo: "Con esta mejora activa, Aurora encontraría los datos correctos aunque el consultor use terminología distinta a la del informe GRI del cliente.",
        necesita: "Media jornada de trabajo técnico. Sin costo adicional en los primeros 100,000 búsquedas al mes.",
        recomendacion: "activar",
      });
    }

    // Voyage Rerank (después de embeddings)
    decisions.push({
      prioridad: voyageActive ? "importante" : "conveniente",
      titulo: voyageActive
        ? "Mejorar la selección de fragmentos relevantes"
        : "Activar selección precisa de fragmentos (siguiente paso tras búsqueda inteligente)",
      queMejora: "La IA recibe solo los fragmentos más útiles del documento antes de responder — menos ruido, más precisión.",
      porQueImporta: "Cuando un informe del cliente tiene 200 páginas, la búsqueda extrae múltiples fragmentos candidatos. Sin selección precisa, la IA recibe algunos irrelevantes y puede perder el dato clave. Con esta mejora, se filtran los mejores antes de enviárselos.",
      ejemplo: "En un informe de 180 páginas sobre Nuvoil, la diferencia entre recibir el fragmento correcto de la tabla GRI vs. uno genérico de la introducción.",
      necesita: voyageActive
        ? "1 hora de trabajo técnico. Sin costo adicional (usa la misma suscripción ya activa)."
        : "Se activa inmediatamente después de la búsqueda inteligente, sin trabajo extra.",
      recomendacion: "activar",
    });

    // Opus overuse
    if (opusPct > 20 && llmCalls > 20) {
      decisions.push({
        prioridad: "conveniente",
        titulo: `La IA de máxima capacidad se usa más de lo recomendado (${opusPct}%)`,
        queMejora: "Reasignar algunas tareas a una IA de menor costo sin pérdida visible de calidad.",
        porQueImporta: `La IA de máxima capacidad (que usa Elena y el Reporte PDF) cuesta 5 veces más que la IA estándar. Debería usarse solo en tareas estratégicas — si representa más del 20% del volumen, hay tareas de revisión o análisis básico que podrían usar una IA más económica.`,
        ejemplo: "Si los consultores abren Elena para tareas de revisión rápida que Aurora resolvería igual de bien, el costo sube sin beneficio real.",
        necesita: "Revisar con el equipo de consultores qué tareas usan qué rol — 1 hora de conversación.",
        recomendacion: "revisar",
      });
    }

    // Alta latencia
    if (latenciaMs > 10_000) {
      decisions.push({
        prioridad: "conveniente",
        titulo: "El Reporte PDF tarda demasiado — el consultor espera bloqueado",
        queMejora: "Procesar el reporte en segundo plano: el consultor sigue trabajando y recibe una notificación cuando esté listo.",
        porQueImporta: `El reporte final de Doble Materialidad tarda entre 3 y 5 minutos en generarse. Hoy el consultor tiene que quedarse esperando sin poder hacer nada. Además cuesta el doble que si se procesara de forma diferida.`,
        ejemplo: "El consultor lanza el reporte, sigue revisando otros clientes, y recibe un aviso: «Tu reporte de Nuvoil está listo». Igual de rápido para él, mitad del costo.",
        necesita: "Medio día de trabajo técnico. Reduce el costo del reporte en un 50%.",
        recomendacion: "planear",
      });
    }

    // Caché de benchmarks
    decisions.push({
      prioridad: "conveniente",
      titulo: "Evitar pagar dos veces por la misma información de benchmark",
      queMejora: "Si dos consultores consultan datos del mismo sector (p. ej. energía, manufactura), la segunda respuesta se reutiliza sin cobrar.",
      porQueImporta: "Los benchmarks sectoriales (marcos GRI, ESRS, TCFD por industria) son iguales para todos los clientes del mismo giro. Hoy cada consulta llama a la IA y cobra tokens aunque la pregunta ya fue respondida antes.",
      ejemplo: "Si esta semana 3 proyectos del sector energético generaron benchmarks, con esta mejora el segundo y tercer benchmark se responden al instante y sin costo de IA.",
      necesita: "Medio día de trabajo técnico. Sin costo: usamos la cuenta de infraestructura que ya tenemos.",
      recomendacion: "planear",
    });

    // Extracción económica (Gemini Flash)
    const sonnetModel = usage.by_model.find(m => m.family === "sonnet");
    if (costoMes > 5 && (sonnetModel?.calls ?? 0) > 10) {
      decisions.push({
        prioridad: "conveniente",
        titulo: "Reducir el costo del llenado automático del cuestionario",
        queMejora: "Usar una IA más económica para extraer datos del informe del cliente — sin afectar la calidad de análisis.",
        porQueImporta: `El AI-fill tiene dos fases: extraer datos del informe (mecánico) y sintetizarlos (requiere criterio). Hoy ambas usan la misma IA cara. Separar la extracción reduce el costo de esa tarea en hasta 40 veces.`,
        ejemplo: `Con el volumen actual (${numFmt.format(sonnetModel?.calls ?? 0)} consultas en 30 días), el ahorro estimado sería ~${usdFmt.format(costoMes * 0.15)}/mes.`,
        necesita: "Un día de trabajo técnico. Requiere configurar una clave de servicio adicional.",
        recomendacion: "planear",
      });
    }

    // Feedback negativo
    if (usage.feedback_total_down > 5) {
      const topReason = usage.feedback_top_reasons[0];
      decisions.push({
        prioridad: usage.feedback_total_down > 20 ? "importante" : "conveniente",
        titulo: "Los consultores están rechazando respuestas con frecuencia",
        queMejora: "Identificar qué tipo de respuesta no satisface a los consultores y ajustar las instrucciones de la IA.",
        porQueImporta: `${usage.feedback_total_down} respuestas fueron calificadas negativamente en los últimos 30 días. Cada rechazo significa que el consultor tuvo que reescribir o ignorar la respuesta — tiempo perdido.`,
        ejemplo: topReason
          ? `La razón más frecuente de rechazo: "${topReason.reason_code}" (${topReason.count} veces). Ajustar las instrucciones de ese rol reduciría la mayoría de rechazos.`
          : "Ver en Uso IA qué rol concentra más rechazos.",
        necesita: "Revisión de las instrucciones del rol afectado. 2–4 horas según la complejidad.",
        recomendacion: "revisar",
      });
    }
  } else {
    // Sin datos: mostrar decisiones base siempre relevantes
    decisions.push(
      {
        prioridad: "importante",
        titulo: "Activar búsqueda inteligente de documentos",
        queMejora: "La IA encontraría información relevante en documentos aunque el consultor use palabras diferentes.",
        porQueImporta: "Hoy la búsqueda funciona solo por coincidencia exacta de palabras. Si el informe dice 'huella climática' y el cuestionario pregunta 'emisiones de carbono', la IA no los conecta.",
        necesita: "Media jornada de trabajo técnico. Sin costo adicional en los primeros 100,000 búsquedas/mes.",
        recomendacion: "activar",
      },
      {
        prioridad: "conveniente",
        titulo: "Procesar el Reporte PDF en segundo plano",
        queMejora: "El consultor no espera bloqueado 3–5 minutos — recibe notificación cuando el reporte está listo.",
        porQueImporta: "Genera mejor experiencia y reduce el costo del reporte en 50%.",
        necesita: "Medio día de trabajo técnico.",
        recomendacion: "planear",
      },
    );
  }

  // ── Decisiones de documentos (independientes del uso IA) ────────────────
  if (docStats !== null) {
    if (docStats.failed > 0) {
      decisions.push({
        prioridad: docStats.failed > 3 ? "urgente" : "importante",
        titulo: `${docStats.failed} documento${docStats.failed > 1 ? "s" : ""} no se pudo${docStats.failed > 1 ? "ieron" : ""} leer — la IA los ignora`,
        queMejora: "Recuperar el contenido de esos archivos para que la IA los use en chat y AI-fill.",
        porQueImporta: `Cuando un informe falla al leerse, el consultor cree que está disponible pero la IA lo ignora. Aurora y el AI-fill responden con datos públicos en lugar de los datos reales del cliente — sin avisar.`,
        ejemplo: `Si el informe financiero de un cliente falló al parsearse, Rebeca no puede citar sus cifras aunque el consultor lo haya subido hace días.`,
        necesita: "Ir al tab Documentos de cada cliente. Volver a subir en PDF plano (sin protección de contraseña). Toma 2 minutos por documento.",
        recomendacion: "investigar",
      });
    }
    if (docStats.total === 0) {
      decisions.push({
        prioridad: "importante",
        titulo: "Sin documentos del cliente — la IA trabaja solo con datos públicos",
        queMejora: "Subir el informe de sustentabilidad del cliente multiplica la precisión del AI-fill y el chat.",
        porQueImporta: "Sin documentos, Aurora responde con benchmarks públicos y búsqueda web. Con el informe del cliente, cita cifras y compromisos reales — la diferencia entre un borrador genérico y uno listo para entregar.",
        ejemplo: "Si el informe GRI de Nuvoil reporta 12% de reducción de emisiones, Aurora puede citarlo exactamente en lugar de usar un estimado sectorial.",
        necesita: "El consultor sube el PDF desde el tab Documentos de cada cliente. Tarda <30 segundos. Sin costo adicional.",
        recomendacion: "activar",
      });
    }
  }

  // Ordenar: urgente → importante → conveniente
  const ordenPrioridad: Record<Prioridad, number> = { urgente: 0, importante: 1, conveniente: 2 };
  decisions.sort((a, b) => ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]);

  // Etiquetas de recomendación
  const recLabel: Record<Decision["recomendacion"], string> = {
    activar:     "✅ Activar pronto",
    revisar:     "🔍 Revisar con el equipo",
    planear:     "📅 Planear para siguiente ciclo",
    investigar:  "⚠️ Investigar de inmediato",
  };

  const prioridadStyle: Record<Prioridad, { badge: string; border: string }> = {
    urgente:     { badge: "bg-rose-100 text-rose-800",    border: "border-l-rose-400" },
    importante:  { badge: "bg-amber-100 text-amber-800",  border: "border-l-amber-400" },
    conveniente: { badge: "bg-slate-100 text-slate-600",  border: "border-l-slate-300" },
  };

  return (
    <div className="px-8 py-6 max-w-4xl">

      {/* ── Estado general ─────────────────────────────────────────────────── */}
      <div className={`flex items-start gap-3 border ${sc.border} ${sc.bg} rounded-lg px-4 py-3 mb-6`}>
        <span className={`w-3 h-3 rounded-full ${sc.dot} shrink-0 mt-1`} />
        <div>
          <p className={`text-sm font-bold ${sc.text}`}>{semaforoLabel[semaforo]}</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${sc.text} opacity-90`}>{semaforoDesc}</p>
        </div>
      </div>

      {/* ── Métricas clave ──────────────────────────────────────────────────── */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            {
              label: "Respuestas exitosas",
              value: llmCalls > 0 ? `${successRate}%` : "—",
              sub: llmCalls === 0
                ? "Sin actividad en 30 días"
                : errorRate > 0.2
                ? `${llmErrors} fallas en ${numFmt.format(llmCalls)} consultas — ver diagnóstico`
                : errorRate > 0.05
                ? `${llmErrors} fallas detectadas — ver diagnóstico abajo`
                : `${numFmt.format(llmCalls)} consultas sin interrupciones`,
              red: errorRate > 0.05,
              tooltip: "Porcentaje de veces que la IA respondió sin errores en los últimos 30 días. Una falla = el consultor vio respuesta vacía o mensaje de error.",
            },
            {
              label: "Costo del mes",
              value: usdFmt.format(costoMes),
              sub: costoMes === 0
                ? "Sin actividad registrada"
                : costoMes < 30
                ? `${Math.round((costoMes / 150) * 100)}% del presupuesto piloto — amplia holgura`
                : costoMes < 100
                ? `${Math.round((costoMes / 150) * 100)}% del presupuesto mensual ($150 límite)`
                : costoMes < 150
                ? `${Math.round((costoMes / 150) * 100)}% del presupuesto — monitorear de cerca`
                : "Superó el presupuesto piloto de $150",
              red: costoMes > 100,
              tooltip: "Costo estimado de todas las llamadas a IA en los últimos 30 días. Presupuesto piloto definido en $150 USD/mes.",
            },
            {
              label: "Velocidad de respuesta",
              value: latenciaMs > 0 ? `${(latenciaMs / 1000).toFixed(1)} s` : "—",
              sub: latenciaMs <= 0
                ? "Sin datos"
                : latenciaMs < 5_000
                ? "Ágil — consultor no percibe espera"
                : latenciaMs < 10_000
                ? "Aceptable — consultor espera pero fluye"
                : latenciaMs < 20_000
                ? `${(latenciaMs / 1000).toFixed(0)}s interrumpe el trabajo — revisar documentos largos`
                : `${(latenciaMs / 1000).toFixed(0)}s — posibles timeouts, ver diagnóstico`,
              red: latenciaMs > 15_000,
              tooltip: "Tiempo promedio que espera el consultor desde que envía su pregunta hasta que recibe la respuesta completa. Objetivo: <10s.",
            },
            {
              label: "Caché activo",
              value: cacheRatio > 0 ? `${Math.round(cacheRatio * 100)}%` : "—",
              sub: cacheRatio <= 0
                ? "Sin actividad registrada"
                : cacheSavingsUsd >= 0.5
                ? `~${usdFmt.format(cacheSavingsUsd)} ahorrados este mes${cacheRatio < 0.2 ? " — objetivo: >40%" : ""}`
                : cacheRatio < 0.2
                ? "Bajo — objetivo >40% para prompts repetitivos"
                : cacheRatio < 0.4
                ? `~${usdFmt.format(cacheSavingsUsd)} ahorrados — en rango normal`
                : `~${usdFmt.format(cacheSavingsUsd)} ahorrados — rendimiento óptimo`,
              red: false,
              tooltip: "Porcentaje de tokens que la IA leyó de caché en lugar de procesarlos de nuevo. Más alto = menos costo. Objetivo: >40% en uso regular.",
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-slate-200 rounded px-3 py-2.5" title={kpi.tooltip}>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold leading-snug">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${kpi.red ? "text-rose-700" : "text-slate-900"}`}>
                {kpi.value}
              </p>
              <p className={`text-[10px] mt-0.5 ${kpi.red ? "text-rose-500" : "text-slate-400"}`}>{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Decisiones disponibles ──────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
          Decisiones disponibles
        </p>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          Cada tarjeta describe una mejora concreta: qué cambia, por qué importa y qué se necesita para activarla.
          Están ordenadas por prioridad basada en los datos de los últimos 30 días.
        </p>

        <div className="flex flex-col gap-4">
          {decisions.map((d, i) => {
            const ps = prioridadStyle[d.prioridad];
            return (
              <div key={i} className={`bg-white border border-l-4 ${ps.border} border-slate-200 rounded-lg p-5`}>
                {/* Header */}
                <div className="flex flex-wrap items-start gap-2 mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${ps.badge}`}>
                    {d.prioridad}
                  </span>
                  <p className="text-sm font-bold text-slate-900 leading-snug flex-1">{d.titulo}</p>
                </div>

                {/* ¿Qué mejora? */}
                <p className="text-xs font-semibold text-slate-700 mb-0.5">¿Qué mejora?</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{d.queMejora}</p>

                {/* ¿Por qué importa? */}
                <p className="text-xs font-semibold text-slate-700 mb-0.5">¿Por qué importa?</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">{d.porQueImporta}</p>

                {/* Ejemplo concreto */}
                {d.ejemplo && (
                  <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Ejemplo</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.ejemplo}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Lo que se necesita</p>
                    <p className="text-[11px] text-slate-600">{d.necesita}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-sm whitespace-nowrap">
                    {recLabel[d.recomendacion]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Uso por rol ──────────────────────────────────────────────────────── */}
      {usage && usage.by_role.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Cómo se usó cada rol IA — últimos 30 días
          </p>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Cuántas veces usó el equipo cada asistente, qué tan rápido respondió y si hubo fallas.
          </p>
          <div className="bg-white border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-xs">
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
                {usage.by_role.map((r) => {
                  const roleErr = r.errors;
                  const roleErrRate = r.calls > 0 ? roleErr / r.calls : 0;
                  const label = roleLabel[r.role.toLowerCase()] ?? r.role;
                  return (
                    <tr key={r.role} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {numFmt.format(r.calls)} veces
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">
                        {r.avg_latency_ms > 0 ? latenciaLabel(r.avg_latency_ms) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                        {usdFmt.format(r.cost_usd)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${roleErrRate > 0.05 ? "text-rose-600" : "text-slate-400"}`}>
                        {roleErr > 0
                          ? `${roleErr} (${Math.round(roleErrRate * 100)}%)`
                          : "Ninguna"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Qué IA se usa en cada tarea ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
          Qué IA se usa en cada tarea y por qué
        </p>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Cada tarea usa el tipo de IA adecuado a su complejidad — no siempre la más potente es la mejor opción.
        </p>
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-left">Tarea</th>
                <th className="px-4 py-2.5 text-left">Tipo de IA</th>
                <th className="px-4 py-2.5 text-left">Por qué esta y no otra</th>
                <th className="px-4 py-2.5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { tarea: "Aurora — redactar borrador",        tipo: "IA estándar",            porque: "Necesita velocidad y calidad narrativa, sin el costo de la IA de máxima capacidad.",                                  estado: "Activo" },
                { tarea: "Rebeca — revisar y detectar fallas",tipo: "IA estándar",            porque: "Un checklist estructurado no requiere el modelo más caro — Rebeca verifica, no crea.",                               estado: "Activo" },
                { tarea: "Elena — elevar al estratégico",     tipo: "IA de máxima capacidad", porque: "Los insights de negocio, trade-offs y narrativa ejecutiva requieren el razonamiento más profundo.",                   estado: "Activo" },
                { tarea: "Valeria — validar entregable",      tipo: "IA ligera",              porque: "Verificar listas de criterios no requiere narrativa — una IA más simple lo hace igual de bien a menor costo.",       estado: "Activo" },
                { tarea: "AI-fill — rellenar cuestionario",   tipo: "IA estándar",            porque: "Combina extracción de datos con síntesis contextual. Hay potencial de usar IA más económica en la extracción pura.", estado: "Activo" },
                { tarea: "Benchmark de empresas",             tipo: "IA estándar",            porque: "Proponer empresas comparables y generar narrativa de brechas y fortalezas.",                                         estado: "Activo" },
                { tarea: "IROs — inventario de impactos",     tipo: "IA estándar",            porque: "Análisis ESG con scores de impacto financiero y de negocio.",                                                        estado: "Activo" },
                { tarea: "Resumen ejecutivo",                 tipo: "IA estándar",            porque: "El consultor necesita el resultado de inmediato — no puede esperar un procesamiento en segundo plano.",              estado: "Activo" },
                { tarea: "Reporte PDF final",                 tipo: "IA de máxima capacidad", porque: "Es el entregable al cliente — requiere la máxima calidad narrativa y análisis.",                                      estado: "Activo" },
                { tarea: "Búsqueda en documentos del cliente",tipo: "Búsqueda básica → semántica (pendiente)", porque: "Hoy busca por palabras exactas. Activar búsqueda semántica mejora +25% la precisión.",              estado: "Parcial" },
                { tarea: "Extracción de datos AI-fill",       tipo: "IA económica (propuesto)", porque: "Solo extrae datos sin interpretarlos — una IA más económica hace el mismo trabajo a 40× menor costo.",             estado: "Propuesto" },
                { tarea: "Reporte PDF en segundo plano",      tipo: "Procesamiento diferido (propuesto)", porque: "El consultor no espera bloqueado — recibe notificación cuando el reporte está listo al 50% del costo.",  estado: "Propuesto" },
              ].map((row) => {
                const estadoColor =
                  row.estado === "Activo" ? "text-emerald-700"
                  : row.estado === "Parcial" ? "text-amber-700"
                  : "text-slate-400";
                return (
                  <tr key={row.tarea} className={`hover:bg-slate-50 ${row.estado === "Propuesto" ? "opacity-60" : ""}`}>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{row.tarea}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.tipo}</td>
                    <td className="px-4 py-2.5 text-slate-500 leading-relaxed">{row.porque}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${estadoColor}`}>{row.estado}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Para el detalle técnico de cada configuración:{" "}
          <a href="/configuracion/flujos-ia" className="text-brand-primary underline underline-offset-2">Flujos IA →</a>
          {" · "}
          <a href="/configuracion/herramientas" className="text-brand-primary underline underline-offset-2">Herramientas →</a>
          {" · "}Métricas completas:{" "}
          <a href="/configuracion/uso-ia" className="text-brand-primary underline underline-offset-2">Uso IA →</a>
        </p>
      </div>
    </div>
  );
}
