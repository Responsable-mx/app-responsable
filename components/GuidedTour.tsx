"use client";

import { useEffect } from "react";

const LS_KEY_PREFIX = "app-responsable:tour-completed:v";

/**
 * Lee el tour_version remoto. Si local < remoto (o no hay local),
 * ejecuta el tour y actualiza localStorage.
 * Así un admin puede forzar re-tour a todos bumping la versión.
 */
export function GuidedTour() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    (async () => {
      // 1. Consulta versión remota
      let remoteVersion = 1;
      try {
        const res = await fetch("/api/settings/tour-version");
        if (res.ok) {
          const j = await res.json();
          remoteVersion = Number(j?.data?.version ?? 1);
        }
      } catch {
        // sin red → no ejecutamos tour. Mejor silencio que tour espurio.
        return;
      }
      if (cancelled) return;

      // 2. Si este cliente ya vio esta versión, no hacer nada
      const lsKey = LS_KEY_PREFIX + remoteVersion;
      if (window.localStorage.getItem(lsKey) === "1") return;

      // 3. Carga driver.js dinámicamente y ejecuta
      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");
      if (cancelled) return;

      const d = driver({
        showProgress: true,
        nextBtnText: "Siguiente",
        prevBtnText: "Atrás",
        doneBtnText: "Listo",
        progressText: "{{current}} de {{total}}",
        steps: [
          {
            element: '[data-tour="role-selector"]',
            popover: {
              title: "4 roles, una cadena de calidad",
              description:
                "Aurora escribe borradores, Rebeca los revisa, Elena los eleva con insights estratégicos, y Valeria valida evidencia y trazabilidad. Usa el que necesites — no tienen que ir en orden.",
              side: "bottom",
              align: "start",
            },
          },
          {
            element: '[data-tour="client-picker"]',
            popover: {
              title: "Elige un cliente para personalizar",
              description:
                "Cuando seleccionas un cliente, sus atributos ESG (marcos, regulaciones, certificaciones, temas materiales) + 6 bloques narrativos van al prompt del rol. Sin cliente, los roles responden con metodología general.",
              side: "bottom",
              align: "end",
            },
          },
          {
            element: '[data-tour="empty-state"]',
            popover: {
              title: "Starters para arrancar",
              description:
                "Si no sabes por dónde empezar, haz clic en cualquiera de las 4 sugerencias. Cada rol tiene las suyas.",
              side: "top",
              align: "center",
            },
          },
          {
            element: '[data-tour="nav-clientes"]',
            popover: {
              title: "Gestionar clientes",
              description:
                "Desde aquí agregas clientes nuevos o editas su contexto. Entre más completo el contexto, mejor responden los 4 roles.",
              side: "right",
              align: "start",
            },
          },
          {
            element: '[data-tour="help-button"]',
            popover: {
              title: "¿Necesitas volver a ver este tour?",
              description:
                "Haz clic en el botón ? abajo a la izquierda para ver este tour de nuevo cuando quieras.",
              side: "right",
              align: "end",
            },
          },
        ],
        onDestroyStarted: () => {
          window.localStorage.setItem(lsKey, "1");
          d.destroy();
        },
      });

      setTimeout(() => {
        if (!cancelled) d.drive();
      }, 300);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/** Reinicia el tour localmente para este usuario/dispositivo. */
export function resetGuidedTourLocal() {
  if (typeof window === "undefined") return;
  // Borra todos los flags tour-completed:vX (cualquier versión)
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(LS_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
}
