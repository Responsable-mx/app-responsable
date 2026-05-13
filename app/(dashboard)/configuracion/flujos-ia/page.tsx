import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flujos IA · Configuración · App ResponSable",
};

export const revalidate = 86400; // suficiente con 1 actualización/día — contenido estático

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Lane = "A" | "B" | "C";

type DmStep = {
  n: number;
  label: string;
  desc: string;
  tool: string;
  timing: string;
  lane: Lane;
  model?: string;
};

type ChatStep = {
  n: number;
  label: string;
  desc: string;
  tool: string;
  timing: string;
};

// ── Datos estáticos ───────────────────────────────────────────────────────────

const LANE_META: Record<Lane, { label: string; color: string; bg: string; border: string }> = {
  A: {
    label: "Al instante (<30 s)",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  B: {
    label: "Minutos (async)",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  C: {
    label: "Nocturno (cron)",
    color: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

const DM_STEPS: DmStep[] = [
  {
    n: 1,
    label: "Cuestionario — AI-fill",
    desc: "Rellena automáticamente los campos del cuestionario con datos públicos y documentos ya subidos del cliente. El consultor puede editar cualquier campo antes de validarlo.",
    tool: "Web search + documentos del cliente → Sonnet",
    timing: "<30 s por campo",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 2,
    label: "Referentes ESG",
    desc: "Identifica los marcos normativos relevantes para el sector del cliente: GRI, ESRS, TCFD, SASB u otros según industria. Las URLs de los frameworks principales están guardadas internamente para evitar links desactualizados.",
    tool: "URLs hardcoded (GRI/ESRS/TCFD/SASB…) + web_search para frameworks sectoriales",
    timing: "<15 s",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 3,
    label: "Benchmark de empresas",
    desc: "Propone N empresas comparables del mismo sector. El consultor selecciona cuáles incluir y la IA genera una tabla comparativa con brechas y fortalezas versus el cliente.",
    tool: "Sonnet (propuesta) → QStash (comparativa en paralelo por empresa)",
    timing: "Propuesta <10 s · Comparativa ~60–90 s total",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 4,
    label: "IROs propios",
    desc: "Genera el inventario de Impactos, Riesgos y Oportunidades materiales del cliente, con scores de impacto y financiero por tema ESG.",
    tool: "Sonnet · Batch API (propuesto → 50% descuento en volumen alto)",
    timing: "~2–5 min",
    lane: "B",
    model: "Sonnet",
  },
  {
    n: 5,
    label: "Resumen ejecutivo",
    desc: "Genera el resumen para Dirección General: contexto del análisis, top 5 temas materiales, riesgos financieros, oportunidades y recomendación estratégica. Sin tecnicismos.",
    tool: "Sonnet (síncrono)",
    timing: "<45 s",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 6,
    label: "Validación del consultor",
    desc: "El consultor revisa el resumen, puede editarlo directamente en pantalla y lo marca como revisado. Sin IA en este paso — decisión humana.",
    tool: "Solo UI — sin IA",
    timing: "Manual",
    lane: "A",
  },
  {
    n: 7,
    label: "Reporte PDF",
    desc: "Genera el reporte de doble materialidad con matrices BCG/McKinsey, tabla semáforo de brechas, radar de gaps y próximos pasos. Entregable final al cliente.",
    tool: "Opus (máxima calidad narrativa) · QStash async (propuesto — evita timeout)",
    timing: "~3–5 min",
    lane: "B",
    model: "Opus",
  },
];

const CHAT_STEPS: ChatStep[] = [
  {
    n: 1,
    label: "Selección de rol",
    desc: "El consultor elige con cuál de los 4 roles trabajar: Aurora (autora del primer borrador), Rebeca (revisora de calidad), Elena (estratega de insights) o Valeria (validadora del entregable).",
    tool: "—",
    timing: "Manual",
  },
  {
    n: 2,
    label: "Recuperación de contexto",
    desc: "La app busca en los documentos del cliente los fragmentos más relevantes para la pregunta. Así la IA responde con datos reales del cliente, no con información genérica.",
    tool: "BM25 (activo en prod) → Voyage AI embeddings (activación pendiente)",
    timing: "<1 s",
  },
  {
    n: 3,
    label: "Construcción del prompt",
    desc: "Se inyecta el contexto del cliente, los fragmentos relevantes del cuestionario y el historial de la sesión. Se aplica caché de prompt para reducir costo en respuestas sucesivas del mismo rol.",
    tool: "buildSystemBlocks · cache_control ephemeral (2 puntos de caché → ~50% ahorro en turnos sucesivos)",
    timing: "<50 ms",
  },
  {
    n: 4,
    label: "Generación de respuesta",
    desc: "El modelo genera la respuesta en tiempo real (streaming). Cada rol usa el modelo más adecuado para su función.",
    tool: "Aurora/Rebeca → Sonnet · Elena → Opus · Valeria → Haiku",
    timing: "~3–15 s según rol",
  },
  {
    n: 5,
    label: "Retroalimentación y aprendizaje",
    desc: "Si el consultor rechaza la respuesta y elige una razón (\"muy genérico\", \"sector equivocado\", etc.), esa razón se guarda y se inyecta como ejemplo en futuros prompts del mismo rol y cliente. La IA aprende automáticamente.",
    tool: "chat_feedback → bloque de memoria en system prompt",
    timing: "Aprende en el siguiente mensaje",
  },
];

const ROLES = [
  {
    name: "Aurora",
    fn: "Autora",
    model: "Sonnet",
    cost: "$3 / $15",
    why: "Balance velocidad + precisión para construir borradores completos.",
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
  },
  {
    name: "Rebeca",
    fn: "Revisora",
    model: "Sonnet",
    cost: "$3 / $15",
    why: "Misma cadencia que Aurora — checklist estructurado no requiere el modelo más caro.",
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
  {
    name: "Elena",
    fn: "Elevadora",
    model: "Opus",
    cost: "$15 / $75",
    why: "Insights estratégicos profundos, trade-offs y narrativa ejecutiva requieren máxima capacidad.",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    name: "Valeria",
    fn: "Validadora",
    model: "Haiku",
    cost: "$0.25 / $1.25",
    why: "Validación estructurada (DoD, consistencia, evidencia) — no requiere narrativa, solo verificar.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
];

// ── Componentes ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
      {children}
    </p>
  );
}

function LaneBadge({ lane }: { lane: Lane }) {
  const m = LANE_META[lane];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-widest ${m.color} ${m.bg} border ${m.border} px-2 py-0.5 rounded-sm`}
    >
      {m.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlujoIaPage() {
  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Intro */}
      <SectionLabel>Flujos de trabajo IA</SectionLabel>
      <p className="text-sm text-slate-600 mb-8 leading-relaxed">
        Cómo funciona la inteligencia artificial dentro de la app, paso a paso.
        Para cada etapa se indica la herramienta usada, el modelo y cuánto tarda.
      </p>

      {/* ── Flujo 1: Chat ──────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="border-l-4 border-l-brand-primary pl-4 mb-5">
          <h2 className="text-base font-bold text-slate-900">Flujo 1 — Chat con los 4 roles IA</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            El consultor dialoga con Aurora, Rebeca, Elena o Valeria sobre cualquier entregable de consultoría.
          </p>
        </div>

        {/* Roles y modelos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {ROLES.map((r) => (
            <div
              key={r.name}
              className={`border ${r.border} ${r.bg} rounded p-3`}
            >
              <p className={`text-sm font-bold ${r.color}`}>{r.name}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{r.fn}</p>
              <p className="text-xs font-semibold text-slate-700 mt-1.5">{r.model}</p>
              <p className="text-[10px] text-slate-500 font-mono">{r.cost} /1M tokens</p>
              <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">{r.why}</p>
            </div>
          ))}
        </div>

        {/* Pasos */}
        <div className="flex flex-col gap-3">
          {CHAT_STEPS.map((step) => (
            <div key={step.n} className="bg-white border border-slate-200 rounded p-4 flex gap-4">
              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{step.desc}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {step.tool !== "—" && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-sm">
                      <span className="font-semibold">Herramienta:</span> {step.tool}
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">
                    <span className="font-semibold">Tiempo:</span> {step.timing}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Flujo 2: DM-IA ─────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div className="border-l-4 border-l-amber-500 pl-4 mb-5">
          <h2 className="text-base font-bold text-slate-900">Flujo 2 — Doble Materialidad IA (7 etapas)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            El servicio completo de análisis de doble materialidad asistido por IA, de cuestionario a reporte PDF.
          </p>
        </div>

        {/* Leyenda de carriles */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(["A", "B", "C"] as Lane[]).map((lane) => {
            const m = LANE_META[lane];
            return (
              <span key={lane} className={`inline-flex items-center gap-1.5 text-[10px] ${m.color} ${m.bg} border ${m.border} px-2.5 py-1 rounded-sm`}>
                <span className="font-bold">Carril {lane}:</span> {m.label}
              </span>
            );
          })}
          <span className="text-[10px] text-slate-500 self-center">
            — Carril A = respuesta inmediata · B = async en minutos · C = proceso nocturno
          </span>
        </div>

        {/* Pasos DM */}
        <div className="flex flex-col gap-3">
          {DM_STEPS.map((step) => (
            <div key={step.n} className="bg-white border border-slate-200 rounded p-4 flex gap-4">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                  <LaneBadge lane={step.lane} />
                  {step.model && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-primary bg-brand-primary-light px-2 py-0.5 rounded-sm border border-brand-primary/20">
                      {step.model}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.desc}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  {step.tool !== "Solo UI — sin IA" && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-sm">
                      <span className="font-semibold">Herramienta:</span> {step.tool}
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm">
                    <span className="font-semibold">Tiempo:</span> {step.timing}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Arquitectura de timing ──────────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel>Arquitectura de timing — 3 carriles</SectionLabel>
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Principio clave: la app distingue cuándo el consultor está esperando la respuesta
          (carril A) de cuándo puede seguir trabajando mientras la IA procesa en segundo plano (carril B)
          o de procesos nocturnos que no requieren intervención (carril C).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["A", "B", "C"] as Lane[]).map((lane) => {
            const m = LANE_META[lane];
            const examples: Record<Lane, string[]> = {
              A: ["AI-fill cuestionario", "Referentes ESG", "Propuesta benchmark", "Resumen ejecutivo"],
              B: ["Comparativa benchmark (muchas empresas)", "Generación IROs propios", "Reporte PDF"],
              C: ["Actualizar embeddings de documentos", "Refresh de informes públicos semestrales", "Auto-update IROs catálogo"],
            };
            return (
              <div key={lane} className={`border ${m.border} ${m.bg} rounded p-4`}>
                <p className={`text-xs font-bold ${m.color} uppercase tracking-widest mb-1`}>
                  Carril {lane}
                </p>
                <p className={`text-sm font-bold ${m.color} mb-2`}>{m.label}</p>
                <ul className="space-y-1">
                  {examples[lane].map((ex) => (
                    <li key={ex} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                      <span className={`shrink-0 mt-0.5 ${m.color}`}>·</span>
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Por qué cada herramienta ────────────────────────────────────────── */}
      <div>
        <SectionLabel>Por qué cada herramienta</SectionLabel>
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-left">Herramienta</th>
                <th className="px-4 py-2.5 text-left">Qué hace</th>
                <th className="px-4 py-2.5 text-left">Se usa en</th>
                <th className="px-4 py-2.5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                {
                  tool: "Anthropic Sonnet",
                  what: "Genera texto, analiza documentos, sintetiza información",
                  where: "Chat Aurora/Rebeca · AI-fill · Benchmark · Resumen",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Anthropic Opus",
                  what: "Análisis estratégico profundo y narrativa ejecutiva",
                  where: "Chat Elena · Reporte PDF DM",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Anthropic Haiku",
                  what: "Validación estructurada rápida y económica",
                  where: "Chat Valeria · Validaciones de datos",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Voyage AI (embeddings)",
                  what: "Convierte fragmentos de documentos en vectores para búsqueda semántica",
                  where: "Chat — recuperación de contexto del cliente",
                  status: "Pendiente prod",
                  statusColor: "text-amber-700",
                },
                {
                  tool: "LlamaParse",
                  what: "Extrae tablas y columnas de PDFs complejos sin perder estructura",
                  where: "Ingestión de informes de competidoras + documentos del cliente",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Mistral OCR",
                  what: "Alternativa a LlamaParse si sus créditos se agotan",
                  where: "Ingestión de PDFs — fallback automático",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "QStash",
                  what: "Cola de trabajos async con reintentos automáticos",
                  where: "Benchmark de competidoras (1 trabajo por empresa)",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Anthropic web_search",
                  what: "Busca información pública actualizada en internet",
                  where: "AI-fill cuestionario · Referentes ESG · URLs benchmark",
                  status: "Activo",
                  statusColor: "text-emerald-700",
                },
                {
                  tool: "Voyage Rerank",
                  what: "Reordena fragmentos de búsqueda por relevancia real",
                  where: "Chat — mejora el contexto enviado a la IA",
                  status: "Propuesto",
                  statusColor: "text-slate-500",
                },
                {
                  tool: "Upstash Redis",
                  what: "Caché de respuestas repetidas para benchmarks sectoriales",
                  where: "Benchmark · Consultas de frameworks ESG",
                  status: "Propuesto",
                  statusColor: "text-slate-500",
                },
                {
                  tool: "Anthropic Batch API",
                  what: "Procesa reportes en segundo plano al 50% del costo",
                  where: "Reporte PDF · IROs masivos",
                  status: "Propuesto",
                  statusColor: "text-slate-500",
                },
                {
                  tool: "Gemini Flash",
                  what: "Extracción económica de datos de documentos (40× más barato que Sonnet)",
                  where: "AI-fill — paso de extracción pura",
                  status: "Propuesto",
                  statusColor: "text-slate-500",
                },
              ].map((row) => (
                <tr key={row.tool} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-800">{row.tool}</td>
                  <td className="px-4 py-2 text-slate-600 leading-relaxed">{row.what}</td>
                  <td className="px-4 py-2 text-slate-500">{row.where}</td>
                  <td className={`px-4 py-2 text-right font-medium ${row.statusColor}`}>
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
