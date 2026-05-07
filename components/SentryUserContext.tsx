"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Componente cliente que inyecta el email del usuario autenticado en el scope
 * de Sentry. Sin esto, los errores aparecen sin contexto de quién los disparó.
 *
 * Se monta una vez en el dashboard layout (Server Component → Client bridge).
 * El email viene del server por prop — no necesita fetch adicional.
 */
export function SentryUserContext({ email }: { email: string | null }) {
  useEffect(() => {
    if (email) {
      Sentry.setUser({ email });
    } else {
      Sentry.setUser(null);
    }
  }, [email]);

  return null;
}
