import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Flujos IA · Configuración · App ResponSable",
};

export const revalidate = 86400;

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Lane = "A" | "B" | "C";

const LANE: Record<Lane, { label: string; dot: string; line: string; badge: string; text: string }> = {
  A: {
    label: "Al instante (<30 s)",
    dot: "bg-emerald-500",
    line: "border-emerald-300",
    badge: "bg-emerald-50 border-emerald-200 text-emerald-700",
    text: "text-emerald-700",
  },
  B: {
    label: "Minutos (async)",
    dot: "bg-amber-400",
    line: "border-amber-300",
    badge: "bg-amber-50 border-amber-200 text-amber-700",
    text: "text-amber-700",
  },
  C: {
    label: "Nocturno (cron)",
    dot: "bg-slate-400",
    line: "border-slate-300",
    badge: "bg-slate-100 border-slate-200 text-slate-600",
    text: "text-slate-600",
  },
};

const MODEL_COLOR: Record<string, string> = {
  Haiku: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Sonnet: "bg-teal-100 text-teal-800 border-teal-200",
  Opus: "bg-violet-100 text-violet-800 border-violet-200",
  "—": "bg-slate-100 text-slate-500 border-slate-200",
};

// ── Datos ─────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    name: "Aurora",
    fn: "Autora",
    model: "Sonnet",
    cost: "$3 / $15 por 1M tokens",
    why: "Construye el borrador inicial. Necesita calidad narrativa y velocidad.",
    borderColor: "border-l-teal-500",
    dotColor: "bg-teal-500",
  },
  {
    name: "Rebeca",
    fn: "Revisora",
    model: "Sonnet",
    cost: "$3 / $15 por 1M tokens",
    why: "Detecta omisiones y riesgos. Checklist estructurado — no necesita el modelo más caro.",
    borderColor: "border-l-slate-400",
    dotColor: "bg-slate-400",
  },
  {
    name: "Elena",
    fn: "Elevadora",
    model: "Opus",
    cost: "$15 / $75 por 1M tokens",
    why: "Insights estratégicos y trade-offs profundos. Justifica el modelo más potente.",
    borderColor: "border-l-amber-500",
    dotColor: "bg-amber-500",
  },
  {
    name: "Valeria",
    fn: "Validadora",
    model: "Haiku",
    cost: "$0.25 / $1.25 por 1M tokens",
    why: "Verifica DoD y consistencia. Validación estructurada — no requiere narrativa.",
    borderColor: "border-l-emerald-500",
    dotColor: "bg-emerald-500",
  },
];

type ChatStep = {
  n: number;
  label: string;
  desc: string;
  tool: string;
  timing: string;
  model?: string;
};

const CHAT_STEPS: ChatStep[] = [
  {
    n: 1,
    label: "Selección de rol",
    desc: "El consultor elige Aurora, Rebeca, Elena o Valeria según la etapa del entregable.",
    tool: "—",
    timing: "Manual",
  },
  {
    n: 2,
    label: "Recuperación de contexto",
    desc: "Busca en los documentos del cliente los fragmentos más relevantes para la pregunta.",
    tool: "BM25 (activo) → Voyage embeddings (pendiente prod)",
    timing: "<1 s",
  },
  {
    n: 3,
    label: "Prompt con contexto",
    desc: "Inyecta contexto del cliente + fragmentos relevantes + historial. Caché de prompt para ahorrar tokens en turnos sucesivos.",
    tool: "buildSystemBlocks + cache_control ephemeral",
    timing: "<50 ms",
  },
  {
    n: 4,
    label: "Respuesta IA",
    desc: "El modelo genera en tiempo real (streaming). Cada rol usa el modelo optimizado para su función.",
    tool: "Aurora/Rebeca → Sonnet · Elena → Opus · Valeria → Haiku",
    timing: "3–15 s según rol",
    model: "ver roles",
  },
  {
    n: 5,
    label: "Retroalimentación",
    desc: "Si el consultor rechaza con una razón, se guarda y se inyecta en futuros mensajes del mismo rol + cliente.",
    tool: "chat_feedback → system prompt",
    timing: "Aprende al siguiente mensaje",
  },
];

type DmStep = {
  n: number;
  label: string;
  desc: string;
  tool: string;
  timing: string;
  lane: Lane;
  model: string;
  note?: string;
};

const DM_STEPS: DmStep[] = [
  {
    n: 1,
    label: "Cuestionario — AI-fill",
    desc: "Rellena automáticamente los campos del cuestionario con datos públicos y documentos ya subidos del cliente.",
    tool: "Web search + documentos del cliente",
    timing: "<30 s / campo",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 2,
    label: "Referentes ESG",
    desc: "Identifica los marcos normativos relevantes: GRI, ESRS, TCFD, SASB… URLs hardcoded para frameworks conocidos — sin links desactualizados.",
    tool: "URLs hardcoded + web_search (sectoriales)",
    timing: "<15 s",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 3,
    label: "Benchmark de empresas",
    desc: "Propone N empresas comparables. El consultor valida la selección. La IA genera la tabla comparativa con brechas y fortalezas.",
    tool: "Sonnet (propuesta) → QStash (comparativa en paralelo)",
    timing: "Propuesta <10 s · Comparativa ~60–90 s",
    lane: "A",
    model: "Sonnet",
    note: "QStash lanza 1 trabajo por empresa en paralelo → sin espera secuencial",
  },
  {
    n: 4,
    label: "IROs propios",
    desc: "Genera el inventario de Impactos, Riesgos y Oportunidades del cliente con scores de impacto y financiero.",
    tool: "Sonnet · Batch API (propuesto → −50% costo)",
    timing: "2–5 min",
    lane: "B",
    model: "Sonnet",
  },
  {
    n: 5,
    label: "Resumen ejecutivo",
    desc: "Genera el resumen para Dirección General: contexto, top 5 temas, riesgos financieros, oportunidades y recomendación. Sin tecnicismos.",
    tool: "Sonnet (síncrono)",
    timing: "<45 s",
    lane: "A",
    model: "Sonnet",
  },
  {
    n: 6,
    label: "Validación del consultor",
    desc: "El consultor revisa y edita el resumen en pantalla antes de compartirlo con el cliente. Decisión humana — sin IA.",
    tool: "Solo UI",
    timing: "Manual",
    lane: "A",
    model: "—",
  },
  {
    n: 7,
    label: "Reporte PDF",
    desc: "Genera el reporte final: matrices BCG/McKinsey, tabla semáforo, radar de gaps y próximos pasos. Entregable al cliente.",
    tool: "Opus · QStash async (propuesto → evita timeout)",
    timing: "3–5 min",
    lane: "B",
    model: "Opus",
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

/** Flecha horizontal → entre nodos del chat */
function ArrowRight() {
  return (
    <div className="flex items-center shrink-0 px-1">
      <div className="h-px w-4 bg-slate-300" />
      <svg width="8" height="10" viewBox="0 0 8 10" fill="none" aria-hidden="true">
        <path d="M1 1l6 4-6 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Conector vertical ↓ entre pasos del DM-IA */
function ArrowDown({ color = "#e2e8f0" }: { color?: string }) {
  return (
    <div className="flex flex-col items-center" style={{ marginLeft: "15px" }}>
      <div style={{ width: "1px", height: "20px", background: color }} />
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
        <path d="M1 1l4 6 4-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ModelBadge({ model }: { model: string }) {
  const cls = MODEL_COLOR[model] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${cls}`}>
      {model}
    </span>
  );
}

function LaneBadge({ lane }: { lane: Lane }) {
  const l = LANE[lane];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-sm ${l.badge}`}>
      <span className="font-mono">Carril {lane}</span>
      <span className="opacity-60">·</span>
      {l.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlujoIaPage() {
  return (
    <div className="px-8 py-6 max-w-4xl">

      {/* ══════════════════════════════════════════════════════════════════════
          FLUJO 1 — CHAT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mb-12">
        <SectionLabel>Flujo 1 — Chat con los 4 roles IA</SectionLabel>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          El consultor dialoga con uno de los 4 roles para trabajar cualquier entregable de consultoría.
          El flujo completo ocurre en <span className="font-semibold">3–15 segundos</span> según el rol elegido.
        </p>

        {/* ── Diagrama Chat (scroll horizontal en pantallas pequeñas) ──────── */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6 overflow-x-auto">
          <div className="flex items-stretch min-w-[700px]">
            {CHAT_STEPS.map((step, i) => (
              <div key={step.n} className="flex items-center flex-1 min-w-0">
                {/* Nodo */}
                <div className="flex-1 min-w-0 border border-slate-200 rounded-lg p-3 bg-slate-50 hover:bg-white transition-colors">
                  {/* Número */}
                  <div className="w-6 h-6 rounded-full bg-brand-primary text-white text-[10px] font-bold flex items-center justify-center mb-2">
                    {step.n}
                  </div>
                  {/* Label */}
                  <p className="text-xs font-bold text-slate-900 leading-tight mb-1">
                    {step.label}
                  </p>
                  {/* Desc */}
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
                    {step.desc}
                  </p>
                  {/* Badges */}
                  <div className="flex flex-col gap-1">
                    {step.timing !== "Manual" && (
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-sm w-fit">
                        ⏱ {step.timing}
                      </span>
                    )}
                    {step.tool !== "—" && (
                      <span className="text-[10px] text-brand-primary bg-brand-primary-light px-1.5 py-0.5 rounded-sm w-fit leading-relaxed">
                        {step.tool.length > 40 ? step.tool.slice(0, 40) + "…" : step.tool}
                      </span>
                    )}
                  </div>
                </div>
                {/* Flecha */}
                {i < CHAT_STEPS.length - 1 && <ArrowRight />}
              </div>
            ))}
          </div>
        </div>

        {/* ── Roles y modelos ──────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Paso 4 — Qué modelo usa cada rol y por qué
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ROLES.map((r) => (
              <div
                key={r.name}
                className={`bg-white border border-l-4 ${r.borderColor} border-slate-200 rounded p-4 flex gap-3`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${r.dotColor} shrink-0 mt-1`} />
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className="text-sm font-bold text-slate-900">{r.name}</p>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">{r.fn}</span>
                    <ModelBadge model={r.model} />
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mb-1">{r.cost}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{r.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FLUJO 2 — DM-IA
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <SectionLabel>Flujo 2 — Doble Materialidad IA (7 etapas)</SectionLabel>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          El servicio completo de análisis de doble materialidad. Las etapas de{" "}
          <span className="font-semibold text-emerald-700">Carril A</span> responden al instante;
          las de{" "}
          <span className="font-semibold text-amber-700">Carril B</span> se procesan en minutos
          mientras el consultor puede seguir trabajando.
        </p>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["A", "B"] as Lane[]).map((lane) => (
            <LaneBadge key={lane} lane={lane} />
          ))}
        </div>

        {/* ── Diagrama vertical DM-IA ─────────────────────────────────────── */}
        <div className="relative">
          {DM_STEPS.map((step, i) => {
            const l = LANE[step.lane];
            const isLast = i === DM_STEPS.length - 1;
            // color del conector depende del SIGUIENTE paso
            const nextLane = DM_STEPS[i + 1]?.lane;
            const connectorColor = nextLane ? LANE[nextLane].dot.replace("bg-", "#").replace("emerald-500", "6ee7b7").replace("amber-400", "fbbf24").replace("slate-400", "94a3b8") : "#e2e8f0";

            // Color map simple
            const dotHex: Record<Lane, string> = {
              A: "#10b981",
              B: "#f59e0b",
              C: "#94a3b8",
            };
            const connHex = nextLane ? dotHex[nextLane] : "#e2e8f0";

            return (
              <div key={step.n}>
                <div className="flex gap-4">
                  {/* ── Columna izquierda: timeline dot ─── */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: "32px" }}>
                    {/* Dot */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 z-10 shadow-sm ${l.dot}`}
                      style={{ boxShadow: "0 0 0 3px white, 0 0 0 4px currentColor" }}
                    >
                      {step.n}
                    </div>
                  </div>

                  {/* ── Tarjeta del paso ─────────────────── */}
                  <div
                    className={`flex-1 bg-white border border-slate-200 rounded-lg p-4 mb-1 ${
                      step.lane === "B" ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-emerald-400"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <p className="text-sm font-bold text-slate-900">{step.label}</p>
                      <LaneBadge lane={step.lane} />
                      <ModelBadge model={step.model} />
                    </div>

                    {/* Descripción */}
                    <p className="text-xs text-slate-600 leading-relaxed mb-2">
                      {step.desc}
                    </p>

                    {/* Chips: herramienta + timing */}
                    <div className="flex flex-wrap gap-2">
                      {step.tool !== "Solo UI" && (
                        <span className="text-[11px] bg-slate-50 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-sm">
                          <span className="font-semibold">Herramienta:</span> {step.tool}
                        </span>
                      )}
                      <span className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-sm">
                        <span className="font-semibold">Tiempo:</span> {step.timing}
                      </span>
                    </div>

                    {/* Nota especial (ej. QStash paralelo) */}
                    {step.note && (
                      <div className="mt-2 flex items-start gap-1.5 bg-teal-50 border border-teal-200 rounded px-2 py-1.5">
                        <svg className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-[10px] text-teal-800 leading-relaxed">{step.note}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Conector vertical entre pasos ─── */}
                {!isLast && (
                  <div className="flex" style={{ marginLeft: "16px" }}>
                    <div
                      style={{
                        width: "2px",
                        height: "20px",
                        background: `linear-gradient(to bottom, ${dotHex[step.lane]}, ${connHex})`,
                        borderRadius: "1px",
                        marginBottom: "4px",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TABLA DE REFERENCIA — herramientas
      ══════════════════════════════════════════════════════════════════════ */}
      <div>
        <SectionLabel>Referencia rápida — herramientas por flujo</SectionLabel>
        <div className="bg-white border border-slate-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100">
                <th className="px-4 py-2.5 text-left">Herramienta</th>
                <th className="px-4 py-2.5 text-left">Se usa en</th>
                <th className="px-4 py-2.5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[
                { tool: "Anthropic Sonnet", where: "Chat Aurora/Rebeca · AI-fill · Benchmark · Resumen", status: "Activo" },
                { tool: "Anthropic Opus", where: "Chat Elena · Reporte PDF DM", status: "Activo" },
                { tool: "Anthropic Haiku", where: "Chat Valeria · Validaciones rápidas", status: "Activo" },
                { tool: "Anthropic web_search", where: "AI-fill · Referentes ESG · URLs benchmark", status: "Activo" },
                { tool: "LlamaParse", where: "Ingestión de PDFs (informes de competidoras + cliente)", status: "Activo" },
                { tool: "Mistral OCR", where: "Fallback automático cuando LlamaParse se agota", status: "Activo" },
                { tool: "QStash", where: "Benchmark — 1 trabajo por empresa en paralelo", status: "Activo" },
                { tool: "BM25 (keywords)", where: "Chat — recuperación de contexto del cliente", status: "Activo" },
                { tool: "Voyage AI embeddings", where: "Chat — búsqueda semántica (prod pendiente)", status: "Parcial" },
                { tool: "Voyage Rerank", where: "Chat — selección fina de fragmentos", status: "Propuesto" },
                { tool: "Upstash Redis", where: "Caché benchmarks sectoriales repetidos", status: "Propuesto" },
                { tool: "Anthropic Batch API", where: "Reporte PDF · IROs masivos (−50% costo)", status: "Propuesto" },
                { tool: "Gemini Flash", where: "AI-fill extracción pura (−40× costo vs Sonnet)", status: "Propuesto" },
              ].map((row) => {
                const statusColor =
                  row.status === "Activo" ? "text-emerald-700"
                  : row.status === "Parcial" ? "text-amber-700"
                  : "text-slate-400";
                return (
                  <tr key={row.tool} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-slate-800">{row.tool}</td>
                    <td className="px-4 py-2 text-slate-500 leading-relaxed">{row.where}</td>
                    <td className={`px-4 py-2 text-right font-medium text-xs ${statusColor}`}>
                      {row.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Para propuestas y detalle de activación: ver{" "}
          <a href="/configuracion/herramientas" className="text-brand-primary underline underline-offset-2">
            Herramientas →
          </a>{" "}
          · Decisiones de optimización:{" "}
          <a href="/configuracion/auditoria-ia" className="text-brand-primary underline underline-offset-2">
            Auditoría IA →
          </a>
        </p>
      </div>
    </div>
  );
}
