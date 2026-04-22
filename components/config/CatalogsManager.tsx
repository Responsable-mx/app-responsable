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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type {
  CatalogCategory,
  CATALOG_CATEGORIES as CAT_TYPE,
} from "@/lib/catalogs/seeds";

type Category = (typeof CAT_TYPE)[number];

type Item = {
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

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: Item[] }>;
  });

export function CatalogsManager({ categories }: { categories: Category[] }) {
  const [active, setActive] = useState<CatalogCategory>(categories[0].key);
  const current = categories.find((c) => c.key === active) ?? categories[0];

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-stone-100 p-1 rounded-lg mb-4">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              active === c.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <CatalogPanel category={current} />
    </div>
  );
}

function CatalogPanel({ category }: { category: Category }) {
  const swrKey = `/api/catalogs?category=${category.key}&all=true`;
  const { data, error, isLoading, mutate } = useSWR(swrKey, fetcher);
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [feedback, setFeedback] = useState("");

  const items = data?.data ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(items, oldIndex, newIndex);
    // Optimistic update
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
        mutate(); // revert
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
    <div className="bg-white border border-stone-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {category.label}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{category.description}</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800"
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

      {isLoading && (
        <div className="text-sm text-slate-500">Cargando…</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">
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
            <div className="divide-y divide-stone-100">
              <div className="grid grid-cols-[24px_1fr_120px_100px_80px_80px] gap-3 items-center text-[10px] uppercase tracking-wide text-slate-500 pb-2">
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
                          x.id === it.id ? { ...x, is_active: !x.is_active } : x
                        ),
                      },
                      { revalidate: false }
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Eliminar ${deleteTarget?.label ?? ""}`}
        description="Se eliminará del catálogo. Si algún cliente tenía este valor asignado, el string queda en su ficha pero ya no se podrá elegir en dropdowns nuevos. No se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Row({
  item,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  item: Item;
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
        className="cursor-grab text-slate-400 hover:text-slate-700 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <div>
        <div className="font-medium text-slate-900">{item.label}</div>
        <div className="text-[10px] text-slate-500 font-mono">{item.value}</div>
      </div>
      <div className="text-xs text-slate-600">{item.group_name ?? "—"}</div>
      <button
        onClick={onToggleActive}
        className={`text-xs px-2 py-0.5 rounded-full w-fit ${
          item.is_active
            ? "bg-green-50 text-green-800"
            : "bg-stone-100 text-slate-500"
        }`}
      >
        {item.is_active ? "Activo" : "Inactivo"}
      </button>
      <div className="text-xs text-slate-500">
        {item.is_system ? "🔒 Sistema" : "Custom"}
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

function ItemEditor({
  item,
  category,
  onClose,
  onSaved,
}: {
  item: Item | null;
  category: CatalogCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [value, setValue] = useState(item?.value ?? "");
  const [groupName, setGroupName] = useState(item?.group_name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        category,
        label,
        value: value.trim() || undefined,
        group_name: groupName.trim() || null,
        description: description.trim() || null,
      };
      const url = item ? `/api/catalogs/${item.id}` : "/api/catalogs";
      const method = item ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al guardar");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de conexión");
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-lg border border-stone-200 max-w-lg w-full p-6"
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {item ? "Editar ítem" : "Agregar ítem"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Label (lo que ve el usuario) *">
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputCls}
              placeholder="Ej: GRI Standards"
              autoFocus
            />
          </Field>
          <Field
            label={
              item?.is_system
                ? "Valor canónico (sistema, no editable)"
                : "Valor canónico (auto)"
            }
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={item?.is_system === true}
              className={`${inputCls} font-mono text-xs disabled:bg-stone-50`}
              placeholder="Se autogenera desde el label"
            />
          </Field>
          <Field label="Grupo (opcional, agrupa en dropdowns)">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className={inputCls}
              placeholder="Ej: Sostenibilidad, Clima, Social"
            />
          </Field>
          <Field label="Descripción (opcional, tooltip)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Ayuda al consultor a entender cuándo elegir este valor."
            />
          </Field>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-slate-700 hover:bg-stone-50 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !label.trim()}
              className="px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:bg-stone-300"
            >
              {saving ? "Guardando…" : item ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
