// Tipos y constantes compartidos del módulo de chat.
// Archivo puro — sin "use client" ni imports de React.

export type SessionPreview = {
  id: string;
  client_id: string | null;
  role: RoleId;
  title: string;
  message_count: number;
  updated_at: string;
};

export type ClientOption = {
  id: string;
  name: string;
  sector: string | null;
  completeness: { filled: number; total: number };
};

export type RoleId = "aurora" | "rebeca" | "elena" | "valeria";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  rating?: "up" | "down";
  ts?: number;
  // Identifica qué voz IA respondió. Persistido por mensaje porque el consultor
  // puede cambiar de rol entre turnos — sin esto los mensajes viejos se renderizarían
  // con el avatar del rol actual (atribución incorrecta).
  roleId?: RoleId;
};

// Orden lógico cadena calidad: Autor → Revisor → Elevador → Validador.
// Sin emoji (regla CLAUDE.md: cero emoji en UI cliente). Avatar = monogram.
// desc: frase corta para tooltip de rol inactivo. softColor: avatar cuando inactivo.
export const ROLES: Array<{
  id: RoleId;
  name: string;
  fn: string;
  desc: string;
  color: string;
  softColor: string;
  mono: string;
  borderColor: string;
}> = [
  { id: "aurora", name: "Aurora", fn: "Autor", desc: "Construye el primer borrador", color: "bg-brand-primary-dark", softColor: "bg-brand-primary-light", mono: "A", borderColor: "border-l-brand-primary-dark" },
  { id: "rebeca", name: "Rebeca", fn: "Revisor", desc: "Detecta fallas y omisiones", color: "bg-slate-700", softColor: "bg-slate-200", mono: "R", borderColor: "border-l-slate-500" },
  { id: "elena", name: "Elena", fn: "Elevador", desc: "Insight estratégico y narrativa", color: "bg-slate-800", softColor: "bg-amber-100", mono: "E", borderColor: "border-l-amber-600" },
  { id: "valeria", name: "Valeria", fn: "Validador", desc: "Verifica consistencia y evidencia", color: "bg-slate-600", softColor: "bg-emerald-100", mono: "V", borderColor: "border-l-emerald-700" },
];

export const STARTERS: Record<RoleId, string[]> = {
  aurora: [
    "Estructura de un Estudio de Doble Materialidad",
    "Borrador de introducción para reporte GRI",
    "Plantilla de matriz de stakeholders",
    "Propuesta de alcance de diagnóstico RSE",
  ],
  rebeca: [
    "Revisa este borrador (pega el texto)",
    "Checklist de calidad para informe GRI",
    "Errores comunes en Doble Materialidad",
    "Rubrica de revisión de propuesta comercial",
  ],
  elena: [
    "Qué insight estratégico aporta este hallazgo",
    "Trade-offs de enfoque simple vs doble materialidad",
    "Narrativa ejecutiva para comité de dirección",
    "Recomendaciones post-diagnóstico",
  ],
  valeria: [
    "Valida DoD de un entregable de Doble Materialidad",
    "Inconsistencias entre secciones",
    "Checklist de evidencia para auditoría",
    "Trazabilidad de datos en reporte",
  ],
};

// Modelo Anthropic asignado por rol.
export const MODEL_PER_ROLE: Record<RoleId, string> = {
  aurora: "Sonnet",
  rebeca: "Sonnet",
  elena: "Opus",
  valeria: "Haiku",
};

// Precios por 1M tokens. Input mucho más barato que output. Cache read 90% off del input.
// Estos valores reflejan la lógica server (lib/ai/usage.ts cost estimator).
export const PRICE_INPUT_PER_TOKEN: Record<string, number> = {
  Sonnet: 3 / 1_000_000,
  Opus: 15 / 1_000_000,
  Haiku: 1 / 1_000_000,
};
export const PRICE_OUTPUT_PER_TOKEN: Record<string, number> = {
  Sonnet: 15 / 1_000_000,
  Opus: 75 / 1_000_000,
  Haiku: 5 / 1_000_000,
};
export const PRICE_CACHE_READ_PER_TOKEN: Record<string, number> = {
  Sonnet: 0.3 / 1_000_000,
  Opus: 1.5 / 1_000_000,
  Haiku: 0.1 / 1_000_000,
};
