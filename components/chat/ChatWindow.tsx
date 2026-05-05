"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type ClientOption = {
  id: string;
  name: string;
  sector: string | null;
  completeness: { filled: number; total: number };
};
type RoleId = "aurora" | "rebeca" | "elena" | "valeria";
type ChatMessage = { role: "user" | "assistant"; content: string; rating?: "up" | "down" };

const MODEL_PER_ROLE: Record<RoleId, string> = {
  aurora: "Sonnet",
  rebeca: "Sonnet",
  elena: "Opus",
  valeria: "Haiku",
};

const MODEL_COST: Record<string, number> = {
  Sonnet: 15 / 1_000_000,
  Opus: 75 / 1_000_000,
  Haiku: 1.25 / 1_000_000,
};

// Orden alfabético por nombre (es-MX).
const ROLES: Array<{
  id: RoleId;
  name: string;
  fn: string;
  color: string;
  emoji: string;
}> = [
  // Orden lógico de la cadena de calidad: Autor → Revisor → Elevador → Validador.
  { id: "aurora", name: "Aurora", fn: "Autor", color: "bg-brand-primary-hover", emoji: "✍️" },
  { id: "rebeca", name: "Rebeca", fn: "Revisor", color: "bg-amber-600", emoji: "🔍" },
  { id: "elena", name: "Elena", fn: "Elevador", color: "bg-indigo-700", emoji: "⭐" },
  { id: "valeria", name: "Valeria", fn: "Validador", color: "bg-rose-700", emoji: "✅" },
];

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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalTokens = Math.round(
    messages.filter((m) => m.role === "assistant").reduce((s, m) => s + m.content.length, 0) / 4
  );
  const totalCost = (totalTokens * (MODEL_COST[MODEL_PER_ROLE[role]] ?? MODEL_COST.Sonnet));

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
    }
    setPendingRoleChange(null);
  }

  async function send(prompt: string) {
    if (!prompt.trim() || streaming) return;
    setError("");
    const userMsg: ChatMessage = { role: "user", content: prompt };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((m) => [...m, { role: "assistant", content: "" }]);

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
        setError(data.error ?? "Error al enviar");
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
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "delta") {
              setMessages((m) => {
                const last = m[m.length - 1];
                if (!last || last.role !== "assistant") return m;
                return [
                  ...m.slice(0, -1),
                  { ...last, content: last.content + evt.text },
                ];
              });
            } else if (evt.type === "error") {
              setError(evt.error);
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
        setError("Error de conexión");
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
          {ROLES.map((r, i) => (
            <div key={r.id} className="flex items-center">
              <button
                onClick={() => handleRoleClick(r.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                  role === r.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>{r.emoji}</span>
                <span>{r.name}</span>
                <span className="text-slate-500 font-normal text-[10px]">· {r.fn}</span>
              </button>
              {i < ROLES.length - 1 && (
                <svg className="w-3 h-3 text-slate-300 mx-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </header>

      {selectedClient && selectedClient.completeness.filled < 6 && (
        <div
          role="status"
          className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-6 py-2 flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>
            El contexto de <strong>{selectedClient.name}</strong> tiene{" "}
            {selectedClient.completeness.filled}/6 bloques llenos. Los roles
            responden mejor cuando está completo.{" "}
            <a
              href={`/clientes/${selectedClient.id}`}
              className="underline hover:text-amber-700"
            >
              Completar ahora →
            </a>
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12" data-tour="empty-state">
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${currentRole.color} text-white text-2xl mb-3`}
              >
                {currentRole.emoji}
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {currentRole.name} · {currentRole.fn}
              </h2>
              <p className="text-sm text-slate-600 mt-1 mb-6">
                {clientId
                  ? `Contexto de cliente activo. Pregunta lo que necesites.`
                  : "Sin cliente seleccionado. Respondo sobre metodología general."}
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
                {STARTERS[role].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 bg-white border border-stone-200 rounded-lg hover:border-brand-primary hover:bg-brand-primary-light transition-colors"
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
            return (
              <div
                key={i}
                className={`animate-fade-in ${
                  m.role === "user" ? "flex justify-end" : ""
                }`}
              >
                <div className="max-w-2xl">
                  <div
                    className={
                      m.role === "user"
                        ? "bg-brand-primary-hover text-white rounded-2xl rounded-br-md px-4 py-2.5"
                        : "bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3"
                    }
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-1">
                        {m.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        ) : (
                          <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                    )}
                  </div>
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
            );
          })}

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3"
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <footer className="bg-white border-t border-stone-200 px-6 py-3">
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
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-none max-h-40"
              disabled={streaming}
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800"
              >
                Detener
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 bg-brand-primary-hover text-white rounded-lg text-sm font-medium hover:bg-brand-primary-dark disabled:bg-stone-300 disabled:cursor-not-allowed"
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
