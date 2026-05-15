"use client";

import { Modal } from "@/components/ui/Modal";

interface Props {
  onClose: () => void;
  onSelectFile: () => void;
  onDiscover: () => void;
  onPaste: () => void;
  canPaste: boolean;
}

interface OptionCard {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  hidden?: boolean;
}

export function ImportDocsModal({ onClose, onSelectFile, onDiscover, onPaste, canPaste }: Props) {
  function pick(fn: () => void) {
    onClose();
    fn();
  }

  const options: OptionCard[] = [
    {
      icon: (
        <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
      label: "Subir archivo",
      description: "PDF, DOCX, XLSX, PPTX hasta 25 MB · ZIP hasta 100 MB",
      onClick: () => pick(onSelectFile),
    },
    {
      icon: (
        <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      label: "Buscar con IA",
      description: "La IA busca informes públicos del cliente en internet",
      onClick: () => pick(onDiscover),
    },
    {
      icon: (
        <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      label: "Pegar texto",
      description: "Copia texto del cliente y extráelo al cuestionario",
      onClick: () => pick(onPaste),
      hidden: !canPaste,
    },
  ].filter((o) => !o.hidden);

  return (
    <Modal open onClose={onClose} title="Importar documento" size="md">
      <p className="text-sm text-slate-500 mb-5">
        Elige cómo quieres agregar contenido del cliente.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={opt.onClick}
            className="flex items-start gap-4 w-full text-left rounded border border-slate-200 bg-white px-4 py-4 shadow-sm hover:border-brand-primary hover:bg-brand-primary-light/20 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-colors"
          >
            <span className="mt-0.5 shrink-0">{opt.icon}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
              <span className="text-xs text-slate-500">{opt.description}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  );
}
