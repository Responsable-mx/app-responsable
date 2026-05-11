"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";

export function PasteExtractModal({
  questionnaireSteps,
  initialStepKey,
  onExtract,
  onClose,
}: {
  questionnaireSteps: { key: string; title: string }[];
  initialStepKey: string;
  onExtract: (text: string, stepKey: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [stepKey, setStepKey] = useState(initialStepKey);
  const hasSteps = questionnaireSteps.length > 0;
  const canSubmit = text.trim().length >= 10 && !!stepKey && hasSteps;
  return (
    <Modal
      open
      onClose={onClose}
      title="Pegar texto para extracción"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            onClick={() => onExtract(text, stepKey)}
          >
            Extraer y llenar →
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-600">
          Pega transcripción, notas o texto copiado. Aurora extraerá los campos del paso seleccionado.
        </p>
        <textarea
          className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-y min-h-[120px] max-h-[360px]"
          placeholder="Pega aquí…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <p className="text-[11px] text-slate-500 tabular-nums -mt-1">
          {text.length.toLocaleString()} / 50,000 chars
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
            Paso del cuestionario
          </p>
          <SelectField
            value={stepKey}
            onChange={setStepKey}
            options={questionnaireSteps.map((s) => ({ value: s.key, label: s.title }))}
            placeholder={hasSteps ? "Selecciona un paso…" : "Cargando pasos…"}
          />
        </div>
      </div>
    </Modal>
  );
}
