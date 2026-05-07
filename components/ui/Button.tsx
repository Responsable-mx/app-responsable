"use client";

// Button primitivo canónico — Nivel 1 del design system.
// 4 variantes × 3 tamaños × estados (idle/loading/disabled).
// forwardRef para permitir focus imperativo desde forms.
// Tokens brand-* declarados en app/globals.css.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary hover:bg-brand-primary-hover text-white shadow-sm",
  secondary:
    "bg-white hover:bg-slate-50 text-brand-primary-dark border border-slate-300",
  ghost: "bg-transparent hover:bg-slate-100 text-brand-primary-dark",
  destructive:
    "bg-brand-berry hover:bg-brand-berry-hover text-white shadow-sm",
};

// Tamaños diseñados para hit-area táctil (Apple HIG / WCAG 2.5.5).
//   sm  → 32px (chips compactos)
//   md  → 40px (default forms y CTAs)
//   lg  → 48px (CTAs primarios)
const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 min-h-8",
  md: "text-sm px-4 py-2 gap-2 min-h-10",
  lg: "text-base px-5 py-3 gap-2 min-h-12",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    icon,
    children,
    className = "",
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  // Click-disabled cuando loading O disabled. Pero opacity-50 SOLO cuando
  // disabled-y-no-loading. Sin esta separación, loading se ve idéntico a
  // disabled (ambos pintan opacity-50 sobre el mismo bg). El spinner debe
  // mantener contraste pleno; la opacidad es señal de "no clickeable".
  const isInteractionBlocked = disabled || loading;
  const showFadedOut = disabled && !loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isInteractionBlocked}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={`inline-flex items-center justify-center rounded font-semibold transition-colors ${isInteractionBlocked ? "cursor-not-allowed" : ""} ${showFadedOut ? "opacity-50" : ""} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
