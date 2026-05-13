import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Herramientas conectadas · Configuración · App ResponSable",
};

export const revalidate = 300; // refresca health checks cada 5 min

// ── Tipos ────────────────────────────────────────────────────────────────────

type HealthStatus = "ok" | "error" | "inactive";

type ToolHealth = {
  status: HealthStatus;
  message?: string;
};

type Tool = {
  name: string;
  envKey: string;
  tagline: string;
  whatItDoes: string;
  whatYouGain: string;
  setupUrl?: string;
  setupLabel?: string;
  health: ToolHealth;
};

// ── Health checks ─────────────────────────────────────────────────────────────

async function checkVoyage(): Promise<ToolHealth> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return { status: "inactive" };
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.VOYAGE_MODEL ?? "voyage-3", input: ["ping"], input_type: "document" }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { status: "ok" };
    if (res.status === 401) return { status: "error", message: "API key inválida o revocada" };
    if (res.status === 429) return { status: "error", message: "Cuota agotada — límite de requests alcanzado" };
    return { status: "error", message: `Error inesperado del servicio (HTTP ${res.status})` };
  } catch {
    return { status: "error", message: "No se pudo contactar Voyage AI — revisa conexión o estado del servicio" };
  }
}

async function checkLlamaParse(): Promise<ToolHealth> {
  const key = process.env.LLAMA_CLOUD_API_KEY;
  if (!key) return { status: "inactive" };
  try {
    // GET al listado de jobs — endpoint ligero, solo verifica autenticación
    const res = await fetch("https://api.cloud.llamaindex.ai/api/parsing/usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { status: "ok" };
    if (res.status === 401 || res.status === 403) return { status: "error", message: "API key inválida o créditos agotados" };
    if (res.status === 402) return { status: "error", message: "Créditos agotados — recarga en cloud.llamaindex.ai" };
    // 404 = endpoint no existe pero auth OK (versión API distinta)
    if (res.status === 404) return { status: "ok" };
    return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
  } catch {
    return { status: "error", message: "No se pudo contactar LlamaParse — revisa conexión o estado del servicio" };
  }
}

async function checkMistralOcr(): Promise<ToolHealth> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return { status: "inactive" };
  try {
    const res = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { status: "ok" };
    if (res.status === 401) return { status: "error", message: "API key inválida o revocada" };
    if (res.status === 429) return { status: "error", message: "Cuota de requests agotada" };
    return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
  } catch {
    return { status: "error", message: "No se pudo contactar Mistral — revisa conexión o estado del servicio" };
  }
}

async function checkQStash(): Promise<ToolHealth> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return { status: "inactive" };
  try {
    const res = await fetch("https://qstash.upstash.io/v2/schedules", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { status: "ok" };
    if (res.status === 401) return { status: "error", message: "Token inválido o revocado" };
    if (res.status === 403) return { status: "error", message: "Sin permisos — verifica el token en console.upstash.com" };
    return { status: "error", message: `Error del servicio (HTTP ${res.status})` };
  } catch {
    return { status: "error", message: "No se pudo contactar QStash — revisa conexión o estado del servicio" };
  }
}

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
  const [voyageHealth, llamaHealth, mistralHealth, qstashHealth] =
    await Promise.all([checkVoyage(), checkLlamaParse(), checkMistralOcr(), checkQStash()]);

  const TOOLS: Tool[] = [
    {
      name: "Voyage AI — Búsqueda semántica",
      envKey: "VOYAGE_API_KEY",
      tagline: "La app entiende el significado de tus preguntas, no solo las palabras exactas.",
      whatItDoes:
        'Convierte cada fragmento de documento en un "punto en el espacio" matemático. Cuando un rol IA busca información, encuentra los fragmentos más cercanos al significado de la pregunta — aunque usen palabras diferentes.',
      whatYouGain:
        "Las respuestas de Aurora, Rebeca, Elena y Valeria se apoyan en las partes relevantes del informe del cliente, no en el documento completo al azar. Menos alucinaciones, más precisión.",
      setupUrl: "https://www.voyageai.com",
      setupLabel: "voyageai.com",
      health: voyageHealth,
    },
    {
      name: "LlamaParse — Lectura de PDFs complejos",
      envKey: "LLAMA_CLOUD_API_KEY",
      tagline: "Lee tablas y columnas de informes GRI/ESRS tal como aparecen en el PDF.",
      whatItDoes:
        "Los PDFs de informes de sustentabilidad tienen tablas multi-columna, indicadores GRI alineados en cuadrícula, y layouts complejos. El lector de PDF estándar los aplana en texto plano y mezcla los datos. LlamaParse preserva la estructura original.",
      whatYouGain:
        "Cuando se ingiere el informe de un competidor o cliente, los datos llegan correctamente estructurados. La IA puede comparar indicadores GRI entre empresas sin confundir columnas.",
      setupUrl: "https://cloud.llamaindex.ai",
      setupLabel: "cloud.llamaindex.ai",
      health: llamaHealth,
    },
    {
      name: "Mistral OCR — Respaldo de LlamaParse",
      envKey: "MISTRAL_API_KEY",
      tagline: "Si LlamaParse no está disponible, Mistral lee las tablas del PDF igual de bien.",
      whatItDoes:
        "Alternativa a LlamaParse para extraer texto y tablas de PDFs. Envía el archivo en una sola llamada (sin espera), extrae el contenido como markdown preservando columnas y estructuras.",
      whatYouGain:
        "Si los créditos de LlamaParse se agotan, la app sigue extrayendo informes con buena calidad de tablas en lugar de caer al lector básico. Costo: $1 por cada 1,000 páginas procesadas.",
      setupUrl: "https://console.mistral.ai",
      setupLabel: "console.mistral.ai",
      health: mistralHealth,
    },
    {
      name: "QStash — Cola de trabajos en paralelo",
      envKey: "QSTASH_TOKEN",
      tagline: "Procesa los informes de muchas empresas al mismo tiempo, sin timeout.",
      whatItDoes:
        "Cuando el cron diario tiene que descargar y procesar 10 informes de competidoras, hacerlos uno por uno tarda demasiado y el servidor se cancela solo. QStash lanza un trabajo independiente por empresa, cada uno con su propio tiempo de espera y reintentos automáticos si falla.",
      whatYouGain:
        "El benchmark de competidoras se mantiene actualizado aunque los PDFs sean pesados o las URLs estén lentas. Si una empresa falla, las demás siguen sin interrupción.",
      setupUrl: "https://console.upstash.com",
      setupLabel: "console.upstash.com",
      health: qstashHealth,
    },
  ];

  const errors = TOOLS.filter((t) => t.health.status === "error");

  return (
    <div className="px-8 py-6 max-w-3xl">
      {/* Alerta global si hay herramientas con error */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-5 border-l-4 border-l-rose-500 bg-rose-50 rounded-r p-4"
        >
          <p className="text-sm font-bold text-rose-900 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 1.5l6.5 12H1.5L8 1.5zM8 6v4M8 11.5v.5" />
            </svg>
            {errors.length === 1
              ? `1 herramienta con problema`
              : `${errors.length} herramientas con problema`}
          </p>
          <ul className="mt-2 space-y-1">
            {errors.map((t) => (
              <li key={t.envKey} className="text-xs text-rose-800 flex items-start gap-1.5">
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

      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
        Herramientas conectadas
      </p>
      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        Servicios externos que potencian la app. Cada uno es opcional — si no
        está activado, la app usa su alternativa incorporada.
      </p>

      <div className="flex flex-col gap-4">
        {TOOLS.map((tool) => {
          const hasError = tool.health.status === "error";
          return (
            <div
              key={tool.envKey}
              className={`bg-white border rounded p-5 shadow-sm ${
                hasError
                  ? "border-rose-300"
                  : "border-slate-200"
              } ${tool.health.status === "inactive" ? "opacity-75" : ""}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-tight">
                    {tool.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 italic">
                    {tool.tagline}
                  </p>
                </div>
                <StatusBadge health={tool.health} />
              </div>

              {/* Alerta inline por herramienta */}
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

              {/* Body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="bg-slate-50 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                    Cómo funciona
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {tool.whatItDoes}
                  </p>
                </div>
                <div className="bg-teal-50 rounded p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">
                    Lo que ganas
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {tool.whatYouGain}
                  </p>
                </div>
              </div>

              {/* Footer: setup si inactiva, env key si hay error */}
              {tool.health.status === "inactive" && tool.setupUrl && (
                <p className="text-[11px] text-slate-500 mt-3 border-t border-slate-100 pt-3">
                  Para activar: crea cuenta en{" "}
                  <a
                    href={tool.setupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary underline underline-offset-2"
                  >
                    {tool.setupLabel ?? tool.setupUrl}
                  </a>{" "}
                  y agrega la API key en Vercel → Variables de entorno (
                  <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">
                    {tool.envKey}
                  </code>
                  ).
                </p>
              )}
              {hasError && (
                <p className="text-[11px] text-slate-500 mt-3 border-t border-rose-100 pt-3">
                  Verifica la variable de entorno{" "}
                  <code className="font-mono text-[10px] bg-slate-100 px-1 rounded">
                    {tool.envKey}
                  </code>{" "}
                  en Vercel → Settings → Environment Variables y redeploya.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-slate-400 mt-8 leading-relaxed">
        Para agregar una herramienta nueva: añadir una entrada al array{" "}
        <code className="font-mono bg-slate-100 px-1 rounded">TOOLS</code> en{" "}
        <code className="font-mono bg-slate-100 px-1 rounded">
          app/(dashboard)/configuracion/herramientas/page.tsx
        </code>
        .
      </p>
    </div>
  );
}
