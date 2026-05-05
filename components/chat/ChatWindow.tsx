"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { isChatStreamEvent } from "@/lib/ai/stream-types";

type ClientOption = {
  id: string;
  name: string;
  sector: string | null;
  completeness: { filled: number; total: number };
};
type RoleId = "aurora" | "rebeca" | "elena" | "valeria";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  rating?: "up" | "down";
  ts?: number;
};

const MODEL_PER_ROLE: Record<RoleId, string> = {
  aurora: "Sonnet",
  rebeca: "Sonnet",
  elena: "Opus",
  valeria: "Haiku",
};

// Precios por 1M tokens. Input mucho más barato que output. Cache read 90% off del input.
// Estos valores reflejan la lógica server (lib/ai/usage.ts cost estimator).
const PRICE_INPUT_PER_TOKEN: Record<string, number> = {
  Sonnet: 3 / 1_000_000,
  Opus: 15 / 1_000_000,
  Haiku: 1 / 1_000_000,
};
const PRICE_OUTPUT_PER_TOKEN: Record<string, number> = {
  Sonnet: 15 / 1_000_000,
  Opus: 75 / 1_000_000,
  Haiku: 5 / 1_000_000,
};
const PRICE_CACHE_READ_PER_TOKEN: Record<string, number> = {
  Sonnet: 0.3 / 1_000_000,
  Opus: 1.5 / 1_000_000,
  Haiku: 0.1 / 1_000_000,
};

// Orden lógico cadena calidad: Autor → Revisor → Elevador → Validador.
// Sin emoji (regla CLAUDE.md: cero emoji en UI cliente). Avatar = monogram.
const ROLES: Array<{
  id: RoleId;
  name: string;
  fn: string;
  color: string;
  mono: string;
}> = [
  { id: "aurora", name: "Aurora", fn: "Autor", color: "bg-brand-primary-dark", mono: "A" },
  { id: "rebeca", name: "Rebeca", fn: "Revisor", color: "bg-slate-700", mono: "R" },
  { id: "elena", name: "Elena", fn: "Elevador", color: "bg-indigo-800", mono: "E" },
  { id: "valeria", name: "Valeria", fn: "Validador", color: "bg-emerald-800", mono: "V" },
];

/**
 * Convierte errores técnicos del backend en mensajes accionables para el consultor.
 * Nunca exponer "Invalid UUID", códigos HTTP crudos ni stack traces.
 */
function humanizeError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid uuid") || m.includes("uuid")) {
    return "El cliente seleccionado no es válido. Recarga la página o vuelve a Clientes.";
  }
  if (m.includes("anthropic_api_key")) {
    return "El servicio de IA no está configurado. Avísale al administrador.";
  }
  if (m.includes("no autorizado")) {
    return "Tu sesión expiró. Vuelve a iniciar sesión.";
  }
  if (m.includes("json inválido") || m.includes("json invalido")) {
    return "Error técnico al enviar. Reintenta en unos segundos.";
  }
  // Si ya viene en español natural (rate limit, timeout), pasar tal cual.
  return raw;
}

const STARTERS: Record<RoleId, string[]> = {
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

export function ChatWindow({
  clients,
  initialClientId,
}: {
  clients: ClientOption[];
  initialClientId?: string;
}) {
  const [role, setRole] = useState<RoleId>("aurora");
  const [clientId, setClientId] = useState<string>(initialClientId ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [pendingRoleChange, setPendingRoleChange] = useState<RoleId | null>(
    null
  );
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Acumulado real de tokens y costo desde eventos `done` del SSE.
  // Antes: estimación length/4 — siempre subestimaba input (system prompt no contado).
  const [usageAcc, setUsageAcc] = useState({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalTokens = usageAcc.inputTokens + usageAcc.outputTokens + usageAcc.cacheReadTokens;
  const totalCost = usageAcc.costUsd;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const currentRole = ROLES.find((r) => r.id === role)!;
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  function handleRoleClick(next: RoleId) {
    if (next === role) return;
    if (messages.length === 0) {
      setRole(next);
      return;
    }
    // F2: confirm antes de descartar la conversación
    setPendingRoleChange(next);
  }

  function confirmRoleChange() {
    if (pendingRoleChange) {
      setRole(pendingRoleChange);
      setMessages([]);
      setError("");
      setUsageAcc({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 });
    }
    setPendingRoleChange(null);
  }

  async function send(prompt: string) {
    if (!prompt.trim() || streaming) return;
    setError("");
    const userMsg: ChatMessage = { role: "user", content: prompt, ts: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((m) => [...m, { role: "assistant", content: "", ts: Date.now() }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          clientId: clientId || null,
          messages: history,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: "Error" }));
        setError(humanizeError(data.error ?? "Error al enviar"));
        setMessages((m) => m.slice(0, -1));
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const raw: unknown = JSON.parse(line.slice(6));
            if (!isChatStreamEvent(raw)) {
              // Evento desconocido — log silencioso. Antes se ignoraba sin pista.
              console.warn("[chat] evento SSE desconocido:", raw);
              continue;
            }
            if (raw.type === "delta") {
              setMessages((m) => {
                const last = m[m.length - 1];
                if (!last || last.role !== "assistant") return m;
                return [
                  ...m.slice(0, -1),
                  { ...last, content: last.content + raw.text },
                ];
              });
            } else if (raw.type === "done") {
              // Acumular tokens reales del turno + calcular costo según modelo del rol.
              const modelKey = MODEL_PER_ROLE[role];
              const inputTokens = raw.usage.input_tokens ?? 0;
              const outputTokens = raw.usage.output_tokens ?? 0;
              const cacheReadTokens = raw.usage.cache_read_input_tokens ?? 0;
              const turnCost =
                inputTokens * (PRICE_INPUT_PER_TOKEN[modelKey] ?? PRICE_INPUT_PER_TOKEN.Sonnet) +
                outputTokens * (PRICE_OUTPUT_PER_TOKEN[modelKey] ?? PRICE_OUTPUT_PER_TOKEN.Sonnet) +
                cacheReadTokens *
                  (PRICE_CACHE_READ_PER_TOKEN[modelKey] ?? PRICE_CACHE_READ_PER_TOKEN.Sonnet);
              setUsageAcc((prev) => ({
                inputTokens: prev.inputTokens + inputTokens,
                outputTokens: prev.outputTokens + outputTokens,
                cacheReadTokens: prev.cacheReadTokens + cacheReadTokens,
                costUsd: prev.costUsd + turnCost,
              }));
            } else if (raw.type === "error") {
              setError(raw.error);
            }
          } catch {
            /* ignore partial json */
          }
        }
      }
    } catch (e) {
      const err = e as { name?: string };
      if (err.name !== "AbortError") {
        console.error(e);
        setError("Sin conexión con el servidor. Reintenta cuando recuperes la red.");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function resetChat() {
    setMessages([]);
    setError("");
    setUsageAcc({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 });
  }

  function rateMessage(idx: number, rating: "up" | "down") {
    setMessages((m) =>
      m.map((msg, i) =>
        i === idx ? { ...msg, rating: msg.rating === rating ? undefined : rating } : msg
      )
    );
  }

  function copyMessage(idx: number, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
  }

  function retryLast() {
    if (streaming) return;
    const lastUserIdx = messages
      .map((m, i) => (m.role === "user" ? i : -1))
      .filter((i) => i >= 0)
      .at(-1);
    if (lastUserIdx === undefined) return;
    const lastUser = messages[lastUserIdx];
    setMessages(messages.slice(0, lastUserIdx));
    void send(lastUser.content);
  }

  function exportConversation() {
    const lines: string[] = [
      `# Conversación con ${currentRole.name} (${currentRole.fn})`,
      ``,
      selectedClient ? `Cliente: ${selectedClient.name}` : `Sin cliente · metodología general`,
      `Fecha: ${new Date().toLocaleString("es-MX")}`,
      ``,
      `---`,
      ``,
    ];
    for (const m of messages) {
      if (m.role === "user") lines.push(`**Consultor:** ${m.content}`, "");
      else lines.push(`**${currentRole.name}:** ${m.content}`, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${currentRole.name.toLowerCase()}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ctxPct = selectedClient
    ? Math.round((selectedClient.completeness.filled / Math.max(selectedClient.completeness.total, 1)) * 100)
    : null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        {/* Cliente badge row */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1" data-tour="client-picker">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente</span>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                resetChat();
              }}
              className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded px-3 py-1 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 max-w-[280px] truncate"
            >
              <option value="">Sin cliente (metodología general)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.sector ? ` · ${c.sector}` : ""}
                </option>
              ))}
            </select>
            {selectedClient && ctxPct !== null && (
              <>
                <span
                  className={`text-[11px] rounded-full px-2 py-0.5 font-medium border tabular-nums ${
                    ctxPct === 100
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : ctxPct >= 50
                        ? "bg-brand-primary-light text-brand-primary-dark border-brand-primary/20"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                  title={`${selectedClient.completeness.filled} de ${selectedClient.completeness.total} campos de contexto llenos`}
                >
                  {selectedClient.completeness.filled}/{selectedClient.completeness.total} campos
                </span>
                <a
                  href={`/clientes/${selectedClient.id}`}
                  className="text-[11px] text-slate-500 hover:text-brand-primary transition-colors hidden md:inline"
                  title="Ver ficha del cliente"
                >
                  Ver ficha →
                </a>
              </>
            )}
          </div>
          {selectedClient && messages.length > 0 && (
            <button
              type="button"
              onClick={resetChat}
              className="text-[11px] text-slate-500 hover:text-rose-600 transition-colors"
              title="Limpiar conversación"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Role chain */}
        <div
          className="flex items-center gap-1 bg-slate-100 rounded p-0.5 w-fit"
          data-tour="role-selector"
        >
          {ROLES.map((r, i) => {
            const isActive = role === r.id;
            return (
              <div key={r.id} className="flex items-center">
                <button
                  onClick={() => handleRoleClick(r.id)}
                  className={`px-2 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  aria-pressed={isActive}
                  title={`${r.name} · ${r.fn}`}
                >
                  <span
                    aria-hidden
                    className={`w-5 h-5 rounded-sm flex items-center justify-center text-[10px] font-bold tracking-tight text-white ${
                      isActive ? r.color : "bg-slate-400"
                    }`}
                  >
                    {r.mono}
                  </span>
                  <span>{r.name}</span>
                  <span className="text-slate-500 font-normal text-[10px] uppercase tracking-wider">
                    {r.fn}
                  </span>
                </button>
                {i < ROLES.length - 1 && (
                  <svg className="w-3 h-3 text-slate-300 mx-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </header>

      {selectedClient && selectedClient.completeness.filled < 6 && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-6 py-2 flex items-center gap-2"
        >
          <svg
            aria-hidden
            className="w-3.5 h-3.5 shrink-0 text-amber-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.75}
              d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
          </svg>
          <span>
            El contexto de <strong>{selectedClient.name}</strong> tiene{" "}
            {selectedClient.completeness.filled}/6 bloques llenos. Los roles
            responden mejor cuando está completo.{" "}
            <a
              href={`/clientes/${selectedClient.id}`}
              className="underline hover:text-amber-700 font-medium"
            >
              Completar ahora →
            </a>
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="py-10 max-w-2xl mx-auto" data-tour="empty-state">
              <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-200">
                <div
                  className={`w-9 h-9 rounded flex items-center justify-center text-white text-sm font-bold shrink-0 ${currentRole.color}`}
                  aria-hidden
                >
                  {currentRole.mono}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {currentRole.fn} · {MODEL_PER_ROLE[role]}
                  </p>
                  <h2 className="text-base font-bold text-slate-900 leading-tight truncate">
                    {currentRole.name}
                  </h2>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                {clientId
                  ? "Contexto de cliente cargado. Comienza con un objetivo o usa una sugerencia."
                  : "Sin cliente seleccionado. Respondo sobre metodología general."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTERS[role].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2.5 bg-white border border-slate-200 rounded hover:border-brand-primary hover:bg-brand-primary-light transition-colors text-slate-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const isLastAssistant =
              m.role === "assistant" &&
              i === messages.map((mm, k) => (mm.role === "assistant" ? k : -1)).filter((k) => k >= 0).at(-1);
            const showActions = m.role === "assistant" && !!m.content && !streaming;
            const tsLabel = m.ts
              ? new Date(m.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
              : null;
            return (
              <div key={i} className="animate-fade-in">
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className={`w-7 h-7 rounded shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${
                      m.role === "user" ? "bg-slate-700" : currentRole.color
                    }`}
                  >
                    {m.role === "user" ? "Tú" : currentRole.mono}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="text-xs font-semibold text-slate-900 leading-none">
                        {m.role === "user" ? "Consultor" : currentRole.name}
                      </p>
                      {m.role === "assistant" && (
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
                          {currentRole.fn}
                        </span>
                      )}
                      {tsLabel && (
                        <span className="text-[10px] text-slate-400 tabular-nums">{tsLabel}</span>
                      )}
                    </div>
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-1 text-slate-800">
                        {m.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        ) : (
                          <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{m.content}</p>
                    )}
                  {showActions && (
                    <div className="flex items-center gap-1 mt-1 px-2">
                      <button
                        onClick={() => rateMessage(i, "up")}
                        className={`p-1 rounded transition-colors ${m.rating === "up" ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}
                        title="Útil"
                      >
                        <svg className="w-3.5 h-3.5" fill={m.rating === "up" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => rateMessage(i, "down")}
                        className={`p-1 rounded transition-colors ${m.rating === "down" ? "text-rose-500" : "text-slate-300 hover:text-slate-500"}`}
                        title="No útil"
                      >
                        <svg className="w-3.5 h-3.5" fill={m.rating === "down" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => copyMessage(i, m.content)}
                        className="p-1 rounded text-slate-300 hover:text-slate-500 transition-colors"
                        title="Copiar"
                      >
                        {copiedIdx === i ? (
                          <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                      {isLastAssistant && (
                        <button
                          onClick={retryLast}
                          className="p-1 rounded text-slate-300 hover:text-brand-primary transition-colors"
                          title="Regenerar respuesta"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            );
          })}

          {error && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 rounded p-3 flex items-start gap-3"
            >
              <svg
                aria-hidden
                className="w-4 h-4 text-rose-700 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                <path strokeLinecap="round" strokeWidth={1.75} d="M12 8v4M12 16h.01" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-rose-900">{error}</p>
                {messages.some((m) => m.role === "user") && (
                  <button
                    type="button"
                    onClick={retryLast}
                    className="mt-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 transition-colors inline-flex items-center gap-1"
                  >
                    Reintentar
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="bg-white border-t border-slate-200 px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={`Escribe a ${currentRole.name}...`}
              rows={1}
              className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none max-h-40"
              disabled={streaming}
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="px-4 py-2 bg-slate-700 text-white rounded text-sm font-medium hover:bg-slate-800"
              >
                Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 bg-brand-primary-hover text-white rounded text-sm font-medium hover:bg-brand-primary-dark disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            )}
          </form>
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-slate-500">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${currentRole.color} mr-1 align-middle`} />
              {currentRole.name} · {MODEL_PER_ROLE[role]} · ↵ enviar · ⇧↵ nueva línea
            </p>
            <div className="flex items-center gap-3">
              {totalTokens > 0 && (
                <p className="text-[10px] text-slate-500 tabular-nums">
                  ~${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(3)} · {totalTokens.toLocaleString()} tokens
                </p>
              )}
              {messages.some((m) => m.role === "assistant") && (
                <button
                  onClick={exportConversation}
                  className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-brand-primary transition-colors"
                  title="Exportar conversación como .md"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Exportar
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center mt-1.5 italic">
            Los modelos IA pueden cometer errores. Verifica antes de entregar al cliente.
          </p>
        </div>
      </footer>

      <ConfirmModal
        open={pendingRoleChange !== null}
        title="Cambiar de rol borra el chat actual"
        description={
          "Esta conversación se va a perder si cambias a otro rol. Cada rol mantiene su propio contexto para no mezclar metodologías."
        }
        confirmLabel="Cambiar de rol"
        cancelLabel="Quedarme aquí"
        onConfirm={confirmRoleChange}
        onCancel={() => setPendingRoleChange(null)}
      />
    </div>
  );
}
