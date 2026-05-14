// Tipos compartidos del stream SSE de /api/chat.
// Server (route.ts) y client (ChatWindow) consumen este schema. Si cambia,
// ambos lados actualizan en el mismo PR — antes el formato no estaba tipado y
// un cambio server podía romper el parser client silenciosamente.
//
// NO importar nada server-only aquí — este módulo es isomórfico.

export type ChatStreamDelta = {
  type: "delta";
  text: string;
};

export type ChatStreamUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type ChatStreamWarning = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  evidence?: string;
};

export type ChatStreamDone = {
  type: "done";
  usage: ChatStreamUsage;
  stop_reason: string | null;
  cache_read_tokens: number;
  /** Validador E (Wave 3): warnings detectados en la respuesta IA */
  warnings?: ChatStreamWarning[];
};

export type ChatStreamError = {
  type: "error";
  error: string;
};

/** Emitido antes del primer delta cuando el chat usa fragmentos del informe del cliente. */
export type ChatStreamSources = {
  type: "sources";
  chunks_used: number;
  pages: number[];
};

export type ChatStreamEvent = ChatStreamDelta | ChatStreamDone | ChatStreamError | ChatStreamSources;

export function isChatStreamEvent(v: unknown): v is ChatStreamEvent {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  // D-21: validar también que `text` sea string en delta — evita "...undefined" en UI
  // si Anthropic cambia el formato del evento.
  if (t === "delta") return typeof (v as { text?: unknown }).text === "string";
  return t === "done" || t === "error" || t === "sources";
}
