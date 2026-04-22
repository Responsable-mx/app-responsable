"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type ClientOption = {
  id: string;
  name: string;
  sector: string | null;
  completeness: { filled: number; total: number };
};
type RoleId = "aurora" | "rebeca" | "elena" | "valeria";
type ChatMessage = { role: "user" | "assistant"; content: string };

// Orden alfabético por nombre (es-MX).
const ROLES: Array<{
  id: RoleId;
  name: string;
  fn: string;
  color: string;
  emoji: string;
}> = [
  // Orden lógico de la cadena de calidad: Autor → Revisor → Elevador → Validador.
  { id: "aurora", name: "Aurora", fn: "Autor", color: "bg-teal-700", emoji: "✍️" },
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

export function ChatWindow({ clients }: { clients: ClientOption[] }) {
  const [role, setRole] = useState<RoleId>("aurora");
  const [clientId, setClientId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [pendingRoleChange, setPendingRoleChange] = useState<RoleId | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  function completenessBadge(c: ClientOption): string {
    const { filled, total } = c.completeness;
    return ` · ${filled}/${total}`;
  }

  return (
    <div className="flex flex-col h-full bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center gap-4">
        <div
          className="flex items-center gap-1 bg-stone-100 rounded-lg p-1"
          data-tour="role-selector"
        >
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => handleRoleClick(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                role === r.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {r.emoji} {r.name}
              <span className="ml-1 text-slate-400 font-normal">· {r.fn}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2" data-tour="client-picker">
          <label className="text-xs text-slate-500">Cliente:</label>
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              resetChat();
            }}
            className="px-3 py-1.5 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="">Sin cliente (metodología general)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.sector ? ` · ${c.sector}` : ""}
                {completenessBadge(c)}
              </option>
            ))}
          </select>
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
              <p className="text-sm text-slate-500 mt-1 mb-6">
                {clientId
                  ? `Contexto de cliente activo. Pregunta lo que necesites.`
                  : "Sin cliente seleccionado. Respondo sobre metodología general."}
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto">
                {STARTERS[role].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-xs px-3 py-2 bg-white border border-stone-200 rounded-lg hover:border-teal-600 hover:bg-teal-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`animate-fade-in ${
                m.role === "user" ? "flex justify-end" : ""
              }`}
            >
              <div
                className={`max-w-2xl ${
                  m.role === "user"
                    ? "bg-teal-700 text-white rounded-2xl rounded-br-md px-4 py-2.5"
                    : "bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3"
                }`}
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
            </div>
          ))}

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
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none max-h-40"
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
                className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 disabled:bg-stone-300 disabled:cursor-not-allowed"
              >
                Enviar
              </button>
            )}
          </form>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            Los modelos IA pueden cometer errores. Verifica la información
            importante antes de entregar al cliente.
          </p>
        </div>
      </footer>

      <ConfirmDialog
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
