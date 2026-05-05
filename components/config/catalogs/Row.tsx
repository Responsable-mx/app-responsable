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
        className="cursor-grab text-slate-600 hover:text-slate-700 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
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
            : "bg-stone-100 text-slate-600"
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
          className="text-xs px-2 py-1 text-slate-700 hover:bg-stone-50 rounded"
        >
          ✎ Editar
        </button>
        {!item.is_system && (
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 text-red-700 hover:bg-red-50 rounded"
          >
            ⊗
          </button>
        )}
      </div>
    </div>
  );
}
