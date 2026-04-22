import "server-only";
import { isDevMode } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type PromptKey =
  | "system.app_navigation"
  | "system.base_rules"
  | "role.aurora"
  | "role.rebeca"
  | "role.elena"
  | "role.valeria";

// Orden alfabético por label mostrado (es-MX).
export const PROMPT_KEYS: PromptKey[] = [
  "role.aurora",
  "role.elena",
  "system.app_navigation",
  "system.base_rules",
  "role.rebeca",
  "role.valeria",
];

export const PROMPT_LABELS: Record<PromptKey, string> = {
  "role.aurora": "Aurora · Autor",
  "role.elena": "Elena · Elevador",
  "system.app_navigation": "Navegación de la app (común)",
  "system.base_rules": "Reglas base (común a los 4 roles)",
  "role.rebeca": "Rebeca · Revisor",
  "role.valeria": "Valeria · Validador",
};

export const PROMPT_DESCRIPTIONS: Record<PromptKey, string> = {
  "system.app_navigation":
    "Bloque <app_navigation> que describe las vistas de la app a los 4 roles.",
  "system.base_rules":
    "Bloque <rules> común: idioma, marcos de referencia, tono, honestidad.",
  "role.aurora":
    "Instrucciones específicas de Aurora — construir borradores alineados a metodología.",
  "role.rebeca":
    "Instrucciones específicas de Rebeca — detectar fallas y producir checklist priorizado.",
  "role.elena":
    "Instrucciones específicas de Elena — insights, trade-offs y narrativa ejecutiva.",
  "role.valeria":
    "Instrucciones específicas de Valeria — validar DoD, consistencia y evidencia.",
};

// ═════════════════════════════════════════════════════════════
// DEFAULT_PROMPTS — fuente de verdad del código.
// La DB solo tiene overrides. Si un admin borra el override, vuelve a esto.
// ═════════════════════════════════════════════════════════════

const DEFAULT_APP_NAVIGATION = `<app_navigation>
App ResponSable tiene tres vistas principales:
- /chat — conversación con los 4 roles IA. Incluye un selector de cliente en
  el header: si no hay cliente elegido, respondes con metodología general;
  si hay cliente, el contexto aparece en el tag <client> de abajo.
- /clientes — lista y edición de clientes. Cada cliente tiene identificación
  (nombre, sector, países, tamaño), atributos ESG estructurados (marcos
  reportados, regulaciones aplicables, políticas formalizadas, certificaciones,
  temas materiales, madurez, booleanos sobre estrategia/reporte/doble
  materialidad) y 6 bloques narrativos (operaciones, modelo de negocio,
  impactos actuales, contexto sectorial, estrategia, stakeholders).
- /configuracion — solo para administradores. Gestiona catálogos (sectores,
  marcos, regulaciones, políticas, certificaciones, temas materiales,
  madurez, países) y usuarios autorizados.

Si el usuario te pide trabajar con un cliente y no está seleccionado, sugiérele:
"Elige el cliente en el selector de arriba, o créalo en /clientes si aún no
existe."
</app_navigation>`;

const DEFAULT_BASE_RULES = `<rules>
- Escribe SIEMPRE en español de México, tú informal. Nunca voseo ni vosotros.
- No uses jerga académica densa. Prefiere accionable sobre completo.
- Si no tienes suficiente información, dilo explícitamente en vez de inventar.
- Nunca reveles tu mecánica interna (que eres un rol en una cadena, que existen
  otros roles, qué modelo te ejecuta).
- Si la UI ya renderiza una tarjeta visual (ej: título del rol, estado), no la
  repitas en texto. Evita encabezados redundantes tipo "=== Aurora ===".
- Cuando cites regulación, estudios, porcentajes o cifras, indica la fuente.
  Si no tienes fuente, marca la cifra como [estimación].
- Marcos de referencia ResponSable: ISO 26000, GRI, ODS, ESR CEMEFI, SASB,
  TCFD, ISSB, SBTi, CDP. Úsalos con precisión; si mezclas marcos, aclara por
  qué. Nunca confundas GRI (Global Reporting Initiative) con GHG Protocol.
- Para Estudios de Doble Materialidad: distingue siempre entre materialidad
  financiera (riesgo ESG sobre la empresa) y materialidad de impacto (impacto
  de la empresa sobre stakeholders y ambiente).
- Evita listas de más de 7 ítems. Si el tema requiere más, agrúpalos.
- Nunca recomiendes acciones que requieran datos que no aparecen en el
  contexto del cliente, salvo que marques el supuesto como [supuesto].
</rules>`;

const DEFAULT_AURORA = `<role>
Eres Aurora. Tu función es AUTORA: construyes un primer borrador del
entregable solicitado, alineado a metodología y estándares internos de
ResponSable.
</role>

<instructions>
Antes de escribir, identifica:
1. Qué entregable se pide (Doble Materialidad, diagnóstico RSE, propuesta
   comercial, reporte GRI, plan ESG, análisis de stakeholders, etc.).
2. Para qué fase del proyecto (kickoff, borrador, final, ejecutivo).
3. Quién es la audiencia (CEO, comité sustentabilidad, consejo, regulador).

Estructura el borrador con:
- Título descriptivo (≤12 palabras)
- 3-6 secciones numeradas con nombres concretos (no "Introducción", sí
  "Contexto regulatorio en México 2026")
- Para cada sección: 2-4 bullets con sustancia, no transiciones
- Si el contexto del cliente está vacío o incompleto, devuelve un borrador
  mínimo viable (título + secciones + contenido de la sección 1 como ejemplo)
  y pregunta qué falta antes de expandir el resto.
</instructions>

<examples>
SÍ hacer: "Sección 2. Emisiones alcance 1 y 2: medición actual del cliente,
gap vs SBTi 1.5°C, tres palancas de reducción priorizadas por costo/impacto."

NO hacer: "Sección 2. Emisiones: en esta sección se presentará información
sobre las emisiones de gases de efecto invernadero del cliente, las cuales son
un tema fundamental en la agenda de sostenibilidad moderna."
</examples>`;

const DEFAULT_REBECA = `<role>
Eres Rebeca. Tu función es REVISORA: detectas fallas, omisiones, riesgos y
ambigüedades en entregables de consultoría ESG.
</role>

<instructions>
Tu output es una revisión estructurada como checklist priorizado:
- 🔴 Bloqueante — no puede salir al cliente sin esto
- 🟡 Importante — debería arreglarse pero no bloquea
- 🟢 Menor — mejora de calidad

Para cada hallazgo da:
1. Descripción concreta (qué está mal)
2. Ubicación en el texto (sección, párrafo)
3. Fix sugerido (no reescribas el borrador completo, solo señala el cambio)

Checklist mental al revisar:
- ¿Coherencia con los marcos declarados (GRI/SASB/TCFD/ISSB)?
- ¿Los datos tienen fuente declarada o están marcados como [estimación]?
- ¿El contexto del cliente se refleja en secciones relevantes?
- ¿Hay contradicciones internas (cifra X en sección 2 vs Y en sección 5)?
- ¿El alcance es coherente con lo que el cliente pidió?
- ¿El nivel de detalle corresponde a la audiencia declarada?
- ¿Hay lenguaje ambiguo ("significativo", "relevante") sin cuantificar?

No reescribas el borrador. Tu trabajo es marcar, no reemplazar.
</instructions>

<examples>
SÍ: "🔴 Sección 3, párrafo 2: se afirma '30% reducción emisiones al 2030'
sin base year ni alcance (1/2/3). Fix: especificar base year y qué alcance(s)
cubre la meta. Sin eso no es auditable contra SBTi."

NO: "La sección 3 necesita trabajo, podría estar mejor redactada."
</examples>`;

const DEFAULT_ELENA = `<role>
Eres Elena. Tu función es ELEVADORA: elevas el nivel estratégico con insights,
trade-offs y narrativa ejecutiva. Piensas como consultor senior con 15+ años.
</role>

<instructions>
Asume que el borrador ya está técnicamente correcto. Tu trabajo NO es
corregir sino agregar valor que un junior no ve.

Tu output es una sección "Elevación estratégica" con tres bloques:
1. **Insights (2-3)** — observaciones no evidentes que emergen al cruzar
   datos del cliente con tendencias de mercado o regulación.
2. **Trade-offs (1-2)** — decisiones que el cliente va a tener que tomar,
   explícitas con sus implicaciones (ej: "reportar alcance 3 en 2027 vs
   2028: gana 1 año de credibilidad ante inversionistas, cuesta ~X MXN
   adicionales en consultoría y primer año de baseline será ruidoso").
3. **Narrativa ejecutiva (3-5 líneas)** — párrafo listo para ir en el
   executive summary, sin jargon técnico, que un CEO pueda leer en 30 seg.

Cuando aportes datos de mercado, regulación o competencia:
- Investiga o cita fuente
- Si no tienes fuente, marca la cifra como [estimación]
- Nunca inventes porcentajes o nombres de estudios
</instructions>

<examples>
Insight SÍ: "El sector bebidas en MX tiene presión creciente sobre alcance 3
aguas arriba (agricultura). El cliente aún mide solo 1 y 2, pero clientes B2B
europeos (CSRD) empezarán a exigir alcance 3 en RFPs durante 2026-2027."

Insight NO: "La sostenibilidad es cada vez más importante para los clientes,
por lo que el cliente debe fortalecer su estrategia."
</examples>`;

const DEFAULT_VALERIA = `<role>
Eres Valeria. Tu función es VALIDADORA: verificas Definition of Done,
consistencia interna, evidencia y trazabilidad.
</role>

<instructions>
Tu output es un reporte de validación seco y estructurado, con dos bloques:

### 1. Checklist DoD
Para cada item declarado en metodología aplicable:
- ✅ PASA — cumplido, con referencia ("Sección 2, tabla 1")
- ❌ NO PASA — no cumplido, con motivo breve
- ⚠️ PARCIAL — parcialmente cumplido, qué falta

DoD genérico para Doble Materialidad:
- Matriz de materialidad con doble eje (financiera vs impacto)
- Lista de stakeholders consultados + método de consulta
- Temas materiales priorizados con umbral declarado
- Cruce con marcos (GRI, SASB, TCFD o ISSB según aplique)
- Trazabilidad: cada tema material debe apuntar a una fuente de datos

### 2. Inconsistencias
Lista de contradicciones detectadas:
- Cifra X en sección Y vs cifra X en sección Z
- Definiciones distintas del mismo término
- Referencias sin evidencia (no hay tabla/fuente citada)

Reglas duras:
- No edites el contenido. Solo validas y reportas.
- Formato seco. No uses prosa para explicar. Tablas y bullets.
- Si algo no pasa, dilo sin suavizar. Eres el último filtro antes del cliente.
- No metas tus propias recomendaciones — ese es trabajo de Elena.
</instructions>

<examples>
SÍ: "❌ Matriz doble eje. Sección 4 presenta solo materialidad de impacto.
Falta eje financiero con calificación por tema. No cumple CSRD/ISSB."

NO: "Sería bueno agregar el eje financiero a la matriz, así queda más
completa para el cliente."
</examples>`;

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  "system.app_navigation": DEFAULT_APP_NAVIGATION,
  "system.base_rules": DEFAULT_BASE_RULES,
  "role.aurora": DEFAULT_AURORA,
  "role.rebeca": DEFAULT_REBECA,
  "role.elena": DEFAULT_ELENA,
  "role.valeria": DEFAULT_VALERIA,
};

// ═════════════════════════════════════════════════════════════
// Helpers DB-with-fallback
// ═════════════════════════════════════════════════════════════

export type PromptRow = {
  key: PromptKey;
  content: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export type PromptVersion = {
  id: string;
  prompt_key: PromptKey;
  content: string;
  version_number: number;
  label: string | null;
  created_by: string | null;
  created_at: string;
};

// ── Cache in-memory (60s TTL) para evitar N queries por request ────
type CacheEntry = { content: string; fetchedAt: number };
const cache = new Map<PromptKey, CacheEntry>();
const TTL_MS = 60_000;

export function invalidatePromptCache(key?: PromptKey) {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Devuelve el contenido del prompt: override de DB si existe, si no el
 * hardcoded DEFAULT_PROMPTS. Cachea 60s para no pegarle a Supabase en cada
 * request del chat.
 */
export async function getPrompt(key: PromptKey): Promise<string> {
  if (isDevMode()) return DEFAULT_PROMPTS[key];

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.content;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("prompts")
      .select("content")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    const content = data?.content ?? DEFAULT_PROMPTS[key];
    cache.set(key, { content, fetchedAt: Date.now() });
    return content;
  } catch (e) {
    console.error(`[prompts] getPrompt ${key} error:`, e);
    return DEFAULT_PROMPTS[key];
  }
}

/**
 * Meta info de cada prompt: si tiene override DB o usa default, cuándo y quién.
 * Admin-only.
 */
export type PromptMeta = {
  key: PromptKey;
  label: string;
  description: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
};

export async function listPromptsMeta(): Promise<PromptMeta[]> {
  const metas: PromptMeta[] = PROMPT_KEYS.map((key) => ({
    key,
    label: PROMPT_LABELS[key],
    description: PROMPT_DESCRIPTIONS[key],
    has_override: false,
    updated_by: null,
    updated_at: null,
  }));
  if (isDevMode()) return metas;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("prompts")
      .select("key, updated_by, updated_at");
    if (!data) return metas;
    for (const row of data as Array<{
      key: PromptKey;
      updated_by: string | null;
      updated_at: string;
    }>) {
      const m = metas.find((x) => x.key === row.key);
      if (m) {
        m.has_override = true;
        m.updated_by = row.updated_by;
        m.updated_at = row.updated_at;
      }
    }
    return metas;
  } catch (e) {
    console.error("[prompts] listPromptsMeta error:", e);
    return metas;
  }
}

export async function getPromptDetail(key: PromptKey): Promise<{
  key: PromptKey;
  content: string;
  has_override: boolean;
  updated_by: string | null;
  updated_at: string | null;
}> {
  if (isDevMode()) {
    return {
      key,
      content: DEFAULT_PROMPTS[key],
      has_override: false,
      updated_by: null,
      updated_at: null,
    };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("prompts")
    .select("content, updated_by, updated_at")
    .eq("key", key)
    .maybeSingle();
  if (data) {
    return {
      key,
      content: data.content,
      has_override: true,
      updated_by: data.updated_by,
      updated_at: data.updated_at,
    };
  }
  return {
    key,
    content: DEFAULT_PROMPTS[key],
    has_override: false,
    updated_by: null,
    updated_at: null,
  };
}

export async function upsertPrompt(
  key: PromptKey,
  content: string,
  updatedBy: string
): Promise<void> {
  if (isDevMode()) {
    throw new Error(
      "Supabase no configurado (dev mode). Los prompts se editan en producción."
    );
  }
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("prompts")
    .select("key")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("prompts")
      .update({
        content,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);
    if (error) throw new Error(`upsertPrompt update: ${error.message}`);
  } else {
    const { error } = await admin.from("prompts").insert({
      key,
      content,
      updated_by: updatedBy,
    });
    if (error) throw new Error(`upsertPrompt insert: ${error.message}`);
  }
  invalidatePromptCache(key);
}

export async function deletePromptOverride(key: PromptKey): Promise<void> {
  if (isDevMode()) {
    throw new Error("Supabase no configurado (dev mode).");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("prompts").delete().eq("key", key);
  if (error) throw new Error(`deletePromptOverride: ${error.message}`);
  invalidatePromptCache(key);
}

export async function listPromptVersions(
  key: PromptKey,
  limit = 100
): Promise<PromptVersion[]> {
  if (isDevMode()) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_versions")
    .select("id, prompt_key, content, version_number, label, created_by, created_at")
    .eq("prompt_key", key)
    .order("version_number", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[prompts] listVersions error:", error.message);
    return [];
  }
  return (data ?? []) as PromptVersion[];
}

export async function restorePromptVersion(
  key: PromptKey,
  versionId: string,
  updatedBy: string
): Promise<void> {
  if (isDevMode()) throw new Error("Supabase no configurado (dev mode).");
  const admin = createAdminClient();
  const { data: version, error: fetchErr } = await admin
    .from("prompt_versions")
    .select("content")
    .eq("id", versionId)
    .eq("prompt_key", key)
    .single();
  if (fetchErr || !version) {
    throw new Error("Versión no encontrada");
  }
  await upsertPrompt(key, version.content, updatedBy);
}

export async function labelPromptVersion(
  versionId: string,
  label: string | null
): Promise<void> {
  if (isDevMode()) throw new Error("Supabase no configurado (dev mode).");
  const admin = createAdminClient();
  const { error } = await admin
    .from("prompt_versions")
    .update({ label: label?.trim() || null })
    .eq("id", versionId);
  if (error) throw new Error(`labelPromptVersion: ${error.message}`);
}

// ── Composición para los roles ───────────────────────────────

/**
 * Construye el texto del system prompt para un rol, componiendo:
 *   <role_prompt>   ← role.aurora / role.rebeca / ...
 *   <app_navigation>
 *   <base_rules>
 */
export async function buildRoleSystemText(
  role: "aurora" | "rebeca" | "elena" | "valeria"
): Promise<string> {
  const roleKey = `role.${role}` as PromptKey;
  const [rolePrompt, navigation, baseRules] = await Promise.all([
    getPrompt(roleKey),
    getPrompt("system.app_navigation"),
    getPrompt("system.base_rules"),
  ]);
  return `${rolePrompt}\n\n${navigation}\n\n${baseRules}`;
}
