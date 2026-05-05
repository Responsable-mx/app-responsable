"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { CATALOG_CATEGORIES as CAT_TYPE } from "@/lib/catalogs/seeds";
import { Row, type CatalogRowItem } from "./Row";
import { ItemEditor } from "./ItemEditor";

type Category = (typeof CAT_TYPE)[number];

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: CatalogRowItem[] }>;
  });

export function CatalogPanel({ category }: { category: Category }) {
  const swrKey = `/api/catalogs?category=${category.key}&all=true`;
  const { data, error, isLoading, mutate } = useSWR(swrKey, fetcher);
  const [editing, setEditing] = useState<CatalogRowItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogRowItem | null>(null);
  const [feedback, setFeedback] = useState("");

  const items = data?.data ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(items, oldIndex, newIndex);
    mutate({ data: newOrder }, { revalidate: false });
    try {
      const res = await fetch("/api/catalogs/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.key,
          ordered_ids: newOrder.map((i) => i.id),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setFeedback(json.error ?? "Error al reordenar");
        mutate();
      }
    } catch {
      setFeedback("Error de conexión al reordenar");
      mutate();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/catalogs/${deleteTarget.id}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(json.error ?? "Error al eliminar");
    } else {
      setFeedback(`Eliminado: ${deleteTarget.label}`);
      mutate();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {category.label}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">{category.description}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-medium rounded-lg"
        >
          + Agregar
        </button>
      </div>

      {feedback && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-2 flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback("")}
            className="text-amber-700 hover:underline"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          Error cargando items: {(error as Error).message}
        </div>
      )}

      {isLoading && <SkeletonList items={4} />}

      {!isLoading && items.length === 0 && (
        <div className="text-sm text-slate-600 text-center py-8">
          No hay ítems. Agrega el primero.
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-[24px_1fr_120px_100px_80px_80px] gap-3 items-center text-[10px] uppercase tracking-wide text-slate-600 pb-2">
                <span></span>
                <span>Label · valor</span>
                <span>Grupo</span>
                <span>Estado</span>
                <span>Tipo</span>
                <span className="text-right">Acciones</span>
              </div>
              {items.map((it) => (
                <Row
                  key={it.id}
                  item={it}
                  onEdit={() => setEditing(it)}
                  onDelete={() => setDeleteTarget(it)}
                  onToggleActive={async () => {
                    mutate(
                      {
                        data: items.map((x) =>
                          x.id === it.id
                            ? { ...x, is_active: !x.is_active }
                            : x,
                        ),
                      },
                      { revalidate: false },
                    );
                    const res = await fetch(`/api/catalogs/${it.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ is_active: !it.is_active }),
                    });
                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}));
                      setFeedback(j.error ?? "Error al actualizar");
                      mutate();
                    } else {
                      mutate();
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {(editing || creating) && (
        <ItemEditor
          item={editing}
          category={category.key}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            mutate();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Eliminar ${deleteTarget?.label ?? ""}`}
        description="Se eliminará del catálogo. Si algún cliente tenía este valor asignado, el string queda en su ficha pero ya no se podrá elegir en dropdowns nuevos. No se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
