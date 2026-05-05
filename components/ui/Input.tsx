"use client";

// Input primitivo con label, helper y error.
// aria-invalid + aria-describedby auto-configurados para lectores de pantalla.
// Focus ring brand-primary teal de ResponSable.

import { useId, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}

export function Input({
  label,
  helper,
  error,
  id,
  className = "",
  ...rest
}: InputProps) {
  const reactId = useId();
  const autoId = id ?? `input-${reactId}`;
  const describedBy = error
    ? `${autoId}-error`
    : helper
      ? `${autoId}-helper`
      : undefined;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={autoId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={autoId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={`rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ${error ? "border-brand-berry" : "border-slate-300"} ${className}`}
        {...rest}
      />
      {error ? (
        <span
          id={`${autoId}-error`}
          className="text-xs text-brand-berry font-medium"
        >
          {error}
        </span>
      ) : helper ? (
        <span id={`${autoId}-helper`} className="text-xs text-slate-600">
          {helper}
        </span>
      ) : null}
    </div>
  );
}
