"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { resetGuidedTourLocal } from "@/components/GuidedTour";
import { IconHelp, IconTarget, IconMail } from "@/components/ui/Icons";

/**
 * Botón flotante "?" en sidebar. Abre un menú con:
 * - Ver tour del chat (limpia localStorage + navega a /chat)
 * - Reportar un problema (mailto)
 */
export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function runChatTour() {
    resetGuidedTourLocal();
    setOpen(false);
    if (pathname === "/chat") {
      window.location.reload();
    } else {
      router.push("/chat");
    }
  }

  return (
    <div ref={rootRef} className="relative" data-tour="help-button">
      <button
        onClick={() => setOpen((s) => !s)}
        aria-label="Ayuda"
        className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
      >
        <IconHelp className="w-[18px] h-[18px] text-slate-600 group-hover:text-slate-600" />
        <span>Ayuda</span>
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-72 bg-white rounded shadow-lg border border-slate-200 py-1.5 z-50 animate-fade-in">
          <button
            onClick={runChatTour}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-start gap-2.5"
          >
            <IconTarget className="w-4 h-4 mt-0.5 shrink-0 text-brand-primary-hover" />
            <div>
              <div className="font-medium">Ver tour del chat</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Repite la guía de los 4 roles
              </div>
            </div>
          </button>
          <a
            href="mailto:soporte@responsable.net?subject=App ResponSable — Problema"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-start gap-2.5"
          >
            <IconMail className="w-4 h-4 mt-0.5 shrink-0 text-indigo-700" />
            <div>
              <div className="font-medium">Reportar un problema</div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Enviamos un correo a soporte
              </div>
            </div>
          </a>
          <div className="px-3 pt-2 pb-1 text-[10px] text-slate-600 border-t border-slate-100 mt-1">
            App ResponSable · Consultoría en sostenibilidad con IA
          </div>
        </div>
      )}
    </div>
  );
}
