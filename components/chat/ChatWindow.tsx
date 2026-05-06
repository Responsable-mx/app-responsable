"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SelectField } from "@/components/ui/SelectField";
import { isChatStreamEvent } from "@/lib/ai/stream-types";
import { ChatSessionsPanel } from "@/components/chat/ChatSessionsPanel";

type SessionPreview = {
  id: string;
  client_id: string | null;
  role: RoleId;
  title: string;
  message_count: number;
  updated_at: string;
};

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
  // Identifica qué voz IA respondió. Persistido por mensaje porque el consultor
  // puede cambiar de rol entre turnos — sin esto los mensajes viejos se renderizarían
  // con el avatar del rol actual (atribución incorrecta).
  roleId?: RoleId;
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
// Descarga conversación como archivo Markdown. Pattern ChatGPT/Claude.
// Útil para entregables a comité — el consultor pega el .md en docs.
function exportConversationMd(
  messages: ChatMessage[],
  clientName: string | undefined,
  currentRoleName: string
) {
  const lines: string[] = [];
  lines.push(`# Conversación IA${clientName ? ` · ${clientName}` : ""}`);
  lines.push("");
  lines.push(`_Generado: ${new Date().toLocaleString("es-MX")}_`);
  lines.push("");
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const author =
      m.role === "user"
        ? "**Consultor**"
        : `**${m.roleId ? ROLES.find((r) => r.id === m.roleId)?.name ?? currentRoleName : currentRoleName}**`;
    const stamp = m.ts ? ` _(${new Date(m.ts).toLocaleTimeString("es-MX")})_` : "";
    lines.push(`### ${author}${stamp}`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (clientName ?? "general").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  a.href = url;
  a.download = `chat-${slug}-${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

// Cliente seed Distribuidora Altamira — UUID hardcoded del seed SQL (dummy-clients.sql).
// Se usa para hidratar una conversación demo en first-load del cliente seed.
const ALTAMIRA_ID = "11111111-1111-1111-1111-111111111111";
const ALTAMIRA_DEMO_MSGS: ChatMessage[] = [
  {
    role: "user",
    content: "Genera estructura de Estudio de Doble Materialidad para Altamira.",
    ts: Date.now() - 60_000,
  },
  {
    role: "assistant",
    content:
      "**Estructura — Estudio de Doble Materialidad · Distribuidora Altamira**\n\n1. **Contexto del negocio** — sector alimentos refrigerados, presencia MX, clientes B2B clave (Walmart, OXXO/FEMSA, Costco, La Comer).\n2. **Análisis regulatorio** — NOM-001-STPS-2023, LGPGIR (residuos), CTPAT.\n3. **Identificación de stakeholders** — clientes corporativos, comunidades, transportistas, autoridades.\n4. **Materialidad por impacto** — emisiones GHG (cadena de frío), refrigerantes HFC, residuos.\n5. **Materialidad financiera** — riesgos regulatorios HFC, presión clientes B2B sobre Scope 3, costo energético.\n6. **Matriz de doble materialidad** — 20 temas posicionados (5 doble material, 5 por impacto, 5 financiero, 5 seguimiento).\n7. **Plan de acción** — KPIs, owners, roadmap.\n\n¿Avanzamos con el contexto regulatorio detallado?",
    ts: Date.now() - 30_000,
  },
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
  clientLocked = false,
}: {
  clients: ClientOption[];
  initialClientId?: string;
  // Cuando true: selector de cliente → nombre fijo, "Ver ficha" oculto.
  // Usar cuando el chat está embebido dentro de la ficha del cliente (/clientes/[id]).
  clientLocked?: boolean;
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
  // Sesión persistente: id de la conversación actual (null = nueva sin guardar).
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showSessionsPanel, setShowSessionsPanel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sesiones recientes: solo se cargan en empty state para no pagar el fetch cuando
  // ya hay conversación activa. revalidateOnFocus:false evita refetch al volver de otra tab.
  const { data: recentData } = useSWR<{ data: SessionPreview[] }>(
    messages.length === 0 ? "/api/chat-sessions?limit=5" : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );
  const recentSessions = recentData?.data ?? [];

  const totalTokens = usageAcc.inputTokens + usageAcc.outputTokens + usageAcc.cacheReadTokens;
  const totalCost = usageAcc.costUsd;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  // Auto-simula conversación demo cuando cliente Altamira (seed dummy) está
  // seleccionado y el chat está vacío. Streaming carácter por carácter para
  // que se vea natural — no flash dump de mensajes.
  const demoCancelRef = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => {
    if (clientId !== ALTAMIRA_ID || role !== "aurora") return;
    if (messages.length > 0) return;

    const ctl = { cancelled: false };
    demoCancelRef.current = ctl;

    async function sleep(ms: number) {
      return new Promise<void>((r) => setTimeout(r, ms));
    }

    async function simulate() {
      for (const msg of ALTAMIRA_DEMO_MSGS) {
        if (ctl.cancelled) return;
        if (msg.role === "user") {
          setMessages((m) => [...m, { ...msg }]);
          await sleep(700);
        } else {
          // Typing indicator: añade msg vacío
          setStreaming(true);
          setMessages((m) => [...m, { role: "assistant", content: "", ts: Date.now() }]);
          await sleep(500);
          if (ctl.cancelled) return;
          const fullText = msg.content;
          const chunkSize = Math.max(3, Math.ceil(fullText.length / 80));
          for (let j = 0; j < fullText.length; j += chunkSize) {
            if (ctl.cancelled) return;
            const slice = fullText.slice(0, Math.min(j + chunkSize, fullText.length));
            setMessages((m) => {
              const last = m[m.length - 1];
              if (!last || last.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...last, content: slice }];
            });
            await sleep(15);
          }
          setStreaming(false);
          await sleep(1200);
        }
      }
    }

    void simulate();
    return () => {
      ctl.cancelled = true;
      setStreaming(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
    // eslint-disable-next-line react-hooks/purity -- Date.now() en handler de envío (no es render)
    const now = Date.now();
    const userMsg: ChatMessage = { role: "user", content: prompt, ts: now };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((m) => [
      ...m,
      { role: "assistant", content: "", ts: now, roleId: role },
    ]);

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
    setSessionId(null);
  }

  // Persiste la sesión actual a /api/chat-sessions con debounce. Se dispara cada
  // vez que `messages` cambia post-streaming. Soporta crear nueva (id null) o
  // actualizar existente. Fail-open — si falla, conversación local no se rompe.
  async function persistSession(msgs: ChatMessage[]) {
    if (msgs.length === 0) return;
    // D-17: no persistir sesiones de demo (Altamira seed) — generan rows basura en DB.
    if (clientId === ALTAMIRA_ID) return;
    // Solo persistir conversaciones reales (al menos 1 turno completo).
    const hasAssistantReply = msgs.some(
      (m) => m.role === "assistant" && m.content.trim().length > 0
    );
    if (!hasAssistantReply) return;
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          clientId: clientId || null,
          role,
          messages: msgs,
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: { id: string } };
      if (!sessionId && json.data?.id) {
        setSessionId(json.data.id);
      }
    } catch {
      // Silent fail — UX local intacta.
    }
  }

  // Trigger autosave cuando termina streaming (messages estables).
  useEffect(() => {
    if (streaming) return;
    if (messages.length === 0) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void persistSession(messages);
    }, 800);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming]);

  // Cargar sesión histórica desde API.
  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chat-sessions/${id}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: {
          id: string;
          role: RoleId;
          client_id: string | null;
          messages: unknown[];
        };
      };
      const s = json.data;
      // D-19: validar shape de messages antes de setMessages. JSONB corrupto
      // en DB (insert directo, seed bug) crashea ReactMarkdown sin este guard.
      const safeMessages: ChatMessage[] = Array.isArray(s.messages)
        ? s.messages.flatMap((m): ChatMessage[] => {
            if (typeof m !== "object" || m === null) return [];
            const raw = m as Record<string, unknown>;
            if (raw.role !== "user" && raw.role !== "assistant") return [];
            return [{
              role: raw.role as "user" | "assistant",
              content: typeof raw.content === "string" ? raw.content : "",
              ts: typeof raw.ts === "number" ? raw.ts : undefined,
              roleId: raw.roleId as RoleId | undefined,
              rating: raw.rating as "up" | "down" | undefined,
            }];
          })
        : [];
      setRole(s.role);
      setClientId(s.client_id ?? "");
      setMessages(safeMessages);
      setSessionId(s.id);
      setError("");
      setUsageAcc({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 });
      setShowSessionsPanel(false);
    } catch {
      setError("No se pudo cargar la conversación.");
    }
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

  // D-27: exportConversation() eliminado — era duplicado inferior de exportConversationMd().
  // Los dos botones de export (header y footer) ahora usan la misma función.

  const ctxPct = selectedClient
    ? Math.round((selectedClient.completeness.filled / Math.max(selectedClient.completeness.total, 1)) * 100)
    : null;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3">
        {/* Cliente badge row */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1" data-tour="client-picker">
            {!clientLocked && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cliente</span>}
            {!clientLocked && (
              <SelectField
                value={clientId}
                onChange={(v) => {
                  setClientId(v);
                  resetChat();
                }}
                options={clients.map((c) => ({
                  value: c.id,
                  label: c.name + (c.sector ? ` · ${c.sector}` : ""),
                }))}
                placeholder="Sin cliente (metodología general)"
                className="max-w-[280px]"
              />
            )}
            {selectedClient && ctxPct !== null && (
              <>
                <span
                  className={`text-[10px] rounded-sm px-1.5 py-0.5 font-bold uppercase tracking-wide border tabular-nums inline-flex items-center gap-1 ${
                    ctxPct === 100
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : ctxPct >= 50
                        ? "bg-brand-primary-light text-brand-primary-dark border-brand-primary/20"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                  title={`Perfil del cliente: ${selectedClient.completeness.filled} de ${selectedClient.completeness.total} atributos llenos (sector, frameworks, certificaciones, riesgos, etc). A más perfil completo, mejor calidad de respuestas IA. Distinto del progreso del Cuestionario.`}
                >
                  <span>Perfil</span>
                  <span>{selectedClient.completeness.filled}/{selectedClient.completeness.total}</span>
                </span>
                {!clientLocked && (
                  <a
                    href={`/clientes/${selectedClient.id}`}
                    className="text-[11px] text-slate-500 hover:text-brand-primary transition-colors hidden md:inline"
                    title="Ver ficha del cliente"
                  >
                    Ver ficha
                  </a>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSessionsPanel(true)}
              className="text-[11px] text-slate-500 hover:text-brand-primary-dark transition-colors inline-flex items-center gap-1"
              title="Ver historial de conversaciones"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historial
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={resetChat}
                className="text-[11px] text-slate-500 hover:text-rose-600 transition-colors"
                title="Nueva conversación (la actual queda guardada en historial)"
              >
                Nueva
              </button>
            )}
          </div>
        </div>

        <ChatSessionsPanel
          open={showSessionsPanel}
          onClose={() => setShowSessionsPanel(false)}
          onSelect={(id) => void loadSession(id)}
          onArchive={(id) => {
            if (id === sessionId) resetChat();
          }}
          filterClientId={initialClientId ?? null}
          currentSessionId={sessionId}
        />

        {/* Role chain */}
        <div
          className="flex items-center gap-1"
          data-tour="role-selector"
        >
          {ROLES.map((r, i) => {
            const isActive = role === r.id;
            const isVisited = !isActive && messages.some(
              (m) => m.role === "assistant" && m.roleId === r.id
            );
            return (
              <div key={r.id} className="flex items-center">
                <button
                  onClick={() => handleRoleClick(r.id)}
                  className={`px-3 py-2 rounded transition-all flex items-center gap-2 border ${
                    isActive
                      ? "bg-white text-slate-900 shadow-sm border-slate-200 ring-1 ring-brand-primary/20"
                      : isVisited
                        ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:shadow-sm"
                        : "bg-transparent text-slate-500 border-transparent hover:bg-slate-50 hover:border-slate-200"
                  }`}
                  aria-pressed={isActive}
                  aria-label={`${r.name} — ${r.fn}${isVisited ? " (ya intervino)" : ""}`}
                  title={isVisited ? `${r.name} · ya intervino` : r.fn}
                >
                  <span
                    aria-hidden
                    className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white relative shrink-0 ${
                      isActive || isVisited ? r.color : "bg-slate-300"
                    }`}
                  >
                    {r.mono}
                    {isVisited && (
                      <span
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white"
                      />
                    )}
                  </span>
                  <span className="text-left hidden sm:block">
                    <span className={`block text-xs font-semibold leading-tight ${isActive ? "text-slate-900" : "text-slate-600"}`}>
                      {r.name}
                    </span>
                    <span className={`block text-[10px] uppercase tracking-wider font-medium leading-tight mt-0.5 ${isActive ? "text-brand-primary-dark" : "text-slate-400"}`}>
                      {r.fn}
                    </span>
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
              Completar ahora
            </a>
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* System message: contexto cargado (estilo mockup) */}
          {selectedClient && (
            <div className="flex justify-center pt-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium text-slate-700">Contexto cargado</span>
                <span className="text-slate-300">·</span>
                <span className="font-semibold text-slate-900 truncate max-w-[260px]">{selectedClient.name}</span>
                <span className="text-slate-300">·</span>
                <span className="tabular-nums text-slate-600">Perfil {selectedClient.completeness.filled}/{selectedClient.completeness.total}</span>
                {selectedClient.sector && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600 truncate max-w-[180px]">{selectedClient.sector}</span>
                  </>
                )}
              </span>
            </div>
          )}

          {messages.length === 0 && (
            <div className="py-10 max-w-2xl mx-auto" data-tour="empty-state">
              <p className="text-sm text-slate-600 mb-4 border-b border-slate-200 pb-4">
                {clientId
                  ? "Contexto de cliente cargado. Comienza con un objetivo o usa una sugerencia."
                  : "Sin cliente seleccionado. Respondo sobre metodología general."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTERS[role].map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group text-left text-xs px-3 py-2.5 bg-white border border-slate-200 rounded hover:border-brand-primary hover:bg-brand-primary-light transition-colors text-slate-700 flex items-start justify-between gap-2"
                  >
                    <span className="font-medium">{s}</span>
                    <svg className="w-3 h-3 shrink-0 mt-0.5 text-slate-300 group-hover:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>

              {recentSessions.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Recientes
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSessionsPanel(true)}
                      className="text-[10px] text-slate-400 hover:text-brand-primary transition-colors"
                    >
                      Ver todo
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    {(() => {
                      // eslint-disable-next-line react-hooks/purity
                      const nowTs = Date.now();
                      return recentSessions.map((s) => {
                      const daysAgo = Math.floor(
                        (nowTs - new Date(s.updated_at).getTime()) / 86400000
                      );
                      const stamp =
                        daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo} días`;
                      const roleData = ROLES.find((r) => r.id === s.role) ?? ROLES[0];
                      const clientMatch = clients.find((c) => c.id === s.client_id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => void loadSession(s.id)}
                            className="w-full text-left flex items-center gap-2.5 px-2 py-2 rounded hover:bg-slate-100 transition-colors"
                          >
                            <span
                              className={`w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${roleData.color}`}
                              aria-hidden
                            >
                              {roleData.mono}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-xs text-slate-700 line-clamp-1 block">{s.title}</span>
                              {clientMatch && (
                                <span className="text-[10px] text-slate-500 block truncate">
                                  {clientMatch.name}
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                              {stamp}
                            </span>
                          </button>
                        </li>
                      );
                    });
                    })()}
                  </ul>
                </div>
              )}
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
            // Atribución por mensaje. roleId se persiste al enviar; si falta (mensajes
            // legacy o demo precargada) cae al rol activo actual.
            const msgRole = m.role === "assistant"
              ? ROLES.find((r) => r.id === m.roleId) ?? currentRole
              : null;
            return (
              <div key={i} className="animate-fade-in">
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className={`w-7 h-7 rounded shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${
                      m.role === "user" ? "bg-slate-700" : (msgRole?.color ?? currentRole.color)
                    }`}
                  >
                    {m.role === "user" ? "Tú" : (msgRole?.mono ?? currentRole.mono)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="text-xs font-semibold text-slate-900 leading-none">
                        {m.role === "user" ? "Consultor" : (msgRole?.name ?? currentRole.name)}
                      </p>
                      {m.role === "assistant" && (
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">
                          {msgRole?.fn ?? currentRole.fn}
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
                    <div className="flex items-center mt-1 px-1">
                      <button
                        onClick={() => rateMessage(i, "up")}
                        className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors ${m.rating === "up" ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}
                        title="Útil"
                      >
                        <svg className="w-3.5 h-3.5" fill={m.rating === "up" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => rateMessage(i, "down")}
                        className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded transition-colors ${m.rating === "down" ? "text-rose-500" : "text-slate-300 hover:text-slate-500"}`}
                        title="No útil"
                      >
                        <svg className="w-3.5 h-3.5" fill={m.rating === "down" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => copyMessage(i, m.content)}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-300 hover:text-slate-500 transition-colors"
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
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded text-slate-300 hover:text-brand-primary transition-colors"
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
              aria-label={`Escribe a ${currentRole.name}`}
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
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span
                className="hidden sm:inline"
                title={`Modelo: ${MODEL_PER_ROLE[role]} · ↵ enviar · ⇧↵ nueva línea`}
              >
                ↵ enviar
              </span>
            </div>
            <div className="flex items-center gap-3">
              {totalTokens > 0 && (
                <p className="text-[10px] text-slate-500 tabular-nums uppercase tracking-wider">
                  ~${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(3)}
                  <span className="text-slate-400 mx-1">·</span>
                  {totalTokens.toLocaleString()} tokens
                </p>
              )}
              {messages.some((m) => m.role === "assistant") && (
                <button
                  onClick={() => exportConversationMd(messages, selectedClient?.name, currentRole.name)}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-brand-primary transition-colors"
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
          <p className="text-[10px] text-slate-300 text-center mt-1 select-none" title="Los modelos IA pueden cometer errores. Verifica antes de entregar al cliente.">
            IA · verifica antes de entregar
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
