"use client";

import { useState } from "react";
import type { CatalogCategory } from "@/lib/catalogs/seeds";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CatalogRowItem } from "./Row";

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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
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
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={item ? "Editar ítem" : "Agregar ítem"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => handleSubmit()}
            loading={saving}
            disabled={!label.trim()}
          >
            {item ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-3"
        noValidate
      >
        <Input
          label="Label (lo que ve el usuario) *"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ej: GRI Standards"
          autoFocus
        />
        <Input
          label={
            item?.is_system
              ? "Valor canónico (sistema, no editable)"
              : "Valor canónico (auto)"
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={item?.is_system === true}
          className="font-mono text-xs disabled:bg-slate-50"
          placeholder="Se autogenera desde el label"
        />
        <Input
          label="Grupo (opcional, agrupa en dropdowns)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Ej: Sostenibilidad, Clima, Social"
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="catalog-item-description"
            className="text-sm font-medium text-slate-700"
          >
            Descripción (opcional, tooltip)
          </label>
          <textarea
            id="catalog-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
            placeholder="Ayuda al consultor a entender cuándo elegir este valor."
          />
        </div>

        {error && (
          <div
            role="alert"
            className="text-sm text-brand-berry bg-red-50 border border-red-200 rounded-lg p-2"
          >
            {error}
          </div>
        )}

        {/* Submit oculto para que Enter dentro del form funcione */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Submit
        </button>
      </form>
    </Modal>
  );
}
