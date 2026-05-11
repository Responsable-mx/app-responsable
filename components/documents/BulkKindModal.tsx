"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import type { DocMeta } from "@/components/documents/doc-types";

export function BulkKindModal({
  count,
  onConfirm,
  onClose,
}: {
  count: number;
  onConfirm: (kind: DocMeta["kind"]) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<DocMeta["kind"]>("general");
  return (
    <Modal open onClose={onClose} title={`Cambiar categoría de ${count} documento${count !== 1 ? "s" : ""}`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-600">
          La categoría afecta cómo la IA prioriza estos documentos. Reversible.
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
            Nueva categoría
          </p>
          <SelectField
            value={kind}
            onChange={(v) => setKind(v as DocMeta["kind"])}
            options={[
              { value: "proposal", label: "Propuesta comercial" },
              { value: "general", label: "General" },
              { value: "sustainability_report", label: "Sustentabilidad" },
              { value: "financial_report", label: "Financiero" },
              { value: "dm_report", label: "Reporte DM" },
            ]}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(kind)}>
            Aplicar a {count}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
