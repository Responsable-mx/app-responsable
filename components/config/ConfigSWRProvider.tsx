"use client";

import { SWRConfig } from "swr";

// Wrapper SWR para todas las páginas de Configuración. Centraliza dedup
// de fetches: si CatalogsManager + UsersManager + PromptsManager piden el
// mismo endpoint en una ventana de 2s, solo dispara una request.
//
// Antes: cada componente tenía su propio SWR sin config compartida →
// re-fetcheaba al navegar entre tabs y al re-montar.
export function ConfigSWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 2000,
        revalidateOnFocus: false,
        errorRetryCount: 2,
        errorRetryInterval: 1500,
      }}
    >
      {children}
    </SWRConfig>
  );
}
