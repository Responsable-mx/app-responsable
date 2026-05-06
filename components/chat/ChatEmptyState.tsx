"use client";

import {
  type ClientOption,
  type RoleId,
  ROLES,
  STARTERS,
} from "@/components/chat/chat-types";

/** Sugerencias contextuales cuando hay cliente seleccionado. */
function getContextualStarters(role: RoleId, clientName: string): string[] {
  const n = clientName;
  switch (role) {
    case "aurora":
      return [
        `Estructura el Estudio de Doble Materialidad de ${n}`,
        `Borrador de introducción para el reporte GRI de ${n}`,
        `Propuesta de alcance para el diagnóstico RSE de ${n}`,
        `Plantilla de matriz de stakeholders para ${n}`,
      ];
    case "rebeca":
      return [
        `Revisa el último borrador de ${n} (pega el texto)`,
        `Checklist de calidad para el informe de ${n}`,
        `Errores comunes en el expediente de ${n}`,
        `Rubrica de revisión de la propuesta para ${n}`,
      ];
    case "elena":
      return [
        `Qué insight estratégico aporta el diagnóstico de ${n}`,
        `Narrativa ejecutiva de los hallazgos de ${n} para dirección`,
        `Trade-offs del enfoque de materialidad de ${n}`,
        `Recomendaciones post-diagnóstico para ${n}`,
      ];
    case "valeria":
      return [
        `Valida el DoD del entregable de Doble Materialidad de ${n}`,
        `Inconsistencias entre secciones del informe de ${n}`,
        `Checklist de evidencia para la auditoría de ${n}`,
        `Trazabilidad de datos en el reporte de ${n}`,
      ];
  }
}

export type ChatEmptyStateProps = {
  role: RoleId;
  clientId: string;
  clients: ClientOption[];
  roles: typeof ROLES;
  starters: typeof STARTERS;
  onSend: (prompt: string) => void;
};

/**
 * Estado vacío del chat: sugerencias de inicio contextual por rol y cliente.
 * Solo se renderiza cuando messages.length === 0.
 * Sesiones recientes: disponibles en el panel Historial (botón en header).
 */
export function ChatEmptyState({
  role,
  clientId,
  clients,
  starters,
  onSend,
}: ChatEmptyStateProps) {
  const clientName = clients.find((c) => c.id === clientId)?.name ?? null;
  const suggestions = clientName
    ? getContextualStarters(role, clientName)
    : starters[role];

  return (
    <div className="py-10 max-w-2xl mx-auto" data-tour="empty-state">
      <p className="text-sm text-slate-600 mb-4 border-b border-slate-200 pb-4">
        {clientName
          ? `${clientName} cargado. Elige una sugerencia o escribe tu objetivo.`
          : "Sin cliente seleccionado. Respondo sobre metodología general."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSend(s)}
            className="group text-left text-xs px-3 py-2.5 bg-white border border-slate-200 rounded hover:border-brand-primary hover:bg-brand-primary-light transition-colors text-slate-700 flex items-start justify-between gap-2"
          >
            <span className="font-medium">{s}</span>
            <svg className="w-3 h-3 shrink-0 mt-0.5 text-slate-300 group-hover:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
