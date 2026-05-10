"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

interface Props {
  value: string;
  placeholder?: string;
  className: string;
  onChange: (v: string) => void;
}

export function AutoResizeTextarea({ value, placeholder, className, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  // useLayoutEffect corre tras DOM mount/value change antes del paint — evita
  // flash de altura mínima al cargar valores largos del cuestionario.
  useLayoutEffect(() => {
    resize();
  }, [value]);

  // ResizeObserver re-mide cuando cambia el ancho del textarea (drawer abre/cierra
  // y el grid pasa de 2→3 cols → textarea ancho baja → contenido reflowa más
  // líneas). Sin esto, overflow-hidden + height stale truncan el texto visible.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onInput={resize}
    />
  );
}
