"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal de confirmación accesible. Reemplaza window.confirm() para acciones
 * destructivas o acciones que rompen el trabajo en progreso (F2, F3).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onCancel();
      }
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "destructive"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-teal-700 hover:bg-teal-800";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-lg border border-stone-200 max-w-md w-full p-6"
      >
        <h2 id="confirm-title" className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
            {description}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-stone-100 rounded-lg"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white font-medium rounded-lg ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
