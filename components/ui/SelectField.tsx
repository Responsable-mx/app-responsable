"use client";

// Reemplaza <select> nativo donde la fuente del dropdown importa.
// El <select> nativo en Windows/Chrome abre un popup del SO que ignora CSS.
// Este componente usa un listbox custom: fuente Inter garantizada.
// Sesión 10: + role=combobox, aria-expanded, arrow key navigation, disabled prop, shadow-sm.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Estimación del alto máximo del listbox (max-h-72 = 18rem ≈ 288px) + margin.
const LISTBOX_MAX_H = 296;

// Sube por el árbol buscando el primer ancestro con overflow auto/scroll.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  value,
  onChange,
  options,
  placeholder = "Todos",
  className,
  id: externalId,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const [maxH, setMaxH] = useState<number>(LISTBOX_MAX_H);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const listId = `${externalId ?? uid}-listbox`;

  // Flip + cap dinámico de max-height al espacio real disponible.
  // Considera el contenedor scrollable más cercano (modal, panel) además del viewport.
  // Dentro de un modal `overflow-y-auto` el bound real es el body del modal, no la ventana —
  // si no cappeamos, el listbox absoluto excede el body y queda recortado por el overflow.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollParent = findScrollParent(triggerRef.current);
    const containerBottom = scrollParent
      ? scrollParent.getBoundingClientRect().bottom
      : window.innerHeight;
    const containerTop = scrollParent
      ? scrollParent.getBoundingClientRect().top
      : 0;
    const spaceBelow = containerBottom - rect.bottom - 8;
    const spaceAbove = rect.top - containerTop - 8;
    const flip = spaceBelow < LISTBOX_MAX_H && spaceAbove > spaceBelow;
    setDropUp(flip);
    setMaxH(Math.max(80, Math.min(LISTBOX_MAX_H, flip ? spaceAbove : spaceBelow)));
  }, [open]);

  // Auto-scroll del item focused al navegar con teclado.
  useLayoutEffect(() => {
    if (!open || focusedIdx < 0 || !listRef.current) return;
    const item = listRef.current.children[focusedIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx, open]);

  // Placeholder solo vive en el trigger (estado vacío). El listbox solo muestra opciones reales.
  // Click fuera → cerrar. No llamamos setFocusedIdx en el cuerpo del efecto
  // para evitar react-hooks/set-state-in-effect; el reset se hace dentro del callback.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusedIdx(-1);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Teclado: todo en el trigger para mantener el foco en él (patrón WAI-ARIA combobox).
  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
        setFocusedIdx(Math.max(0, options.findIndex(o => o.value === value)));
      }
    } else {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx(i => Math.min(i + 1, options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusedIdx >= 0) onChange(options[focusedIdx]!.value);
        setOpen(false); setFocusedIdx(-1);
      } else if (e.key === "Escape") {
        setOpen(false); setFocusedIdx(-1);
        // Devolver foco al trigger tras cerrar con ESC (patrón WAI-ARIA combobox)
        triggerRef.current?.focus();
      } else if (e.key === "Tab") {
        setOpen(false); setFocusedIdx(-1);
      }
    }
  }

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;
  const activeDescId = open && focusedIdx >= 0 ? `${externalId ?? uid}-opt-${focusedIdx}` : undefined;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        ref={triggerRef}
        id={externalId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={activeDescId}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        className={`flex items-center justify-between gap-1.5 w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-300"
        }`}
      >
        <span className={value ? "text-slate-900" : "text-slate-500"}>{selectedLabel}</span>
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-100 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          style={{ maxHeight: maxH }}
          className={`absolute left-0 z-50 bg-white border border-slate-200 rounded shadow-md min-w-full overflow-y-auto focus:outline-none ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${externalId ?? uid}-opt-${i}`}
              role="option"
              aria-selected={value === o.value}
              onClick={() => { onChange(o.value); setOpen(false); setFocusedIdx(-1); }}
              className={`text-xs px-3 py-2.5 cursor-pointer transition-colors ${
                i === focusedIdx || value === o.value
                  ? "bg-brand-primary-light text-brand-primary-dark font-medium"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
