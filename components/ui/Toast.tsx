"use client";

// Toast system — ToastProvider + useToast hook.
// aria-live="polite" para lectores de pantalla.
// Auto-dismiss a los 4s (configurable por llamada).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "info" | "warning";
type Toast = { id: string; tone: ToastTone; message: string };
type ToastCtx = {
  push: (tone: ToastTone, message: string, durationMs?: number) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup de timers pendientes al desmontar el provider.
  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((t) => clearTimeout(t));
      timersMap.clear();
    };
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, durationMs = 4000) => {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, tone, message }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, durationMs);
      timers.current.set(id, timer);
    },
    [],
  );

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-lg shadow-lg pl-4 pr-2 py-3 text-sm font-medium text-white animate-toast-in flex items-start gap-3 ${
              t.tone === "success"
                ? "bg-emerald-700"
                : t.tone === "error"
                  ? "bg-brand-berry"
                  : t.tone === "warning"
                    ? "bg-amber-600"
                    : "bg-brand-primary"
            }`}
          >
            <span className="flex-1 pr-1 pt-0.5">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 min-h-10 min-w-10 inline-flex items-center justify-center rounded hover:bg-black/10"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
