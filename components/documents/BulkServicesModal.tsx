"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { ServiceOption } from "@/components/documents/doc-types";

export function BulkServicesModal({
  count,
  serviceOptions,
  onConfirm,
  onClose,
}: {
  count: number;
  serviceOptions: ServiceOption[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Modal open onClose={onClose} title={`Cambiar servicios de ${count} documento${count !== 1 ? "s" : ""}`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-600">
          Reemplaza por completo la lista de servicios en los documentos seleccionados.
          Deja vacío para limpiar todas las asociaciones.
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Servicios
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
          <Button variant="primary" size="sm" onClick={() => onConfirm(selected)}>
            Aplicar a {count}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
