"use client";

import { useState } from "react";
import useSWR from "swr";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SelectField } from "@/components/ui/SelectField";
import type {
  FieldValue,
  SourceItem,
  SourceType,
  WizardField,
} from "@/lib/questionnaires/types";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { MultiCombobox } from "./MultiCombobox";
import { SOURCE_CHIP } from "./wizard-ui-types";

const catalogFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []) as { value: string; label: string }[]);

interface Props {
  field: WizardField;
  value: FieldValue;
  sourceType: SourceType;
  sources: SourceItem[];
  validated: boolean;
  filled: boolean;
  stale: boolean;
  hint?: string;
  updatedAt?: string;
  sectionComplete?: boolean;
  hideSource?: boolean;
  skipValidationGuard?: boolean;
  selfClientId?: string;
  onChange: (v: FieldValue) => void;
  onToggleValidated: () => void;
  onOpenDrawer: () => void;
}

export function FieldRow({
  field,
  value,
  sourceType,
  sources,
  validated,
  filled,
  stale,
  hint,
  updatedAt,
  sectionComplete,
  onChange,
  onToggleValidated,
  onOpenDrawer,
  hideSource = false,
  skipValidationGuard = false,
  selfClientId,
}: Props) {
  const [pendingEdit, setPendingEdit] = useState<{ v: FieldValue } | null>(null);

  // Opciones dinámicas desde catálogo (cuando field.catalog está definido)
  // catalog="clients" usa /api/clients?catalog=1 (excluyendo el cliente actual)
  const catalogUrl = field.catalog
    ? field.catalog === "clients"
      ? `/api/clients?catalog=1${selfClientId ? `&exclude=${selfClientId}` : ""}`
      : `/api/catalogs?category=${field.catalog}`
    : null;

  const { data: catalogItems } = useSWR<{ value: string; label: string }[]>(
    catalogUrl,
    catalogFetcher,
    { revalidateOnFocus: false, dedupingInterval: 3_600_000 }
  );

  const resolvedOptions: { value: string; label: string }[] = catalogItems
    ? catalogItems
    : (field.options ?? []).map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt : opt.label;
        return { value: v, label: l };
      });

  const chip = SOURCE_CHIP[sourceType];
  const baseInput =
    "font-sans w-full border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

  function handleChange(newValue: FieldValue) {
    if (validated && !skipValidationGuard) {
      setPendingEdit({ v: newValue });
      return;
    }
    onChange(newValue);
  }

  return (
    <div className="px-4 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-start gap-3 mb-1.5">
        <label className="text-xs font-semibold text-slate-700 flex-1 min-w-0">
          {field.label}
          {field.required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Chip de origen: si hay exactamente 1 fuente → link directo; >1 → drawer */}
          {!hideSource && (sourceType !== "consultor_only" || sources.length > 0) &&
            (sources.length === 1 ? (
              <a
                href={sources[0]?.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${chip.bg} ${chip.text} hover:underline`}
                title={sources[0]?.title}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                <svg
                  className="w-2.5 h-2.5 opacity-60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            ) : (
              <button
                type="button"
                onClick={onOpenDrawer}
                className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${chip.bg} ${chip.text}`}
                title="Ver fuentes"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                {sources.length > 0 && (
                  <span className="opacity-70">· {sources.length}</span>
                )}
              </button>
            ))}
          {/* Fuentes vacías: botón minimal para abrir drawer */}
          {!hideSource && sourceType === "consultor_only" && sources.length === 0 && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              title="Agregar fuentes"
            >
              + fuente
            </button>
          )}
          {stale && (
            <span
              title="Alguna fuente >2 años"
              className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 font-medium"
            >
              ⚠ desactualizada
            </span>
          )}
          {/* Badge validado: ocultar cuando sección al 100% — el progress bar ya comunica el estado */}
          {validated && !sectionComplete && (
            <button
              type="button"
              onClick={onToggleValidated}
              className="text-[10px] font-bold rounded-sm px-1.5 py-0.5 bg-emerald-100 text-emerald-700 transition-colors"
              title="Validado por consultor"
            >
              ✓ validado
            </button>
          )}
          {!validated && filled && (
            <button
              type="button"
              onClick={onToggleValidated}
              className="text-[10px] font-bold rounded-sm px-1.5 py-0.5 bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              title="Marcar como validado"
            >
              validar
            </button>
          )}
        </div>
      </div>

      {field.type === "textarea" ? (
        <AutoResizeTextarea
          className={`${baseInput} px-3 py-2 min-h-[40px] resize-none overflow-hidden`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(v) => handleChange(v)}
        />
      ) : field.type === "number" ? (
        <input
          type="number"
          className={`${baseInput} px-3 py-2 tabular-nums`}
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            handleChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      ) : field.type === "boolean" ? (
        <div className="flex gap-2">
          {[
            { v: true, label: "Sí" },
            { v: false, label: "No" },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => handleChange(value === opt.v ? null : opt.v)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                value === opt.v
                  ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : field.type === "select" ? (
        <SelectField
          value={typeof value === "string" ? value : ""}
          onChange={(v) => handleChange(v || null)}
          options={resolvedOptions}
          placeholder="— Seleccionar —"
        />
      ) : field.type === "multiselect" ? (
        <MultiCombobox
          options={resolvedOptions}
          value={
            Array.isArray(value)
              ? value
              : typeof value === "string" && value
                ? [value]
                : []
          }
          onChange={(v) => handleChange(v.length ? v : null)}
          placeholder={field.placeholder ?? "Buscar…"}
        />
      ) : (
        <AutoResizeTextarea
          className={`${baseInput} px-3 py-2 min-h-[36px] resize-none overflow-hidden`}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(v) => handleChange(v)}
        />
      )}

      {hint && <p className="text-[11px] text-slate-500 italic mt-1">{hint}</p>}
      {updatedAt && (
        <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
          Actualizado{" "}
          {new Date(updatedAt).toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}

      {pendingEdit && (
        <ConfirmModal
          open
          title="Editar campo validado"
          description="Este campo ya fue validado. Si lo editas, perderá la marca de validado. ¿Continuar?"
          tone="primary"
          confirmLabel="Editar igual"
          onConfirm={async () => {
            onChange(pendingEdit.v);
            onToggleValidated();
            setPendingEdit(null);
          }}
          onCancel={() => setPendingEdit(null)}
        />
      )}
    </div>
  );
}
