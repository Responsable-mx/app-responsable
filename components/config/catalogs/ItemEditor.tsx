"use client";

import { useState } from "react";
import type { CatalogCategory } from "@/lib/catalogs/seeds";
import type { CatalogRowItem } from "./Row";

const inputCls =
  "w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent";

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

export function ItemEditor({
  item,
  category,
  onClose,
  onSaved,
}: {
  item: CatalogRowItem | null;
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
              className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-medium rounded-lg disabled:bg-stone-300 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando…" : item ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
