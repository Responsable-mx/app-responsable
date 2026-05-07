"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    resize();
  }, [value]);

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
