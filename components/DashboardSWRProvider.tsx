"use client";

import { SWRConfig } from "swr";

// Retry exponencial global para todos los SWR del dashboard.
// Configura 3 reintentos con backoff (1.5s, 3s, 6s) — cubre flaps de red
// sin agotar cuota de API en errores reales.
// ConfigSWRProvider en /configuracion hereda y puede sobrescribir.
export function DashboardSWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        keepPreviousData: true,
        errorRetryCount: 3,
        onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
          // No reintentar en 404 ni 401 — son errores definitivos, no transitorios
          if (error instanceof Error && /40[14]/.test(error.message)) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), Math.min(1500 * 2 ** retryCount, 30_000));
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
