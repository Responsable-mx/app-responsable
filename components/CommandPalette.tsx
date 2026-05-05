"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

// Comando palette tipo Linear/Notion. Cmd+K (Mac) o Ctrl+K (Win) abre.
// Patrón estándar SaaS tier-1 2026. Sin dependencia externa — implementación
// minimal con keyboard navigation + fuzzy match básico.

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  group: "Navegación" | "Clientes" | "Acciones";
  href?: string;
  action?: () => void;
  keywords?: string[];
};

type ClientLite = {
  id: string;
  name: string;
  sector: string | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ data: ClientLite[] }>);

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch clients solo cuando se abre — evita fetch en cada page load.
  const { data } = useSWR(
    open ? "/api/clients" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  // Atajo global Cmd+K / Ctrl+K. ? abre help (placeholder).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !inEditable && !open) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset al abrir + foco input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Lista de comandos: estáticos + dinámicos (clientes).
  const commands = useMemo<Cmd[]>(() => {
    const staticCmds: Cmd[] = [
      { id: "nav-clientes", group: "Navegación", label: "Ir a Clientes", hint: "g c", href: "/clientes" },
      { id: "nav-chat", group: "Navegación", label: "Ir a Chat IA general", hint: "g h", href: "/chat" },
      { id: "nav-config", group: "Navegación", label: "Ir a Configuración", href: "/configuracion" },
      { id: "nav-config-cat", group: "Navegación", label: "Configuración · Catálogos", href: "/configuracion/catalogos" },
      { id: "nav-config-prompts", group: "Navegación", label: "Configuración · Prompts IA", href: "/configuracion/prompts" },
      { id: "nav-config-uso", group: "Navegación", label: "Configuración · Uso IA", href: "/configuracion/uso-ia" },
      { id: "nav-config-users", group: "Navegación", label: "Configuración · Usuarios", href: "/configuracion/usuarios" },
      { id: "act-new-client", group: "Acciones", label: "Crear cliente nuevo", hint: "n", href: "/clientes/nuevo" },
    ];
    const clientCmds: Cmd[] = (data?.data ?? []).map((c) => ({
      id: `client-${c.id}`,
      group: "Clientes",
      label: c.name,
      hint: c.sector ?? undefined,
      href: `/clientes/${c.id}`,
      keywords: c.sector ? [c.sector] : [],
    }));
    return [...staticCmds, ...clientCmds];
  }, [data]);

  // Filtro fuzzy básico: substring case-insensitive sobre label + keywords + hint.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = [c.label, c.hint ?? "", ...(c.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [commands, query]);

  // Reset índice cuando cambia query.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function execute(cmd: Cmd) {
    setOpen(false);
    if (cmd.href) router.push(cmd.href);
    else if (cmd.action) cmd.action();
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) execute(cmd);
    }
  }

  if (!open) return null;

  // Agrupar por group manteniendo orden de aparición.
  const groups: Array<{ name: string; items: Cmd[] }> = [];
  for (const c of filtered) {
    let g = groups.find((x) => x.name === c.group);
    if (!g) {
      g = { name: c.group, items: [] };
      groups.push(g);
    }
    g.items.push(c);
  }

  // Map global index → cmd para highlight activo cross-grupo.
  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Comando palette"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-3 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar cliente, página o acción…"
            className="flex-1 outline-none text-sm placeholder-slate-400"
          />
          <kbd className="text-[10px] font-mono text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Sin coincidencias
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="py-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {g.name}
                </div>
                {g.items.map((c) => {
                  const idx = runningIdx++;
                  const active = idx === activeIdx;
                  return (
                    <button
                      key={c.id}
                      onClick={() => execute(c)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 ${
                        active ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-sm text-slate-900 truncate">{c.label}</span>
                      {c.hint && (
                        <span className="text-[11px] text-slate-500 shrink-0">{c.hint}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-slate-200 px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navegar</span>
            <span><kbd className="font-mono">↵</kbd> abrir</span>
          </div>
          <span>
            <kbd className="font-mono">⌘K</kbd> / <kbd className="font-mono">Ctrl+K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
