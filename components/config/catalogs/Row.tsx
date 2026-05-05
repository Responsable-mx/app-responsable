"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CatalogCategory } from "@/lib/catalogs/seeds";

export type CatalogRowItem = {
  id: string;
  category: CatalogCategory;
  value: string;
  label: string;
  description: string | null;
  group_name: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

export function Row({
  item,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  item: CatalogRowItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[24px_1fr_120px_100px_80px_80px] gap-3 items-center py-2 text-sm"
    >
      <button
        aria-label="Arrastrar para reordenar"
        className="cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing flex items-center justify-center"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
        </svg>
      </button>
      <div>
        <div className="font-medium text-slate-900">{item.label}</div>
        <div className="text-[10px] text-slate-600 font-mono">{item.value}</div>
      </div>
      <div className="text-xs text-slate-600">{item.group_name ?? "—"}</div>
      <button
        onClick={onToggleActive}
        className={`text-xs px-2 py-0.5 rounded-full w-fit ${
          item.is_active
            ? "bg-green-50 text-green-800"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {item.is_active ? "Activo" : "Inactivo"}
      </button>
      <div className="text-xs text-slate-600">
        {item.is_system ? (
          <span className="inline-flex items-center gap-1" title="Item del sistema · no se puede eliminar, solo desactivar o renombrar">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Sistema
          </span>
        ) : (
          "Custom"
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={onEdit}
          aria-label={`Editar ${item.label}`}
          className="text-xs px-3 py-2 text-slate-700 hover:bg-slate-50 rounded min-w-[40px] min-h-[40px] inline-flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Editar
        </button>
        {!item.is_system && (
          <button
            onClick={onDelete}
            aria-label={`Eliminar ${item.label}`}
            className="text-xs px-3 py-2 text-red-700 hover:bg-red-50 rounded min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
