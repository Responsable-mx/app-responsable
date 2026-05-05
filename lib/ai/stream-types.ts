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

export type ChatStreamDone = {
  type: "done";
  usage: ChatStreamUsage;
  stop_reason: string | null;
  cache_read_tokens: number;
};

export type ChatStreamError = {
  type: "error";
  error: string;
};

export type ChatStreamEvent = ChatStreamDelta | ChatStreamDone | ChatStreamError;

export function isChatStreamEvent(v: unknown): v is ChatStreamEvent {
  if (typeof v !== "object" || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return t === "delta" || t === "done" || t === "error";
}
