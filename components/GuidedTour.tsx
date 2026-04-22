"use client";

import { useEffect } from "react";

const TOUR_STORAGE_KEY = "app-responsable:tour-completed:v1";

/**
 * Guided tour de primer uso. Arranca la primera vez que el consultor entra
 * al chat. Explica los 4 roles, el selector de cliente y el link a /clientes.
 * Usa driver.js (F23 de S-Peak App).
 */
export function GuidedTour() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TOUR_STORAGE_KEY) === "1") return;

    let cancelled = false;

    (async () => {
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
                "Cuando seleccionas un cliente, sus 6 bloques de contexto (sector, impactos, estrategia, etc.) van al prompt del rol. Sin cliente, los roles responden con metodología general.",
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
            popover: {
              title: "Gestionar clientes",
              description:
                "Desde el menú lateral (🏢 Clientes) puedes agregar clientes nuevos o editar su contexto. Entre más completo el contexto, mejor responden los 4 roles.",
            },
          },
        ],
        onDestroyStarted: () => {
          window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
          d.destroy();
        },
      });

      // Espera un tick para que el DOM quede pintado.
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

/** Reinicia el tour. Útil si lo pedimos desde un menú "Ver tutorial". */
export function resetGuidedTour() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOUR_STORAGE_KEY);
}
