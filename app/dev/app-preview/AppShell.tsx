"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";

// ── Types ─────────────────────────────────────────────────────────────────────

type Section = "chat" | "clientes" | "client-tabs" | "config";
type ChatRole = "aurora" | "rebeca" | "elena" | "valeria";
type ConfigTab = "prompts" | "usuarios" | "catalogo" | "ia";
type ClientTabContent = "resumen" | "cuestionario" | "chat" | "materialidad";

// ── Mock data ─────────────────────────────────────────────────────────────────

const ROLES: Record<ChatRole, { name: string; dot: string; ring: string; bg: string; text: string; desc: string; model: string }> = {
  aurora:  { name: "Aurora",  dot: "bg-brand-primary",  ring: "ring-brand-primary",  bg: "bg-brand-primary-light",  text: "text-brand-primary-dark",  desc: "Autora — construye borrador",    model: "Sonnet" },
  rebeca:  { name: "Rebeca",  dot: "bg-amber-500",  ring: "ring-amber-400",  bg: "bg-amber-50",  text: "text-amber-800",  desc: "Revisora — detecta fallas",      model: "Sonnet" },
  elena:   { name: "Elena",   dot: "bg-purple-500", ring: "ring-purple-400", bg: "bg-purple-50", text: "text-purple-800", desc: "Elevadora — insights y narrativa", model: "Opus"   },
  valeria: { name: "Valeria", dot: "bg-rose-500",   ring: "ring-rose-400",   bg: "bg-rose-50",   text: "text-rose-800",   desc: "Validadora — Definition of Done", model: "Haiku"  },
};

const ROLE_ORDER: ChatRole[] = ["aurora", "rebeca", "elena", "valeria"];

type ChatMsg = { from: "user" | "ai" | "system"; role?: ChatRole; text: string; streaming?: boolean };

const INITIAL_MSGS: ChatMsg[] = [
  {
    from: "system",
    text: "Contexto cargado · Distribuidora Altamira S.A. de C.V. · 84/84 campos · Doble Materialidad",
  },
  {
    from: "user",
    text: "¿Cuál es la exposición de Altamira al riesgo de refrigerantes HFC para el Estudio de Doble Materialidad?",
  },
  {
    from: "ai",
    role: "aurora",
    text: `Basándome en el contexto cargado de Altamira, identifico **tres dimensiones críticas** del riesgo HFC:

**1. Riesgo regulatorio — severidad alta**
El Protocolo de Kigali obliga la sustitución de HFC a 2026. SENER confirmó restricciones para refrigeración industrial en logística de frío. Altamira depende de HFC en sus 12 CEDIS y flotilla refrigerada completa.

**2. Riesgo financiero — exposición media-alta**
Costo estimado de transición: $8–12 MDP (dato interno). Riesgo adicional: BBVA tiene una línea de crédito verde condicionada a métricas ESG comprometidas — el incumplimiento afectaría acceso a financiamiento.

**3. Riesgo operativo — proveedor único**
Honeywell México es el único proveedor de refrigerantes identificado. No hay proveedor alternativo documentado.

_Recomiendo incluir este tema en la matriz de doble materialidad bajo "Transición a economía baja en carbono" — tanto por impacto financiero material como por impacto ambiental (GWP de HFC)._

Campos del contexto utilizados: \`dependencias_criticas\`, \`riesgos_financieros\`, \`riesgos_operativos\`, \`insumos_principales\`.`,
  },
  {
    from: "user",
    text: "¿Qué stakeholders debo priorizar en el mapeo para este tema?",
  },
  {
    from: "ai",
    role: "aurora",
    text: `Para el tema HFC, prioriza estos grupos del mapeo de Altamira:

**Alta prioridad**
- **SEMARNAT/SENER**: influencia alta, dependencia media. Antecedente: multa por derrame 2021 ya existe en el historial.
- **BBVA (financiadores)**: influencia media, dependencia alta. Línea de crédito verde condicionada a cumplimiento ESG.

**Media prioridad**
- **Honeywell México**: proveedor único — la dependencia es crítica para la operación.
- **Walmart / FEMSA**: exigen CDP Score mínimo C desde 2023. El riesgo HFC puede degradar el score.

Basado en \`influencia_dependencia\`, \`canales_relacion\` y \`riesgos_financieros\` del cuestionario.`,
  },
];

const MOCK_CLIENTS = [
  {
    id: "c1", name: "Distribuidora Altamira S.A. de C.V.",
    sector: "Alimentos · Distribución", service: "Doble Materialidad",
    filled: 84, total: 84, status: "completado" as const, updated: "hoy",
    wizardUrl: "/dev/clientes-wizard-preview", responsable: "Ana G.",
  },
  {
    id: "c2", name: "Grupo Industrial Norteño S.A.",
    sector: "Manufactura · Metalmecánica", service: "Doble Materialidad",
    filled: 45, total: 84, status: "en_progreso" as const, updated: "hace 6 días",
    wizardUrl: "#", responsable: "Carlos M.",
  },
  {
    id: "c3", name: "Textiles del Bajío S.A. de C.V.",
    sector: "Manufactura · Textil", service: "Materialidad simple",
    filled: 5, total: 53, status: "nuevo" as const, updated: "hace 2 días",
    wizardUrl: "#", responsable: "Laura S.",
  },
  {
    id: "c4", name: "Energía Renovable Centro S.A.P.I.",
    sector: "Energía · Renovables", service: "Doble Materialidad",
    filled: 0, total: 84, status: "sin_iniciar" as const, updated: "ayer",
    wizardUrl: "#", responsable: "Roberto V.",
  },
];

const MOCK_PROMPTS = [
  { role: "aurora" as ChatRole, name: "Aurora — Autora", desc: "Construye borradores alineados a metodología GRI/ESRS", updated: "15 abr", tokens: 1240 },
  { role: "rebeca" as ChatRole, name: "Rebeca — Revisora", desc: "Detecta fallas, omisiones y riesgos. Genera checklist", updated: "15 abr", tokens: 980 },
  { role: "elena" as ChatRole,  name: "Elena — Elevadora", desc: "Insights, trade-offs, narrativa y recomendaciones estratégicas", updated: "20 abr", tokens: 1100 },
  { role: "valeria" as ChatRole, name: "Valeria — Validadora", desc: "Verifica Definition of Done, consistencia y evidencia", updated: "18 abr", tokens: 870 },
];

const MOCK_USERS = [
  { name: "Ana González",    email: "ana@responsable.net",     role: "admin",     active: "hoy" },
  { name: "Carlos Méndez",   email: "carlos@responsable.net",  role: "consultor", active: "ayer" },
  { name: "Laura Sánchez",   email: "laura@responsable.net",   role: "consultor", active: "30 abr" },
  { name: "Roberto Vega",    email: "roberto@responsable.net", role: "consultor", active: "28 abr" },
  { name: "Sofía Ramírez",   email: "sofia@responsable.net",   role: "consultor", active: "27 abr" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="text-[11px] bg-stone-100 text-slate-600 px-1 py-0.5 rounded font-mono">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

function RenderMsg({ text }: { text: string }) {
  return (
    <div className="text-sm text-slate-800 leading-relaxed space-y-2">
      {text.split("\n\n").map((para, i) => (
        <p key={i} className={para.startsWith("_") ? "text-xs text-slate-500 italic" : ""}>
          {renderText(para.replace(/^_|_$/g, ""))}
        </p>
      ))}
    </div>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  completado:   { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Completado" },
  en_progreso:  { bg: "bg-brand-primary-light border-brand-primary/20", text: "text-brand-primary-dark", label: "En progreso" },
  nuevo:        { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Nuevo" },
  sin_iniciar:  { bg: "bg-stone-100 border-stone-200", text: "text-slate-500", label: "Sin iniciar" },
};

// ── Nav icons ─────────────────────────────────────────────────────────────────

function IconChat({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-brand-primary" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
    </svg>
  );
}

function IconClients({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-brand-primary" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function IconConfig({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? "text-brand-primary" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2 : 1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const SUGGESTION_CHIPS = [
  "¿Temas materiales clave para Altamira?",
  "¿Stakeholders prioritarios para mapear?",
  "¿Principales riesgos regulatorios?",
];

const MODEL_COST: Record<string, number> = {
  Sonnet: 15 / 1_000_000,
  Opus: 75 / 1_000_000,
  Haiku: 1.25 / 1_000_000,
};

// ── ChatSection ───────────────────────────────────────────────────────────────

function ChatSection() {
  const [activeRole, setActiveRole] = useState<ChatRole>("aurora");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>(INITIAL_MSGS);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const totalTokens = Math.round(
    msgs.filter((m) => m.from === "ai" && !m.streaming).reduce((s, m) => s + m.text.length, 0) / 4
  );
  const totalCost = msgs
    .filter((m) => m.from === "ai" && !m.streaming)
    .reduce((s, m) => s + (m.text.length / 4) * (MODEL_COST[m.role ? ROLES[m.role].model : "Sonnet"] ?? MODEL_COST.Sonnet), 0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // shortcuts 1–4 para cambiar rol
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0) setActiveRole(ROLE_ORDER[idx]);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function sendMsg() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMsgs((m) => [...m, { from: "user", text }]);
    setLoading(true);
    const fullText = `Basándome en el contexto de Altamira y tu pregunta sobre "${text.slice(0, 40)}…", esta es una respuesta simulada de ${ROLES[activeRole].name}. En producción, el modelo ${ROLES[activeRole].model} respondería usando los 84 campos del cuestionario para darte un análisis concreto con evidencia trazable.`;
    setTimeout(() => {
      setLoading(false);
      setMsgs((m) => [...m, { from: "ai", role: activeRole, text: "", streaming: true }]);
      let idx = 0;
      const tick = Math.max(2, Math.ceil(fullText.length / 40));
      const iv = setInterval(() => {
        idx += tick;
        if (idx >= fullText.length) {
          clearInterval(iv);
          setMsgs((m) => m.map((msg, i) => i === m.length - 1 ? { ...msg, text: fullText, streaming: false } : msg));
        } else {
          setMsgs((m) => m.map((msg, i) => i === m.length - 1 ? { ...msg, text: fullText.slice(0, idx) } : msg));
        }
      }, 22);
    }, 120);
  }

  const role = ROLES[activeRole];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="shrink-0 bg-white border-b border-stone-200 px-6 py-3">
        {/* Client badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Cliente:</span>
            <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1 hover:bg-stone-100 transition-colors">
              Distribuidora Altamira S.A. de C.V.
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium">
              84/84 campos
            </span>
            <span className="text-[11px] text-slate-500 bg-stone-100 rounded-full px-2 py-0.5">
              Doble Materialidad
            </span>
          </div>
          <button className="text-xs text-brand-primary hover:underline">
            Ver cuestionario →
          </button>
        </div>

        {/* Role chain */}
        <div className="flex items-center gap-1">
          {ROLE_ORDER.map((r, i) => {
            const isActive = r === activeRole;
            const rData = ROLES[r];
            return (
              <div key={r} className="flex items-center gap-1">
                <button
                  onClick={() => setActiveRole(r)}
                  title={rData.desc}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                    isActive
                      ? `${rData.bg} ${rData.text} ring-1 ${rData.ring}`
                      : "text-slate-500 hover:bg-stone-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${rData.dot} shrink-0`} />
                  <span className="flex flex-col items-start leading-none gap-0.5">
                    <span>{rData.name}</span>
                    {isActive && (
                      <span className="text-[9px] opacity-50 font-normal tabular-nums">{rData.model}</span>
                    )}
                  </span>
                  {isActive && <span className="text-[10px] opacity-60 hidden sm:inline ml-0.5">— {rData.desc}</span>}
                </button>
                {i < ROLE_ORDER.length - 1 && (
                  <svg className="w-3 h-3 text-stone-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" role="log" aria-live="polite">
        {msgs.map((msg, i) => {
          if (msg.from === "system") {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-[11px] text-slate-400 bg-stone-100 rounded-full px-3 py-1">
                  {msg.text}
                </span>
              </div>
            );
          }
          if (msg.from === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-xl bg-brand-primary text-white rounded-2xl rounded-tr-sm px-4 py-3">
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </div>
              </div>
            );
          }
          const r = msg.role ? ROLES[msg.role] : ROLES.aurora;
          return (
            <div key={i} className="flex gap-3">
              <div className={`w-7 h-7 rounded-full ${r.dot} shrink-0 flex items-center justify-center mt-0.5`}>
                <span className="text-white text-[11px] font-bold">{r.name[0]}</span>
              </div>
              <div className="flex-1 max-w-2xl">
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-[11px] font-semibold ${r.text}`}>{r.name}</p>
                  {!msg.streaming && msg.text && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.text);
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 2000);
                      }}
                      className="text-slate-300 hover:text-slate-500 transition-colors p-0.5 ml-2"
                      title="Copiar respuesta"
                    >
                      {copiedIdx === i ? (
                        <span className="text-[10px] text-emerald-600 font-medium">✓ Copiado</span>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <div className={`rounded-2xl rounded-tl-sm px-4 py-3 border ${r.bg}`}>
                  <RenderMsg text={msg.text} />
                </div>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex gap-3">
            <div className={`w-7 h-7 rounded-full ${role.dot} shrink-0 flex items-center justify-center`}>
              <span className="text-white text-[11px] font-bold">{role.name[0]}</span>
            </div>
            <div className={`rounded-2xl rounded-tl-sm px-4 py-3 border ${role.bg} flex items-center gap-2`}>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 bg-white border-t border-stone-200 px-6 py-4">
        {!input && !loading && (
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {SUGGESTION_CHIPS.map((q) => (
              <button
                key={q}
                onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                className="text-xs px-3 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-slate-600 hover:bg-brand-primary-light hover:border-brand-primary/30 hover:text-brand-primary-dark transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary/40 min-h-[48px] max-h-32"
              placeholder={`Escribe a ${role.name}…`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
              }}
            />
          </div>
          <Button variant="primary" size="md" loading={loading} onClick={sendMsg} disabled={!input.trim()}>
            Enviar
          </Button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[11px] text-slate-400">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${role.dot} mr-1 align-middle`} />
            {role.name} · {role.desc} · ↵ para enviar
          </p>
          {totalTokens > 0 && (
            <p className="text-[11px] text-slate-400 tabular-nums">
              {`~$${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(3)} · ${totalTokens.toLocaleString()} tokens`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ClientPanel ───────────────────────────────────────────────────────────────

type MockClient = typeof MOCK_CLIENTS[0];

function ClientPanel({ client, onClose, onOpenChat }: { client: MockClient; onClose: () => void; onOpenChat: () => void }) {
  const pct = Math.round((client.filled / client.total) * 100);
  const st = STATUS_STYLE[client.status];

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-label={client.name}
        className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-40 flex flex-col border-l border-stone-200"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-stone-200">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Cliente</p>
            <p className="text-sm font-bold text-slate-900 leading-snug pr-2">{client.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 p-1 rounded shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Servicio + sector */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Servicio</span>
              <span className="text-xs font-medium text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded-full px-2 py-0.5">
                {client.service}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Sector</span>
              <span className="text-xs text-slate-700">{client.sector}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Estado</span>
              <span className={`text-[11px] font-medium border rounded-full px-2 py-0.5 ${st.bg} ${st.text}`}>
                {st.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-16 shrink-0">Actualizado</span>
              <span className="text-xs text-slate-500">{client.updated}</span>
            </div>
          </div>

          {/* Progreso */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-700">Cuestionario</p>
              <span className={`text-xs font-bold tabular-nums ${pct === 100 ? "text-emerald-600" : "text-brand-primary-dark"}`}>
                {pct}%
              </span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-brand-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 tabular-nums">{client.filled} / {client.total} campos completados</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-stone-200 flex flex-col gap-2">
          <Button
            variant="primary" size="md"
            className="w-full"
            onClick={() => { onOpenChat(); onClose(); }}
            disabled={client.status === "sin_iniciar"}
          >
            Abrir chat IA
          </Button>
          <a
            href={client.wizardUrl !== "#" ? client.wizardUrl : undefined}
            target={client.wizardUrl !== "#" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={`w-full text-center text-sm font-medium py-2 rounded-lg border transition-colors ${
              client.wizardUrl !== "#"
                ? "text-brand-primary border-brand-primary/20 hover:bg-brand-primary-light"
                : "text-slate-300 border-stone-200 cursor-not-allowed"
            }`}
          >
            Abrir cuestionario →
          </a>
        </div>
      </div>
    </>
  );
}

// ── ClientTabsView ───────────────────────────────────────────────────────

const METHODS = ["Comprender", "Diseñar", "Optimizar", "Utilizar", "Medir"];

const SECTION_META: Record<string, { desc: string }> = {
  "Información base":          { desc: "Datos generales, giro, ubicación, tamaño" },
  "Contexto general":          { desc: "Entorno económico, social y competitivo" },
  "Contexto sostenibilidad":   { desc: "Compromisos, política y madurez ESG" },
  "Regulatorio":               { desc: "Marco legal, obligaciones y riesgos normativos" },
  "Modelo negocio":            { desc: "Cadena de valor, stakeholders y dependencias" },
};

const SECTION_SVG: Record<string, string> = {
  "Información base":        "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  "Contexto general":        "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "Contexto sostenibilidad": "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  "Regulatorio":             "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "Modelo negocio":          "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
};

const CLIENT_TABS_DATA = [
  {
    ...MOCK_CLIENTS[0],
    sections: [
      {
        name: "Información base", completed: 5, total: 5,
        fields: [
          { label: "Razón social",  value: "Distribuidora Altamira S.A. de C.V." },
          { label: "RFC",           value: "DASC890214SP3" },
          { label: "Empleados",     value: "~850 directos" },
          { label: "Ingresos",      value: "$1,200 MDP (2024)" },
          { label: "Sede principal",value: "CDMX — Vallejo" },
        ],
      },
      {
        name: "Contexto general", completed: 12, total: 12,
        fields: [
          { label: "Operaciones",       value: "12 CEDIS · 8 estados" },
          { label: "Clientes clave",    value: "Walmart, FEMSA, OXXO" },
          { label: "Líneas negocio",    value: "Distribución fría, seca, cross-docking" },
          { label: "Mercados",          value: "Nacional (B2B retail y mayoreo)" },
          { label: "Exportaciones",     value: "No aplica" },
          { label: "Riesgos mercado",   value: "Inflación insumos, logística" },
        ],
      },
      {
        name: "Contexto sostenibilidad", completed: 18, total: 18,
        fields: [
          { label: "Madurez ESG",       value: "Gestionado (nivel 3/5)" },
          { label: "Reporte formal",    value: "Sin reporte publicado" },
          { label: "Certificaciones",   value: "Ninguna activa" },
          { label: "Meta CO₂",          value: "En exploración (-15% a 2027)" },
          { label: "Consumo energía",   value: "Diésel (flotilla) + CFE (CEDIS)" },
          { label: "Residuos",          value: "Cartón / plástico / HFC — sin programa formal" },
        ],
      },
      {
        name: "Regulatorio", completed: 7, total: 7,
        fields: [
          { label: "Multas previas",    value: "SEMARNAT 2021 — derrame frigorífico" },
          { label: "Riesgo HFC",        value: "SENER restricción 2026 (Kigali Protocol)" },
          { label: "NOM",               value: "NOM-052 residuos peligrosos (cumple)" },
          { label: "Auditoría fiscal",  value: "SAT — sin observaciones 2024" },
          { label: "Marco laboral",     value: "LFT — sin conflictos colectivos activos" },
        ],
      },
      {
        name: "Modelo negocio", completed: 25, total: 25,
        fields: [
          { label: "Cadena de valor",   value: "Proveedor → CEDIS → Retail / Mayoreo" },
          { label: "Ingresos recurrentes", value: "78% contratos marco" },
          { label: "Dep. crítica",      value: "Honeywell México (proveedor HFC único)" },
          { label: "Financiador clave", value: "BBVA — línea verde condicionada a ESG" },
          { label: "Clientes top",      value: "Walmart 34%, FEMSA 21%, OXXO 12%" },
          { label: "Proveedores clave", value: "Honeywell, CEMEX (embalaje), Ryder (logística)" },
        ],
      },
    ],
    matrices: { completed: 20, total: 20 },
    methodologyStep: 5,
  },
  {
    ...MOCK_CLIENTS[1],
    sections: [
      { name: "Información base", completed: 5, total: 5 },
      { name: "Contexto general", completed: 8, total: 12 },
      { name: "Contexto sostenibilidad", completed: 10, total: 18 },
      { name: "Regulatorio", completed: 2, total: 7 },
      { name: "Modelo negocio", completed: 0, total: 25 },
    ],
    matrices: { completed: 8, total: 20 },
    methodologyStep: 3,
  },
  {
    ...MOCK_CLIENTS[2],
    sections: [
      { name: "Información base", completed: 5, total: 5 },
    ],
    matrices: { completed: 0, total: 5 },
    methodologyStep: 1,
  },
  {
    ...MOCK_CLIENTS[3],
    sections: [],
    matrices: { completed: 0, total: 20 },
    methodologyStep: 0,
  },
];

type MaterialityTopic = {
  label: string; x: number; y: number;
  color: "rose" | "amber" | "teal" | "slate";
  size: "lg" | "md" | "sm";
  seccion: string;
};

const MATERIALITY_TOPICS: MaterialityTopic[] = [
  // Alta prioridad — top-right
  { label: "Emisiones GHG",          x: 72, y: 15, color: "rose",  size: "lg", seccion: "Contexto sostenibilidad" },
  { label: "Refrigerantes HFC",      x: 80, y:  9, color: "rose",  size: "lg", seccion: "Regulatorio" },
  { label: "Transición energética",  x: 63, y: 20, color: "rose",  size: "lg", seccion: "Contexto sostenibilidad" },
  { label: "Seguridad alimentaria",  x: 70, y: 26, color: "rose",  size: "md", seccion: "Modelo negocio" },
  { label: "Gestión cadena de frío", x: 76, y: 33, color: "rose",  size: "md", seccion: "Modelo negocio" },
  // Media prioridad — top-left
  { label: "Agua y efluentes",       x: 28, y: 18, color: "amber", size: "md", seccion: "Contexto sostenibilidad" },
  { label: "Residuos peligrosos",    x: 38, y: 28, color: "amber", size: "md", seccion: "Regulatorio" },
  { label: "Biodiversidad",          x: 22, y: 32, color: "amber", size: "sm", seccion: "Contexto sostenibilidad" },
  { label: "Diversidad e inclusión", x: 18, y: 42, color: "amber", size: "sm", seccion: "Contexto general" },
  { label: "Bienestar animal",       x: 14, y: 25, color: "amber", size: "sm", seccion: "Modelo negocio" },
  // Relevancia financiera — bottom-right
  { label: "Salud y seguridad",      x: 58, y: 54, color: "teal",  size: "md", seccion: "Contexto general" },
  { label: "Cadena de suministro",   x: 68, y: 60, color: "teal",  size: "md", seccion: "Modelo negocio" },
  { label: "Acceso financiamiento",  x: 82, y: 63, color: "teal",  size: "md", seccion: "Modelo negocio" },
  { label: "Gobernanza ética",       x: 72, y: 70, color: "teal",  size: "sm", seccion: "Información base" },
  { label: "Prácticas laborales",    x: 62, y: 67, color: "teal",  size: "sm", seccion: "Contexto general" },
  // Monitoreo — bottom-left
  { label: "Derechos humanos",       x: 24, y: 60, color: "slate", size: "sm", seccion: "Contexto general" },
  { label: "Reputación y marca",     x: 40, y: 74, color: "slate", size: "sm", seccion: "Contexto general" },
  { label: "Formación y desarrollo", x: 18, y: 70, color: "slate", size: "sm", seccion: "Contexto general" },
  { label: "Transparencia fiscal",   x: 35, y: 65, color: "slate", size: "sm", seccion: "Regulatorio" },
  { label: "Comunidades locales",    x: 14, y: 58, color: "slate", size: "sm", seccion: "Contexto sostenibilidad" },
];

const TOPIC_COLOR: Record<string, { dot: string; bg: string; text: string; label: string; shape: string; symbol: string }> = {
  rose:  { dot: "bg-rose-500",      bg: "bg-rose-50",              text: "text-rose-700",          label: "Doble material",       shape: "rounded-full",          symbol: "●" },
  amber: { dot: "bg-amber-500",     bg: "bg-amber-50",             text: "text-amber-700",         label: "Material por impacto", shape: "rotate-45 rounded-sm",  symbol: "◆" },
  teal:  { dot: "bg-brand-primary", bg: "bg-brand-primary-light",  text: "text-brand-primary-dark",label: "Material financiero",  shape: "rounded-sm",            symbol: "■" },
  slate: { dot: "bg-slate-400",     bg: "bg-slate-100",            text: "text-slate-600",         label: "En seguimiento",       shape: "rounded-full",          symbol: "▲" },
};

function ClientTabsView({ onBack }: { onBack: () => void }) {
  const [activeTabClient, setActiveTabClient] = useState(0);
  const [activeTabContent, setActiveTabContent] = useState<ClientTabContent>("resumen");
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<MaterialityTopic | null>(null);
  const [filterQuadrant, setFilterQuadrant] = useState<string | null>(null);

  const filtered = CLIENT_TABS_DATA.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.sector.toLowerCase().includes(search.toLowerCase())
  );

  const client = CLIENT_TABS_DATA[activeTabClient];
  const totalFields = client.sections.reduce((sum, s) => sum + s.total, 0);
  const completedFields = client.sections.reduce((sum, s) => sum + s.completed, 0);
  const pctOverall = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  const visibleTopics = filterQuadrant
    ? MATERIALITY_TOPICS.filter(t => t.color === filterQuadrant)
    : MATERIALITY_TOPICS;

  const narrativeChip = (() => {
    const dm = MATERIALITY_TOPICS.filter(t => t.color === "rose").length;
    const fin = MATERIALITY_TOPICS.filter(t => t.color === "teal").length;
    const top = MATERIALITY_TOPICS.filter(t => t.color === "rose" && t.size === "lg").map(t => t.label.split(" ").slice(0, 2).join(" "));
    return { dm, fin, top: top[0] ?? "—" };
  })();

  function selectClient(idx: number) {
    setActiveTabClient(idx);
    setActiveTabContent("resumen");
    setDropdownOpen(false);
    setSearch("");
    setFilterQuadrant(null);
    setSelectedTopic(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-stone-200">
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          {/* Breadcrumb + prev/next */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBack}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-primary transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-brand-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Clientes
            </button>
            <span className="text-slate-300 shrink-0">/</span>
            <span className="text-sm font-semibold text-slate-900 truncate min-w-0">{client.name}</span>
          </div>

          {/* Counter + prev/next + buscador */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 tabular-nums hidden sm:inline">
              {activeTabClient + 1} / {CLIENT_TABS_DATA.length}
            </span>
            <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden">
              <button
                onClick={() => selectClient(Math.max(0, activeTabClient - 1))}
                disabled={activeTabClient === 0}
                aria-label="Cliente anterior"
                className="p-2 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-stone-200"
              >
                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => selectClient(Math.min(CLIENT_TABS_DATA.length - 1, activeTabClient + 1))}
                disabled={activeTabClient === CLIENT_TABS_DATA.length - 1}
                aria-label="Cliente siguiente"
                className="p-2 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Buscador + dropdown */}
            <div className="relative">
              <div className="flex items-center">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    aria-label="Buscar cliente"
                    className="text-sm border border-stone-200 rounded-l-lg pl-8 pr-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary/40"
                    placeholder="Buscar cliente…"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
                    onFocus={() => setDropdownOpen(true)}
                  />
                </div>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  aria-label="Mostrar lista de clientes"
                  className={`border border-l-0 border-stone-200 rounded-r-lg px-2.5 py-1.5 h-[34px] transition-colors ${dropdownOpen ? "bg-brand-primary-light border-brand-primary/30" : "bg-stone-50 hover:bg-stone-100"}`}
                >
                  <svg className={`w-4 h-4 text-slate-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => { setDropdownOpen(false); setSearch(""); }} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-stone-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    <div className="px-3 py-2 border-b border-stone-100">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados</div>
                      ) : (
                        filtered.map((c) => {
                          const idx = CLIENT_TABS_DATA.indexOf(c);
                          const st = STATUS_STYLE[c.status];
                          const pct = c.total > 0 ? Math.round((c.filled / c.total) * 100) : 0;
                          return (
                            <button
                              key={c.id}
                              onClick={() => selectClient(idx)}
                              className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-stone-50 transition-colors border-b border-stone-50 last:border-0 ${activeTabClient === idx ? "bg-brand-primary-light/40" : ""}`}
                            >
                              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activeTabClient === idx ? "bg-brand-primary" : "bg-stone-300"}`} />
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-medium leading-tight truncate ${activeTabClient === idx ? "text-brand-primary-dark" : "text-slate-900"}`}>{c.name}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${st.bg} ${st.text}`}>{st.label}</span>
                                  <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-3 max-w-6xl mx-auto w-full">
        {/* Resumen ejecutivo */}
        <div className="bg-white rounded border border-slate-200 mb-3 overflow-hidden shadow-sm">
          {/* Header cliente */}
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 leading-tight tracking-tight">{client.name}</h2>
              <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-sm px-2 py-0.5 shrink-0 ${STATUS_STYLE[client.status].bg} ${STATUS_STYLE[client.status].text}`}>
                {STATUS_STYLE[client.status].label}
              </span>
              <span className="text-slate-200 shrink-0">|</span>
              <span className="text-xs text-slate-500">{client.sector}</span>
              <span className="text-slate-200 shrink-0">|</span>
              <span className="text-xs font-semibold text-brand-primary-dark">{client.service}</span>
              <span className="text-slate-200 shrink-0">|</span>
              <span className="text-xs text-slate-500">{client.responsable}</span>
              <span className="text-slate-200 shrink-0">|</span>
              <span className="text-xs text-slate-400">Actualizado {client.updated}</span>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            {/* Cuestionario */}
            <div className="px-5 py-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cuestionario</div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-3xl font-bold text-slate-900 leading-none tabular-nums">
                  {totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0}
                </span>
                <span className="text-base font-semibold text-slate-400">%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-none overflow-hidden mb-1.5">
                <div
                  className={`h-full transition-all ${completedFields === totalFields && totalFields > 0 ? "bg-emerald-500" : "bg-brand-primary"}`}
                  style={{ width: totalFields ? `${(completedFields / totalFields) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">{completedFields}/{totalFields} campos · {client.sections.length} secciones</span>
            </div>

            {/* Matrices */}
            <div className="px-5 py-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Matrices Materialidad</div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-3xl font-bold text-slate-900 leading-none tabular-nums">{client.matrices.completed}</span>
                <span className="text-base font-semibold text-slate-400">/{client.matrices.total}</span>
              </div>
              {client.matrices.completed === client.matrices.total && client.matrices.total > 0 ? (
                <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-sm px-2 py-0.5">
                  <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Todas validadas</span>
                </div>
              ) : client.matrices.completed > 0 ? (
                <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-sm px-2 py-0.5">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">En validación</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-sm px-2 py-0.5">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide">Sin iniciar</span>
                </div>
              )}
            </div>

            {/* Metodología — placeholder hasta definir pasos reales */}
            <div className="px-5 py-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Metodología ResponSable</div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-semibold text-slate-400 italic">Por definir</span>
                <span className="text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700 rounded-sm px-1.5 py-0.5 uppercase tracking-wide">Placeholder</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">Los pasos de la metodología se definirán con el equipo.</p>
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
          <div className="border-b border-slate-200 flex overflow-x-auto bg-slate-50">
            {([
              { key: "resumen",      label: "Resumen",      badge: `${client.sections.filter(s => s.completed === s.total && s.total > 0).length}/${client.sections.length}`, icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
              { key: "cuestionario", label: "Cuestionario", badge: `${pctOverall}%`,                                                                                          icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
              { key: "chat",         label: "Chat IA",      badge: null,                                                                                                      icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
              { key: "materialidad", label: "Materialidad", badge: `${client.matrices.completed}/${client.matrices.total}`,                                                   icon: <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg> },
            ] as const).map(({ key, label, icon, badge }) => (
              <button
                key={key}
                onClick={() => setActiveTabContent(key)}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary uppercase tracking-wide ${
                  activeTabContent === key
                    ? "border-brand-primary text-brand-primary bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/70"
                }`}
              >
                {icon}
                {label}
                {badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm tabular-nums ${
                    activeTabContent === key ? "bg-brand-primary/10 text-brand-primary" : "bg-slate-200 text-slate-500"
                  }`}>{badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Resumen Tab — Fichas */}
            {activeTabContent === "resumen" && (
              <div>
                {client.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <p className="text-sm font-semibold text-slate-600 mb-1">Sin secciones iniciadas</p>
                    <p className="text-xs text-slate-400">Abre Chat IA para comenzar el cuestionario</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                    {client.sections.map((section, idx) => {
                      const pct = Math.round((section.completed / section.total) * 100);
                      const done = section.completed === section.total;
                      const meta = SECTION_META[section.name] ?? { desc: "" };
                      const svgPath = SECTION_SVG[section.name] ?? "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
                      return (
                        <div
                          key={idx}
                          className={`rounded border flex flex-col gap-2.5 p-4 transition-colors ${
                            done
                              ? "bg-white border-emerald-300 border-l-4 border-l-emerald-500"
                              : section.completed > 0
                              ? "bg-white border-slate-200 border-l-4 border-l-brand-primary"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          {/* Ficha header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={svgPath} />
                                </svg>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-900 leading-tight uppercase tracking-wide">{section.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{meta.desc}</p>
                              </div>
                            </div>
                            {done ? (
                              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : section.completed > 0 ? (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5 shrink-0 uppercase tracking-wide">En progreso</span>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-sm px-1.5 py-0.5 shrink-0 uppercase tracking-wide">Pendiente</span>
                            )}
                          </div>

                          {/* Campos clave */}
                          {"fields" in section && (section as typeof section & { fields: { label: string; value: string }[] }).fields.length > 0 && (
                            <div className="space-y-1 border-t border-slate-100 pt-2">
                              {(section as typeof section & { fields: { label: string; value: string }[] }).fields.slice(0, 4).map((f, fi) => (
                                <div key={fi} className="flex gap-2">
                                  <span className="text-[10px] text-slate-400 shrink-0 w-24 leading-snug pt-px">{f.label}</span>
                                  <span className="text-[10px] text-slate-700 font-semibold leading-snug min-w-0">{f.value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Barra + contador */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-slate-400 tabular-nums">{section.completed}/{section.total} campos</span>
                              <span className={`text-xs font-bold tabular-nums ${done ? "text-emerald-600" : section.completed > 0 ? "text-brand-primary" : "text-slate-300"}`}>
                                {pct}%
                              </span>
                            </div>
                            <div className="h-1 bg-slate-100 rounded-none overflow-hidden">
                              <div
                                className={`h-full transition-all ${done ? "bg-emerald-500" : "bg-brand-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Cuestionario Tab — tabla de campos por sección */}
            {activeTabContent === "cuestionario" && (
              <div className="space-y-4">
                {client.sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    <p className="text-sm font-semibold text-slate-600 mb-1">Cuestionario no iniciado</p>
                    <p className="text-xs text-slate-400">Usa Chat IA para completar los campos</p>
                  </div>
                ) : (
                  client.sections.map((section, si) => {
                    const fields = "fields" in section ? (section as typeof section & { fields: { label: string; value: string }[] }).fields : [];
                    const done = section.completed === section.total;
                    const svgPath = SECTION_SVG[section.name] ?? "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
                    return (
                      <div key={si} className="border border-slate-200 rounded overflow-hidden">
                        {/* Section header */}
                        <div className={`flex items-center justify-between px-4 py-2 border-b ${done ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={svgPath} /></svg>
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">{section.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 tabular-nums">{section.completed}/{section.total} campos</span>
                            {done && <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                          </div>
                        </div>
                        {/* Fields table */}
                        {fields.length > 0 ? (
                          <table className="w-full text-xs">
                            <tbody>
                              {fields.map((f, fi) => (
                                <tr key={fi} className={fi % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                  <td className="px-4 py-2 text-slate-500 font-medium w-36 border-r border-slate-100">{f.label}</td>
                                  <td className="px-4 py-2 text-slate-800 font-semibold">{f.value}</td>
                                  <td className="px-3 py-2 w-8 text-right">
                                    <svg className="w-3.5 h-3.5 text-emerald-400 inline" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="px-4 py-3 text-xs text-slate-400 italic">Sin campos completados en esta sección</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Chat IA Tab — contexto pre-cargado del cliente */}
            {activeTabContent === "chat" && (
              <div className="flex flex-col gap-3">
                {/* Context banner */}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-primary-light border border-brand-primary/20 rounded">
                  <svg className="w-4 h-4 text-brand-primary shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                  <p className="text-xs text-brand-primary-dark font-medium">
                    Contexto cargado: <span className="font-bold">{client.name}</span> · {completedFields}/{totalFields} campos · {client.service}
                  </p>
                </div>
                {/* Role selector */}
                <div className="flex gap-2">
                  {ROLE_ORDER.map((r) => {
                    const role = ROLES[r];
                    return (
                      <div key={r} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold cursor-pointer ${role.bg} border-slate-200`}>
                        <div className={`w-2 h-2 rounded-full ${role.dot}`} />
                        <span className={role.text}>{role.name}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Sample messages from INITIAL_MSGS */}
                <div className="border border-slate-200 rounded overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conversación activa</p>
                  </div>
                  <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                    {INITIAL_MSGS.slice(0, 3).map((msg, i) => (
                      <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.from === "system" ? (
                          <div className="w-full text-center text-[10px] text-slate-400 italic py-1">{msg.text}</div>
                        ) : msg.from === "user" ? (
                          <div className="max-w-xs bg-brand-primary text-white text-xs px-3 py-2 rounded-lg">{msg.text}</div>
                        ) : (
                          <div className={`max-w-sm text-xs px-3 py-2 rounded-lg border ${msg.role ? ROLES[msg.role].bg : "bg-white"} border-slate-200`}>
                            {msg.role && <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${ROLES[msg.role].text}`}>{ROLES[msg.role].name}</p>}
                            <p className="text-slate-700 line-clamp-4">{msg.text.slice(0, 200)}{msg.text.length > 200 ? "…" : ""}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-slate-200 bg-white flex gap-2">
                    <input readOnly placeholder="Escribe tu pregunta sobre este cliente…" className="flex-1 text-xs border border-slate-200 rounded px-3 py-1.5 text-slate-700 bg-slate-50" />
                    <button className="text-xs font-semibold px-3 py-1.5 bg-brand-primary text-white rounded hover:bg-brand-primary-dark">Enviar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Materialidad Tab — BCG/McKinsey style */}
            {activeTabContent === "materialidad" && (
              <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-2 gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">Matriz de Doble Materialidad</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{client.name} · Estudio 2024</p>
                  </div>
                  <button className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 hover:bg-slate-200 transition-colors uppercase tracking-wide shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Exportar PDF
                  </button>
                </div>

                {/* Narrative chip */}
                <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-[11px] text-slate-700 font-medium">
                    <span className="font-bold text-rose-600">{narrativeChip.dm} temas doble material</span>
                    {" · "}
                    <span className="font-bold text-brand-primary-dark">{narrativeChip.fin} con relevancia financiera</span>
                    {" · "}
                    Riesgo principal: <span className="font-bold text-slate-900">{narrativeChip.top}</span>
                  </p>
                </div>

                {/* Chart + Legend */}
                <div className="flex gap-4 items-start">

                  {/* Left: Y-axis label + ticks + plot */}
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-1.5">

                      {/* Y-axis vertical title */}
                      <div className="flex items-center justify-center w-6 shrink-0 self-stretch">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.12em]" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                          Impacto sociedad / medioambiente
                        </span>
                      </div>

                      <div className="flex flex-1 min-w-0">
                        {/* Y-axis ticks */}
                        <div className="relative shrink-0 pr-2" style={{ height: 260, width: 22 }}>
                          {[10, 8, 6, 4, 2, 0].map((n, i) => (
                            <span
                              key={n}
                              className="absolute right-0 text-[9px] text-slate-400 tabular-nums -translate-y-1/2"
                              style={{ top: `${i * 20}%` }}
                            >{n}</span>
                          ))}
                        </div>

                        {/* Plot area */}
                        <div className="relative flex-1 bg-white border-2 border-slate-300" style={{ height: 260 }}>

                          {/* Quadrant backgrounds — intentionally minimal for corporate look */}

                          {/* Grid lines */}
                          {[20, 40, 60, 80].map(p => (
                            <div key={`v${p}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${p}%`, borderLeft: "1px solid #e2e8f0" }} />
                          ))}
                          {[20, 40, 60, 80].map(p => (
                            <div key={`h${p}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: `${p}%`, borderTop: "1px solid #e2e8f0" }} />
                          ))}

                          {/* Quadrant dividers — dashed midpoint lines */}
                          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", borderTop: "2px dashed #94a3b8" }} />
                          <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: "50%", borderLeft: "2px dashed #94a3b8" }} />

                          {/* Quadrant labels */}
                          <div className="absolute top-2 left-2.5 pointer-events-none">
                            <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide leading-none">Material por impacto</span>
                          </div>
                          <div className="absolute top-2 right-2.5 pointer-events-none text-right">
                            <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wide leading-none">Doble material ★</span>
                          </div>
                          <div className="absolute bottom-2 left-2.5 pointer-events-none">
                            <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide leading-none">En seguimiento</span>
                          </div>
                          <div className="absolute bottom-2 right-2.5 pointer-events-none text-right">
                            <span className="text-[9px] font-bold text-teal-700 uppercase tracking-wide leading-none">Material financiero</span>
                          </div>

                          {/* Topics — with shape encoding + quadrant dimming */}
                          {MATERIALITY_TOPICS.map((t, i) => {
                            const sz = t.size === "lg" ? 20 : t.size === "md" ? 15 : 11;
                            const tc = TOPIC_COLOR[t.color];
                            const isSelected = selectedTopic?.label === t.label;
                            const dimmed = filterQuadrant !== null && t.color !== filterQuadrant;
                            return (
                              <button
                                key={i}
                                onClick={() => setSelectedTopic(isSelected ? null : t)}
                                onKeyDown={(e) => { if (e.key === "Escape") setSelectedTopic(null); }}
                                aria-label={`${i + 1}. ${t.label}`}
                                className={`absolute flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-full z-10 group transition-opacity ${dimmed ? "opacity-15 pointer-events-none" : "opacity-100"}`}
                                style={{ left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%,-50%)", width: 40, height: 40 }}
                              >
                                <div
                                  className={`ring-2 ring-white shadow-sm flex items-center justify-center transition-all select-none
                                    ${isSelected ? "ring-[3px] ring-slate-800 shadow-lg scale-150" : "opacity-90 group-hover:opacity-100 group-hover:scale-125 group-hover:shadow-md"}
                                    ${tc.dot} ${tc.shape}`}
                                  style={{ width: sz, height: sz }}
                                >
                                  {sz >= 15 && (
                                    <span className={`text-[7px] font-bold text-white leading-none ${t.color === "amber" ? "-rotate-45" : ""}`}>{i + 1}</span>
                                  )}
                                </div>
                                {sz < 15 && (
                                  <span className="absolute -top-3 text-[8px] font-bold text-slate-500 leading-none select-none">{i + 1}</span>
                                )}
                              </button>
                            );
                          })}

                          {/* Topic popover */}
                          {selectedTopic && (() => {
                            const tc = TOPIC_COLOR[selectedTopic.color];
                            const idx = MATERIALITY_TOPICS.findIndex(t => t.label === selectedTopic.label);
                            const goLeft = selectedTopic.x > 55;
                            const goUp = selectedTopic.y > 55;
                            return (
                              <div
                                className="absolute z-30 bg-white border border-stone-200 rounded-xl shadow-2xl p-4 w-52"
                                style={{
                                  ...(goLeft ? { right: `calc(${100 - selectedTopic.x}% + 6px)` } : { left: `calc(${selectedTopic.x}% + 6px)` }),
                                  ...(goUp   ? { bottom: `calc(${100 - selectedTopic.y}% + 6px)` } : { top: `calc(${selectedTopic.y}% + 6px)` }),
                                }}
                              >
                                <button
                                  onClick={() => setSelectedTopic(null)}
                                  aria-label="Cerrar"
                                  className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-700 text-base leading-none font-medium"
                                >×</button>
                                <div className="flex items-start gap-2 mb-2 pr-5">
                                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${tc.dot}`} />
                                  <div>
                                    <p className="text-[10px] text-slate-400 leading-none mb-1">#{idx + 1}</p>
                                    <p className="text-sm font-bold text-slate-900 leading-tight">{selectedTopic.label}</p>
                                  </div>
                                </div>
                                <span className={`inline-flex rounded-full px-2 py-0.5 mb-2 ${tc.bg}`}>
                                  <span className={`text-[10px] font-semibold ${tc.text}`}>{tc.label}</span>
                                </span>
                                <p className="text-[11px] text-slate-500 mb-4">Sección: <span className="font-medium text-slate-700">{selectedTopic.seccion}</span></p>
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => { setSelectedTopic(null); setActiveTabContent("cuestionario"); }}
                                    className="w-full text-xs font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/30 rounded-lg px-3 py-2 hover:bg-brand-primary/20 transition-colors text-left"
                                  >Ver en Cuestionario →</button>
                                  <button
                                    onClick={() => { setSelectedTopic(null); setActiveTabContent("chat"); }}
                                    className="w-full text-xs font-semibold text-white bg-brand-primary rounded-lg px-3 py-2 hover:bg-brand-primary-dark transition-colors text-left"
                                  >Iniciar Chat IA →</button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* X-axis ticks */}
                    <div className="relative ml-[3.75rem] mt-1.5" style={{ height: 12 }}>
                      {[0, 2, 4, 6, 8, 10].map((n, i) => (
                        <span
                          key={n}
                          className="absolute text-[9px] text-slate-400 tabular-nums -translate-x-1/2"
                          style={{ left: `${i * 20}%` }}
                        >{n}</span>
                      ))}
                    </div>
                    {/* X-axis label */}
                    <div className="ml-[3.75rem] mt-0.5 text-center">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.12em]">Materialidad financiera para el negocio</span>
                    </div>
                  </div>

                  {/* Right: quadrant filter + numbered index */}
                  <div className="w-44 shrink-0 flex flex-col gap-2">
                    {/* Filter pills */}
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Filtrar cuadrante</p>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => setFilterQuadrant(null)}
                          className={`text-left text-[9px] font-semibold px-2 py-1 rounded transition-colors uppercase tracking-wide ${filterQuadrant === null ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                        >Todos ({MATERIALITY_TOPICS.length})</button>
                        {(Object.entries(TOPIC_COLOR) as [string, typeof TOPIC_COLOR[string]][]).map(([key, val]) => {
                          const count = MATERIALITY_TOPICS.filter(t => t.color === key).length;
                          return (
                            <button
                              key={key}
                              onClick={() => setFilterQuadrant(filterQuadrant === key ? null : key)}
                              className={`text-left text-[9px] font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1.5 uppercase tracking-wide ${filterQuadrant === key ? val.bg + " " + val.text + " ring-1 ring-inset ring-current/30" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                            >
                              <span className="shrink-0">{val.symbol}</span>
                              {val.label} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Topic index (filtered) */}
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Índice</p>
                      <div className="space-y-px max-h-[160px] overflow-y-auto pr-0.5">
                        {MATERIALITY_TOPICS.map((t, i) => {
                          const tc = TOPIC_COLOR[t.color];
                          const isSelected = selectedTopic?.label === t.label;
                          const dimmed = filterQuadrant !== null && t.color !== filterQuadrant;
                          if (dimmed) return null;
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedTopic(isSelected ? null : t)}
                              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors
                                ${isSelected ? tc.bg : "hover:bg-slate-50"}`}
                            >
                              <span className={`text-[9px] tabular-nums shrink-0 w-4 text-right font-medium ${isSelected ? tc.text : "text-slate-400"}`}>{i + 1}</span>
                              <span className={`text-[10px] shrink-0 leading-none ${tc.text}`}>{tc.symbol}</span>
                              <span className={`text-[10px] leading-tight truncate ${isSelected ? tc.text + " font-semibold" : "text-slate-700"}`}>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {!selectedTopic && !filterQuadrant && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">Haz clic en un tema para ver acciones · Usa los filtros para explorar por cuadrante</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ClientesSection ───────────────────────────────────────────────────────────

function ClientesSection({ onOpenChat }: { onOpenChat: () => void }) {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<MockClient | null>(null);
  const filtered = MOCK_CLIENTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.sector.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-slate-900">Clientes</h1>
          <p className="text-xs text-slate-500 mt-0.5">{MOCK_CLIENTS.length} clientes · MVP piloto interno</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="text-sm border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              placeholder="Buscar cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="primary" size="sm">+ Nuevo cliente</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-10 h-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm font-medium text-slate-500 mb-1">Sin resultados para {`"${search}"`}</p>
            <p className="text-xs text-slate-400 mb-4">Intenta con otro término de búsqueda</p>
            <Button variant="secondary" size="sm" onClick={() => setSearch("")}>Limpiar búsqueda</Button>
          </div>
        )}
        <div className={`overflow-x-auto rounded-xl border border-stone-200${filtered.length === 0 ? " hidden" : ""}`}>
          <table className="min-w-[1020px] w-full">
            <thead className="bg-stone-50 border-b border-stone-200 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[220px]">Empresa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[150px]">Sector</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[140px]">Servicio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[120px]">Contexto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[100px]">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[85px]">Actualizado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-[100px]">Responsable</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const pct = Math.round((c.filled / c.total) * 100);
                const st = STATUS_STYLE[c.status];
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                    className={`border-b border-stone-100 cursor-pointer ${i % 2 === 0 ? "bg-white" : "bg-stone-50/50"} hover:bg-brand-primary-light/30 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900 truncate" title={c.name}>{c.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-500 truncate">{c.sector}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-brand-primary-dark bg-brand-primary-light border border-brand-primary/20 rounded-full px-2 py-0.5 whitespace-nowrap">
                        {c.service}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 shrink-0 tabular-nums">{c.filled}/{c.total}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400 whitespace-nowrap">{c.updated}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full bg-brand-primary/20 shrink-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-brand-primary-dark">
                            {c.responsable.split(" ").map(w => w[0]).join("").toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-slate-700 whitespace-nowrap">{c.responsable}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={c.wizardUrl !== "#" ? c.wizardUrl : undefined}
                          target={c.wizardUrl !== "#" ? "_blank" : undefined}
                          rel="noopener noreferrer"
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                            c.wizardUrl !== "#"
                              ? "text-brand-primary border-brand-primary/20 hover:bg-brand-primary-light"
                              : "text-slate-300 border-stone-200 cursor-not-allowed"
                          }`}
                        >
                          Cuestionario
                        </a>
                        <button
                          onClick={onOpenChat}
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                            c.status !== "sin_iniciar"
                              ? "text-slate-600 border-stone-200 hover:bg-stone-50"
                              : "text-slate-300 border-stone-200 cursor-not-allowed"
                          }`}
                          disabled={c.status === "sin_iniciar"}
                        >
                          Chat
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedClient && (
        <ClientPanel
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onOpenChat={() => { onOpenChat(); setSelectedClient(null); }}
        />
      )}
    </div>
  );
}

// ── ConfiguracionSection ──────────────────────────────────────────────────────

function ConfiguracionSection() {
  const [tab, setTab] = useState<ConfigTab>("prompts");

  const TABS: { key: ConfigTab; label: string }[] = [
    { key: "prompts", label: "Prompts" },
    { key: "usuarios", label: "Usuarios" },
    { key: "catalogo", label: "Catálogo" },
    { key: "ia", label: "Modelos IA" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-white border-b border-stone-200 px-6 py-4">
        <h1 className="text-base font-bold text-slate-900 mb-3">Configuración</h1>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
                tab === t.key
                  ? "bg-brand-primary text-white"
                  : "text-slate-500 hover:bg-stone-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "prompts" && (
          <div className="max-w-2xl space-y-3">
            <p className="text-xs text-slate-500 mb-4">
              System prompts de cada rol IA. Cambios aplican a todas las conversaciones nuevas.
            </p>
            {MOCK_PROMPTS.map((p) => {
              const r = ROLES[p.role];
              return (
                <div key={p.role} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-full ${r.dot} shrink-0 flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{r.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                      <span className="text-[10px] text-slate-400 bg-stone-100 rounded px-1.5 py-0.5 tabular-nums">
                        ~{p.tokens} tokens
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{p.desc}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Última edición: {p.updated} abr</p>
                  </div>
                  <Button variant="secondary" size="sm">Editar</Button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "usuarios" && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-slate-500">{MOCK_USERS.length} consultores · MVP piloto</p>
              <Button variant="primary" size="sm">+ Invitar consultor</Button>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {MOCK_USERS.map((u, i) => (
                <div
                  key={u.email}
                  className={`flex items-center gap-4 px-5 py-3 ${i < MOCK_USERS.length - 1 ? "border-b border-stone-100" : ""}`}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-primary shrink-0 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{u.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                  <span className={`text-[11px] font-medium border rounded-full px-2.5 py-0.5 ${
                    u.role === "admin"
                      ? "bg-brand-primary-light border-brand-primary/20 text-brand-primary-dark"
                      : "bg-stone-100 border-stone-200 text-slate-500"
                  }`}>
                    {u.role}
                  </span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{u.active}</span>
                  <button className="text-slate-400 hover:text-slate-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "catalogo" && (
          <div className="max-w-2xl">
            <p className="text-xs text-slate-500 mb-4">
              Valores del catálogo (sectores, servicios, marcos, niveles de madurez). Usados para humanización antes del LLM.
            </p>
            {[
              { label: "Sectores", count: 18 },
              { label: "Servicios", count: 4 },
              { label: "Marcos de reporte", count: 12 },
              { label: "Niveles de madurez", count: 5 },
              { label: "Temas materiales", count: 34 },
            ].map((cat) => (
              <div key={cat.label} className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-5 py-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{cat.label}</p>
                  <p className="text-xs text-slate-500">{cat.count} valores configurados</p>
                </div>
                <Button variant="secondary" size="sm">Gestionar</Button>
              </div>
            ))}
          </div>
        )}

        {tab === "ia" && (
          <div className="max-w-2xl space-y-3">
            <p className="text-xs text-slate-500 mb-4">
              Routing de modelos por rol. Cambia el modelo sin tocar el código.
            </p>
            {[
              { label: "Aurora — Autora", model: "claude-sonnet-4-6", cost: "$0.003/1K tokens", reason: "Genera borradores largos con coherencia" },
              { label: "Rebeca — Revisora", model: "claude-sonnet-4-6", cost: "$0.003/1K tokens", reason: "Razonamiento estructurado para checklists" },
              { label: "Elena — Elevadora", model: "claude-opus-4-7", cost: "$0.015/1K tokens", reason: "Insights complejos y análisis estratégico" },
              { label: "Valeria — Validadora", model: "claude-haiku-4-5", cost: "$0.00025/1K tokens", reason: "Verificación binaria Definition of Done" },
            ].map((row) => (
              <div key={row.label} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">{row.label}</p>
                  <p className="text-xs text-slate-500">{row.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono font-medium text-slate-700">{row.model}</p>
                  <p className="text-[11px] text-slate-400">{row.cost}</p>
                </div>
              </div>
            ))}
            <div className="mt-4 bg-stone-50 border border-stone-200 rounded-xl px-5 py-3">
              <p className="text-xs text-slate-500">
                Costo estimado por conversación completa (Aurora→Rebeca→Elena→Valeria, ~8K tokens):
                <span className="font-semibold text-slate-700 ml-1">~$0.18 USD</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell() {
  const [section, setSection] = useState<Section>("client-tabs");
  const [navCollapsed, setNavCollapsed] = useState(false);

  const NAV: { key: Section; label: string; icon: (a: boolean) => React.ReactNode }[] = [
    { key: "chat",        label: "Chat",          icon: (a) => <IconChat active={a} /> },
    { key: "client-tabs", label: "Pestañas",      icon: (a) => <IconClients active={a} /> },
    { key: "clientes",    label: "Clientes",      icon: (a) => <IconClients active={a} /> },
    { key: "config",      label: "Configuración", icon: (a) => <IconConfig active={a} /> },
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setNavCollapsed((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen bg-stone-50">
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <nav
        aria-label="Navegación principal"
        className={`${navCollapsed ? "w-[52px]" : "w-56"} shrink-0 bg-white border-r border-stone-200 flex flex-col transition-all duration-200`}
      >
        {/* Logo + collapse toggle */}
        <div className={`${navCollapsed ? "px-2" : "px-4"} py-4 border-b border-stone-200 flex items-center ${navCollapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-brand-primary rounded-lg flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">R</span>
            </div>
            {!navCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-none">ResponSable</p>
                <p className="text-[10px] text-slate-400 mt-0.5">app interna · MVP</p>
              </div>
            )}
          </div>
          {!navCollapsed && (
            <button
              onClick={() => setNavCollapsed(true)}
              title="Colapsar sidebar (⌘B)"
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Nav items */}
        <div className="flex-1 py-3 px-2">
          {navCollapsed && (
            <button
              onClick={() => setNavCollapsed(false)}
              title="Expandir sidebar (⌘B)"
              className="w-full flex justify-center p-2.5 rounded-lg mb-1 text-slate-400 hover:bg-stone-50 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {NAV.map((item) => {
            const isActive = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                title={navCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${navCollapsed ? "justify-center px-0" : "gap-3 px-3"} py-2.5 rounded-lg mb-0.5 transition-colors text-left ${
                  isActive
                    ? "bg-brand-primary-light text-brand-primary-dark"
                    : "text-slate-600 hover:bg-stone-50"
                }`}
              >
                {item.icon(isActive)}
                {!navCollapsed && (
                  <span className={`text-sm font-medium ${isActive ? "text-brand-primary-dark" : ""}`}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User */}
        <div className={`${navCollapsed ? "px-2" : "px-3"} py-3 border-t border-stone-200`}>
          <div className={`flex items-center ${navCollapsed ? "justify-center" : "gap-2.5 px-2"} py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer`}>
            <div className="w-7 h-7 rounded-full bg-brand-primary shrink-0 flex items-center justify-center" title="Ana González">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            {!navCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">Ana González</p>
                <p className="text-[10px] text-slate-400 truncate">admin</p>
              </div>
            )}
          </div>
          {!navCollapsed && (
            <div className="mt-2 mx-2">
              <span className="text-[10px] text-slate-400 bg-stone-100 rounded px-1.5 py-0.5">
                dev preview — sin backend
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main id="main-content" className="flex-1 min-w-0 flex flex-col">
        {section === "chat"        && <ChatSection />}
        {section === "clientes"    && <ClientesSection onOpenChat={() => setSection("chat")} />}
        {section === "client-tabs" && <ClientTabsView onBack={() => setSection("clientes")} />}
        {section === "config"      && <ConfiguracionSection />}
      </main>
    </div>
  );
}
