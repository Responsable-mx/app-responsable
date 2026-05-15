"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface VocabProposal {
  client_term: string;
  responsable_term: string;
  confidence: "high" | "medium" | "low";
}

interface Props {
  proposals: VocabProposal[];
  onSave: (accepted: VocabProposal[]) => Promise<void>;
  onClose: () => void;
}

const CONFIDENCE_LABEL: Record<VocabProposal["confidence"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const CONFIDENCE_COLOR: Record<VocabProposal["confidence"], string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

export function VocabularyReviewModal({ proposals, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i).filter((i) => proposals[i]!.confidence !== "low"))
  );
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const accepted = Array.from(selected).map((i) => ({
      ...proposals[i]!,
      client_term: edits[i] ?? proposals[i]!.client_term,
    }));
    await onSave(accepted);
    setSaving(false);
  }

  const selectedCount = selected.size;

  return (
    <Modal
      open
      onClose={onClose}
      title="Revisar vocabulario detectado"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <span className="text-xs text-slate-500">
            {selectedCount} de {proposals.length} seleccionados para guardar
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={selectedCount === 0}
              onClick={() => void handleSave()}
            >
              Guardar {selectedCount > 0 ? `${selectedCount} término${selectedCount !== 1 ? "s" : ""}` : ""}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          La IA detectó estos términos en los documentos del cliente. Selecciona los que quieres guardar
          como vocabulario del cliente — la IA los reconocerá en futuras lecturas y reportes.
        </p>

        {proposals.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            No se detectaron términos equivalentes en los documentos.
          </div>
        ) : (
          <div className="border border-slate-200 rounded divide-y divide-slate-100">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 px-3 py-2 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <span className="w-5" />
              <span>El cliente dice</span>
              <span>Equivale a (ResponSable)</span>
              <span>Certeza</span>
            </div>

            {proposals.map((p, i) => (
              <div
                key={i}
                className={`grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-center px-3 py-2.5 transition-colors ${
                  selected.has(i) ? "bg-white" : "bg-slate-50/60 opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggle(i)}
                  className="accent-brand-primary w-4 h-4"
                  aria-label={`Seleccionar "${p.client_term}"`}
                />
                <input
                  type="text"
                  className="font-sans text-sm text-slate-900 font-medium border border-transparent rounded px-1.5 py-0.5 bg-transparent hover:border-slate-200 focus:outline-none focus:border-brand-primary/50 focus:bg-white w-full"
                  value={edits[i] ?? p.client_term}
                  onChange={(e) =>
                    setEdits((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                  title="Edita el término si la IA no lo detectó bien"
                />
                <span className="text-sm text-slate-700 truncate">{p.responsable_term}</span>
                <span
                  className={`text-[10px] font-bold uppercase rounded-sm px-1.5 py-0.5 whitespace-nowrap ${CONFIDENCE_COLOR[p.confidence]}`}
                >
                  {CONFIDENCE_LABEL[p.confidence]}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-400">
          Puedes editar el término del cliente directamente en la columna izquierda si la IA no lo capturó bien.
        </p>
      </div>
    </Modal>
  );
}
