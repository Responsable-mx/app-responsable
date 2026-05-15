import type { Metadata } from "next";
import { TOOL_HEALTH_CHECKS } from "@/lib/ai/tool-health";
import type { ToolHealth } from "@/lib/ai/tool-health";

export const metadata: Metadata = {
  title: "Herramientas conectadas · Configuración · App ResponSable",
};

export const revalidate = 300; // refresca health checks cada 5 min

// ── Tipos ─────────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "error" | "inactive";

/**
 * Catálogo unificado de herramientas.
 *
 * Al IMPLEMENTAR una herramienta propuesta:
 *   1. Cambiar `implemented: false` → `true`
 *   2. Añadir `healthKey` apuntando a la función en HEALTH_CHECKS
 *   3. Eliminar campos `cost`/`freeTier`/`usedIn` si ya no son relevantes
 *
 * Al AGREGAR una herramienta nueva:
 *   1. Añadir su función de check en HEALTH_CHECKS
 *   2. Añadir la entrada al catálogo con `implemented: false`
 *
 * La página se auto-categoriza: implemented=true → "Conectadas" / false → "Propuestas"
 */
type CatalogEntry = {
  id: string;
  name: string;
  tagline: string;
  whatItDoes: string;
  whatYouGain: string;
  /** true = el código ya lo usa. false = propuesta pendiente de implementar. */
  implemented: boolean;
  /** Clave en HEALTH_CHECKS. null si implemented=false (sin ping aún). */
  healthKey: string | null;
  envKey?: string;
  setupUrl?: string;
  setupLabel?: string;
  /** Solo propuestas (implemented=false) */
  cost?: string;
  freeTier?: string;
  usedIn?: string;
};

// ── Health checks ─────────────────────────────────────────────────────────────
// Las funciones viven en lib/ai/tool-health.ts (fuente única).
// La clave de cada check debe coincidir con `healthKey` en TOOL_CATALOG.
const HEALTH_CHECKS = TOOL_HEALTH_CHECKS;

// ── Catálogo unificado ────────────────────────────────────────────────────────
// Para promover una propuesta a activa: implemented: false → true + healthKey.
// Para agregar una herramienta nueva: agregar entrada aquí + función en HEALTH_CHECKS.

const TOOL_CATALOG: CatalogEntry[] = [
  // ── Implementadas ──────────────────────────────────────────────────────────
  {
    id: "voyage-embed",
    name: "Voyage AI — Búsqueda semántica",
    tagline: "La app entiende el significado de tus preguntas, no solo las palabras exactas.",
    whatItDoes:
      'Convierte cada fragmento de documento en un "punto en el espacio" matemático. Cuando un rol IA busca información, encuentra los fragmentos más cercanos al significado de la pregunta — aunque usen palabras diferentes.',
    whatYouGain:
      "Las respuestas de Aurora, Rebeca, Elena y Valeria se apoyan en las partes relevantes del informe del cliente, no en el documento completo al azar. Menos alucinaciones, más precisión.",
    implemented: true,
    healthKey: "voyage",
    envKey: "VOYAGE_API_KEY",
    setupUrl: "https://www.voyageai.com",
    setupLabel: "voyageai.com",
  },
  {
    id: "voyage-rerank",
    name: "Voyage Rerank — Selección precisa de fragmentos",
    tagline: "Elige los fragmentos más relevantes del informe antes de enviárselos a la IA.",
    whatItDoes:
      "Después de buscar los 20 fragmentos más cercanos, Voyage Rerank los reordena según cuál es realmente más útil para la pregunta específica. El chat aplica este reranking a los 8 mejores antes de construir el contexto.",
    whatYouGain:
      "Aurora, Rebeca, Elena y Valeria reciben fragmentos más precisos del informe del cliente → respuestas más exactas, menos alucinaciones. Sin costo adicional — incluido con la misma API key de Voyage.",
    implemented: true,
    healthKey: "voyage", // misma clave = mismo ping, sin doble llamada
    envKey: "VOYAGE_API_KEY",
    setupUrl: "https://www.voyageai.com",
    setupLabel: "voyageai.com",
  },
  {
    id: "llamaparse",
    name: "LlamaParse — Lectura de PDFs complejos",
    tagline: "Lee tablas y columnas de informes GRI/ESRS tal como aparecen en el PDF.",
    whatItDoes:
      "Los PDFs de informes de sustentabilidad tienen tablas multi-columna, indicadores GRI alineados en cuadrícula, y layouts complejos. El lector de PDF estándar los aplana en texto plano y mezcla los datos. LlamaParse preserva la estructura original.",
    whatYouGain:
      "Cuando se ingiere el informe de un competidor o cliente, los datos llegan correctamente estructurados. La IA puede comparar indicadores GRI entre empresas sin confundir columnas.",
    implemented: true,
    healthKey: "llama",
    envKey: "LLAMA_CLOUD_API_KEY",
    setupUrl: "https://cloud.llamaindex.ai",
    setupLabel: "cloud.llamaindex.ai",
  },
  {
    id: "mistral-ocr",
    name: "Mistral OCR — Respaldo de LlamaParse",
    tagline: "Si LlamaParse no está disponible, Mistral lee las tablas del PDF igual de bien.",
    whatItDoes:
      "Alternativa a LlamaParse para extraer texto y tablas de PDFs. Envía el archivo en una sola llamada (sin espera), extrae el contenido como markdown preservando columnas y estructuras.",
    whatYouGain:
      "Si los créditos de LlamaParse se agotan, la app sigue extrayendo informes con buena calidad de tablas en lugar de caer al lector básico. Costo: $1 por cada 1,000 páginas procesadas.",
    implemented: true,
    healthKey: "mistral",
    envKey: "MISTRAL_API_KEY",
    setupUrl: "https://console.mistral.ai",
    setupLabel: "console.mistral.ai",
  },
  {
    id: "qstash",
    name: "QStash — Cola de trabajos en paralelo",
    tagline: "Procesa los informes de muchas empresas al mismo tiempo, sin timeout.",
    whatItDoes:
      "Cuando el cron diario tiene que descargar y procesar 10 informes de competidoras, hacerlos uno por uno tarda demasiado y el servidor se cancela solo. QStash lanza un trabajo independiente por empresa, cada uno con su propio tiempo de espera y reintentos automáticos si falla.",
    whatYouGain:
      "El benchmark de competidoras se mantiene actualizado aunque los PDFs sean pesados o las URLs estén lentas. Si una empresa falla, las demás siguen sin interrupción.",
    implemented: true,
    healthKey: "qstash",
    envKey: "QSTASH_TOKEN",
    setupUrl: "https://console.upstash.com",
    setupLabel: "console.upstash.com",
  },
  {
    id: "batch-api",
    name: "Anthropic Batch API — Generación en segundo plano",
    tagline: "Genera reportes y bloques largos al 50% del costo, sin bloquear al consultor.",
    whatItDoes:
      "En lugar de esperar a que Opus genere el reporte PDF o los IROs en tiempo real, la tarea se encola como trabajo en segundo plano. Anthropic lo procesa de forma asíncrona y la app recupera el resultado cuando está listo.",
    whatYouGain:
      "50% de descuento automático en los pasos más costosos: Reporte DM (etapa 7) e IROs por empresa (etapa 4). El consultor puede seguir trabajando mientras se genera. Sin variable adicional — usa la misma API key.",
    implemented: true,
    healthKey: "batch",
    envKey: "ANTHROPIC_API_KEY",
    setupUrl: "https://docs.anthropic.com/en/docs/build-with-claude/message-batches",
    setupLabel: "docs.anthropic.com",
  },

  // ── Propuestas (implemented: false) ───────────────────────────────────────
  // Para activar: implemented → true, añadir healthKey, agregar fn en HEALTH_CHECKS.
  {
    id: "upstash-redis",
    name: "Upstash Redis — Caché de respuestas repetidas",
    tagline: "Evita llamar a la IA cuando la respuesta ya existe.",
    whatItDoes:
      "Guarda en memoria las respuestas de la IA (benchmark de empresas, tabla de temas DM) durante días. Si el consultor ejecuta la misma análisis dos veces con los mismos datos, responde al instante sin cobrar tokens.",
    whatYouGain:
      "Re-run del benchmark: de 2-10 minutos y $0.35-0.60 a <1 segundo y $0. Re-run de tabla de temas: de 40-60 segundos y $0.22 a <1 segundo y $0. Ya tenemos cuenta de Upstash vía QStash.",
    implemented: true,
    healthKey: "redis",
    envKey: "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN",
    setupUrl: "https://console.upstash.com",
    setupLabel: "console.upstash.com",
  },
  {
    id: "gemini-flash",
    name: "Gemini Flash 2.0 — Extracción económica de datos",
    tagline: "Extrae datos de documentos a 40× menor costo que el modelo anterior.",
    whatItDoes:
      "Modelo de Google especializado en leer documentos y extraer información estructurada (nombres, números, fechas, indicadores GRI). No genera narrativa — solo extrae en JSON. Es el primer paso del AI-fill cuando hay documentos del cliente disponibles.",
    whatYouGain:
      "El fast path de AI-fill pasó de Haiku ($0.25/1M) a Gemini Flash ($0.075/1M) — 3× más barato en extracción pura. Sonnet + web_search sigue activo como fallback cuando faltan documentos. Ahorro estimado: $20-40/mes en volumen piloto.",
    implemented: true,
    healthKey: "gemini",
    envKey: "GOOGLE_AI_API_KEY",
    setupUrl: "https://aistudio.google.com",
    setupLabel: "Google AI Studio",
  },
];

// ── UI helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ health }: { health: ToolHealth }) {
  if (health.status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Activa
      </span>
    );
  }
  if (health.status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
      Inactiva
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HerramientasPage() {
  // Correr cada health check único una sola vez (dedup por healthKey).
  const uniqueKeys = [...new Set(TOOL_CATALOG.map((e) => e.healthKey).filter(Boolean))] as string[];
  const healthResults = Object.fromEntries(
    await Promise.all(uniqueKeys.map(async (k) => [k, await HEALTH_CHECKS[k]!()]))
  ) as Record<string, ToolHealth>;

  const INACTIVE: ToolHealth = { status: "inactive" };

  const active = TOOL_CATALOG
    .filter((e) => e.implemented)
    .map((e) => ({ ...e, health: e.healthKey ? (healthResults[e.healthKey] ?? INACTIVE) : INACTIVE }));

  const proposed = TOOL_CATALOG.filter((e) => !e.implemented);

  const errors = active.filter((t) => t.health.status === "error");

  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Alerta global si hay herramientas con error */}
      {errors.length > 0 && (
        <div role="alert" className="mb-5 border-l-4 border-l-rose-500 bg-rose-50 rounded-r p-4">
          <p className="text-sm font-bold text-rose-900 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 1.5l6.5 12H1.5L8 1.5zM8 6v4M8 11.5v.5" />
            </svg>
            {errors.length === 1 ? "1 herramienta con problema" : `${errors.length} herramientas con problema`}
          </p>
          <ul className="mt-2 space-y-1">
            {errors.map((t) => (
              <li key={t.id} className="text-xs text-rose-800 flex items-start gap-1.5">
                <span className="font-semibold shrink-0">{t.name.split(" — ")[0]}:</span>
                <span>{t.health.message}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-rose-700 mt-2">
            Este panel se actualiza automáticamente cada 5 minutos. Recarga la página para ver el estado actual.
          </p>
        </div>
      )}

      {/* ── Herramientas conectadas ──────────────────────────────────────────── */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Herramientas conectadas
      </p>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        Servicios externos que potencian la app. Cada uno es opcional — si no está activado, la app usa su alternativa incorporada.
      </p>

      <div className="flex flex-col gap-4">
        {active.map((tool) => {
          const hasError = tool.health.status === "error";
          return (
            <div
              key={tool.id}
              className={`bg-white border rounded p-5 shadow-sm ${hasError ? "border-rose-300" : "border-slate-200"} ${tool.health.status === "inactive" ? "opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-tight">{tool.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 italic">{tool.tagline}</p>
                </div>
                <StatusBadge health={tool.health} />
              </div>

              {hasError && (
                <div className="mb-3 bg-rose-50 border border-rose-200 rounded px-3 py-2 flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 5v3M8 10v.5" />
                  </svg>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    <span className="font-semibold">Problema detectado:</span> {tool.health.message}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Cómo funciona</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{tool.whatItDoes}</p>
                </div>
                <div className="bg-teal-50 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Lo que ganas</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{tool.whatYouGain}</p>
                </div>
              </div>

              {tool.health.status === "ok" && (
                <p className="text-[11px] text-slate-400 mt-3 border-t border-slate-100 pt-3">
                  <a href="/configuracion/flujos-ia" className="text-brand-primary hover:underline underline-offset-2">
                    Ver cómo encaja en el pipeline →
                  </a>
                </p>
              )}
              {tool.health.status === "inactive" && tool.setupUrl && (
                <p className="text-[11px] text-slate-500 mt-3 border-t border-slate-100 pt-3">
                  Para activar: crea cuenta en{" "}
                  <a href={tool.setupUrl} target="_blank" rel="noopener noreferrer" className="text-brand-primary underline underline-offset-2">
                    {tool.setupLabel ?? tool.setupUrl}
                  </a>{" "}
                  y agrega la API key en Vercel → Variables de entorno (
                  <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">{tool.envKey}</code>).
                </p>
              )}
              {hasError && (
                <p className="text-[11px] text-slate-500 mt-3 border-t border-rose-100 pt-3">
                  Verifica la variable de entorno{" "}
                  <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">{tool.envKey}</code>{" "}
                  en Vercel → Settings → Environment Variables y redeploya.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Herramientas propuestas ──────────────────────────────────────────── */}
      {proposed.length > 0 && (
        <div className="mt-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
            Herramientas propuestas
          </p>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Herramientas evaluadas y recomendadas para la siguiente fase. Cada una reduce costo, mejora velocidad o precisión en un flujo específico. Ninguna es obligatoria — la app funciona sin ellas.
          </p>
          <div className="flex flex-col gap-4">
            {proposed.map((tool) => (
              <div key={tool.id} className="bg-white border border-slate-200 border-l-4 border-l-amber-400 rounded p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 leading-tight">{tool.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 italic">{tool.tagline}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-sm shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Propuesta
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div className="bg-slate-50 rounded p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Cómo funciona</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{tool.whatItDoes}</p>
                  </div>
                  <div className="bg-teal-50 rounded p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">Lo que ganas</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{tool.whatYouGain}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-600">
                  {tool.cost && (
                    <div>
                      <span className="font-semibold text-slate-700">Costo:</span>{" "}
                      {tool.cost}
                      {tool.freeTier && !tool.freeTier.startsWith("Sin free") && (
                        <> · <span className="text-emerald-700 font-medium">{tool.freeTier}</span></>
                      )}
                    </div>
                  )}
                  {tool.usedIn && (
                    <div>
                      <span className="font-semibold text-slate-700">Se usa en:</span>{" "}
                      {tool.usedIn}
                    </div>
                  )}
                  <div>
                    {tool.envKey && (
                      <>
                        <span className="font-semibold text-slate-700">Variable necesaria:</span>{" "}
                        <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">{tool.envKey}</code>
                      </>
                    )}
                    {tool.setupUrl && (
                      <>
                        {" · "}
                        <a href={tool.setupUrl} target="_blank" rel="noopener noreferrer" className="text-brand-primary underline underline-offset-2">
                          {tool.setupLabel ?? tool.setupUrl}
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 mt-8 leading-relaxed">
        Para activar una herramienta propuesta: pide al equipo técnico que agregue la variable de entorno correspondiente en el servidor.
        Para agregar una herramienta nueva al catálogo: contacta al equipo técnico — requiere un cambio en el código de la app.
      </p>
    </div>
  );
}
