"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { DocMeta, ServiceOption } from "@/components/documents/doc-types";

export function EditServicesModal({
  clientId,
  doc,
  serviceOptions,
  onClose,
  onSaved,
}: {
  clientId: string;
  doc: DocMeta;
  serviceOptions: ServiceOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(doc.service_ids);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_ids: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      toast.push("success", "Servicios actualizados");
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Editar servicios del documento">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Documento</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{doc.file_name}</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Servicios que usa este documento
          </p>
          {serviceOptions.length === 0 ? (
            <p className="text-xs text-slate-600">Cargando catálogo…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {serviceOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, o.id]
                          : selected.filter((s) => s !== o.id)
                      )
                    }
                    className="rounded border-slate-300 text-brand-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
