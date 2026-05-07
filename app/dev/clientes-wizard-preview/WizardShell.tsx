// @ts-nocheck — dev preview, no TS estricto requerido
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import {
  MOCK_CLIENT,
  MOCK_STEPS,
  type MockField,
  type MockStep,
  type SourceType,
} from "./mock-data";

// ── Chip styles ───────────────────────────────────────────────────────────────

const CHIP_STYLES: Record<SourceType, { dot: string; bg: string; text: string; label: string }> = {
  public: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "público" },
  interpretation: { dot: "bg-amber-400", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "interpretación" },
  consultor_only: { dot: "bg-slate-400", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", label: "solo consultor" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type UdnContext = {
  isDistinct: boolean;
  units: string[];
  activeUnit: number;
  onSelectUnit: (i: number) => void;
};

type FieldDiff = { prev: string | null; next: string | null };
type StepAiState = "idle" | "streaming" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVal(field: MockField, overrides: Record<string, string | null>): string | null {
  return field.key in overrides ? overrides[field.key] : field.value;
}

function isValidated(field: MockField, validatedOverrides: Record<string, boolean>): boolean {
  return field.key in validatedOverrides ? validatedOverrides[field.key] : !!field.validated;
}

function getFillableCount(
  step: MockStep,
  overrides: Record<string, string | null>,
  validatedOverrides: Record<string, boolean>
): number {
  return step.fields.filter(
    (f) =>
      (f.sourceType === "public" || f.sourceType === "interpretation") &&
      !isValidated(f, validatedOverrides)
  ).length;
}

function countFilledLocal(step: MockStep, overrides: Record<string, string | null>): number {
  return step.fields.filter((f) => getVal(f, overrides) !== null).length;
}

// ── UdnBanner ─────────────────────────────────────────────────────────────────

function UdnBanner({ isDistinct, units, activeUnit, onSelectUnit }: UdnContext) {
  if (!isDistinct) {
    return (
      <div className="flex items-center gap-2 text-xs text-brand-primary bg-brand-primary-light border border-brand-primary/20 rounded-lg px-3 py-2">
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Aplicando a: <span className="font-semibold">{units[0]}</span></span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-amber-700 mb-2">
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="font-medium">Unidades materialmente distintas</span>
        <span className="text-amber-600">— completar este paso una vez por unidad</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {units.map((u, i) => (
          <button
            key={i}
            onClick={() => onSelectUnit(i)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
              activeUnit === i ? "bg-amber-600 text-white" : "bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── SourcesDrawer ─────────────────────────────────────────────────────────────

type ExtraSource = { url: string; title: string; date: string; srcType: "web" | "onedrive" | "gdrive" | "manual" };

const SRC_TYPE_META: Record<ExtraSource["srcType"], { label: string; color: string; icon: React.ReactNode }> = {
  web: {
    label: "Web",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>,
  },
  onedrive: {
    label: "OneDrive",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M10.5 18H5.5A4.5 4.5 0 015.5 9a4.49 4.49 0 012.29.63A5.5 5.5 0 0118.5 11.5a3.5 3.5 0 01-.5 6.5H10.5z"/></svg>,
  },
  gdrive: {
    label: "Google Drive",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    icon: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5L1.15 15l3.43 6 6.56-11.5L7.71 3.5zm5.65 0h-2.72l7.43 13h2.7l-1.35-2.38L13.36 3.5zm3.72 10.62L14.57 19.5H22l.01-.02-2.28-5.38h-2.65z"/></svg>,
  },
  manual: {
    label: "Manual",
    color: "bg-slate-50 text-slate-600 border-slate-200",
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
};

const ONEDRIVE_MOCK_URL = "https://proactivestrategies-my.sharepoint.com/:f:/g/personal/consultor_responsable_net/documentos";

function SourcesDrawer({
  field,
  extraSources,
  onAddSource,
  onClose,
}: {
  field: MockField | null;
  extraSources: ExtraSource[];
  onAddSource: (key: string, src: ExtraSource) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<ExtraSource["srcType"]>("web");
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!field) return null;
  const chip = CHIP_STYLES[field.sourceType];
  const allSources = [
    ...(field.sources ?? []).map((s) => ({ ...s, srcType: "web" as ExtraSource["srcType"], isOriginal: true })),
    ...extraSources.map((s) => ({ ...s, isOriginal: false })),
  ];

  function handleAdd() {
    if (!addUrl.trim() || !addTitle.trim()) return;
    onAddSource(field!.key, { url: addUrl.trim(), title: addTitle.trim(), date: addDate, srcType: addType });
    setAddUrl("");
    setAddTitle("");
    setAddDate(new Date().toISOString().split("T")[0]);
    setShowAddForm(false);
  }

  function pickOneDrive() {
    setAddType("onedrive");
    setAddUrl(ONEDRIVE_MOCK_URL);
    setAddTitle("Carpeta cliente — OneDrive");
    setShowAddForm(true);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Fuentes — ${field.label}`}
        className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Fuentes del campo</p>
            <p className="text-sm font-semibold text-slate-900 leading-snug">{field.label}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-md" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* tipo de dato */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Tipo de dato</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${chip.bg} ${chip.text}`}>
              {chip.label}
            </span>
            {field.sourceType === "interpretation" && (
              <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                Basado en información pública disponible — sujeto a validación del asesor.
              </p>
            )}
          </div>

          {/* lista de fuentes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">
                {allSources.length} fuente{allSources.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={pickOneDrive}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M10.5 18H5.5A4.5 4.5 0 015.5 9a4.49 4.49 0 012.29.63A5.5 5.5 0 0118.5 11.5a3.5 3.5 0 01-.5 6.5H10.5z"/></svg>
                  OneDrive
                </button>
                <button
                  onClick={() => setShowAddForm((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border border-stone-200 bg-white text-slate-600 hover:bg-stone-50 transition-colors"
                >
                  {showAddForm ? "Cancelar" : "+ Agregar"}
                </button>
              </div>
            </div>

            {allSources.length > 0 ? (
              <ul className="space-y-2">
                {allSources.map((src, i) => {
                  const isOld = new Date(src.date) < new Date("2024-05-04");
                  const typeMeta = SRC_TYPE_META[src.srcType ?? "web"];
                  return (
                    <li key={i} className={`border rounded-lg px-3 py-2.5 ${src.isOriginal ? "bg-stone-50 border-stone-200" : "bg-blue-50/40 border-blue-100"}`}>
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="text-xs font-medium text-slate-800 leading-snug">{src.title}</p>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${typeMeta.color}`}>
                          {typeMeta.icon}
                          {typeMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-1.5">Fecha: {src.date}</p>
                      {isOld && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1.5 flex items-center gap-1">
                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Fuente con más de 2 años — verificar vigencia
                        </p>
                      )}
                      <a href={src.url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-brand-primary hover:underline break-all">
                        {src.url}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 italic">Sin fuentes registradas.</p>
            )}
          </div>

          {/* formulario agregar fuente */}
          {showAddForm && (
            <div className="border border-stone-200 rounded-xl bg-stone-50 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700">Agregar fuente</p>

              {/* tipo */}
              <div>
                <p className="text-[11px] text-slate-500 mb-1.5">Tipo</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(["web", "onedrive", "gdrive", "manual"] as ExtraSource["srcType"][]).map((t) => {
                    const m = SRC_TYPE_META[t];
                    return (
                      <button
                        key={t}
                        onClick={() => {
                          setAddType(t);
                          if (t === "onedrive") setAddUrl(ONEDRIVE_MOCK_URL);
                          else if (addUrl === ONEDRIVE_MOCK_URL) setAddUrl("");
                        }}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
                          addType === t ? m.color + " ring-1 ring-current" : "bg-white border-stone-200 text-slate-500 hover:bg-stone-100"
                        }`}
                      >
                        {m.icon} {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* url */}
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">URL o ruta</label>
                <input
                  type="url"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-xs border border-stone-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                />
              </div>

              {/* título */}
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Título / descripción</label>
                <input
                  type="text"
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="Ej. Reporte anual 2023"
                  className="w-full text-xs border border-stone-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                />
              </div>

              {/* fecha */}
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Fecha del documento</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="text-xs border border-stone-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                />
              </div>

              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={handleAdd}
                disabled={!addUrl.trim() || !addTitle.trim()}
              >
                Agregar fuente
              </Button>
            </div>
          )}

          {/* estado */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Estado</p>
            {field.validated ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Validado por asesor
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-1">
                Pendiente de validación
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-stone-200">
          <Button variant="secondary" size="sm" className="w-full" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </>
  );
}

// ── NotesDrawer ───────────────────────────────────────────────────────────────

function NotesDrawer({
  field, note, onSave, onClose,
}: {
  field: MockField | null;
  note: string;
  onSave: (key: string, note: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(note);
  useEffect(() => { setDraft(note); }, [note]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!field) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`Notas — ${field.label}`}
        className="fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-stone-200">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Nota del asesor</p>
            <p className="text-sm font-semibold text-slate-900 leading-snug">{field.label}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="text-xs text-slate-500 mb-3">
            Comentario interno — no se envía a la IA. Visible en vista de auditoría.
          </p>
          <textarea
            className="w-full h-48 text-sm border border-stone-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            placeholder="Observación del asesor sobre este campo…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        </div>
        <div className="px-5 py-3 border-t border-stone-200 flex gap-2">
          <Button variant="primary" size="sm" className="flex-1"
            onClick={() => { onSave(field.key, draft); onClose(); }}>
            Guardar nota
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </>
  );
}

// ── AuroraPreviewModal ────────────────────────────────────────────────────────

function buildAuroraContext(
  overrides: Record<string, string | null>,
  validatedOverrides: Record<string, boolean>
): string {
  const lines: string[] = [
    "## Contexto del cliente — Distribuidora Altamira S.A. de C.V.",
    "",
    "> Generado automáticamente desde el cuestionario de contexto de negocio.",
    "> Aurora usará este bloque como system prompt base.",
    "",
  ];
  for (const step of MOCK_STEPS) {
    const filledFields = step.fields.filter((f) => getVal(f, overrides) !== null);
    if (filledFields.length === 0) continue;
    lines.push(`### ${step.title}`);
    for (const f of filledFields) {
      const val = getVal(f, overrides);
      const validated = isValidated(f, validatedOverrides);
      const prefix = validated ? "✓" : f.sourceType === "interpretation" ? "~" : "●";
      lines.push(`${prefix} **${f.label}:** ${val}`);
      if (f.sourceType === "interpretation" && !validated) {
        lines.push(`  _(Basado en información pública — sujeto a validación del asesor)_`);
      }
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(
    "**INSTRUCCIÓN DURA:** NUNCA uses códigos internos del catálogo en tu respuesta al consultor."
  );
  return lines.join("\n");
}

function AuroraPreviewModal({
  onClose,
  overrides,
  validatedOverrides,
}: {
  onClose: () => void;
  overrides: Record<string, string | null>;
  validatedOverrides: Record<string, boolean>;
}) {
  const context = buildAuroraContext(overrides, validatedOverrides);
  const tokenEstimate = Math.round(context.length / 4);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true"
        className="fixed inset-4 md:inset-8 bg-white rounded-2xl shadow-2xl z-50 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Vista previa</p>
            <p className="text-sm font-bold text-slate-900">Contexto para Aurora</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">
              {context.length.toLocaleString()} chars · ~{tokenEstimate.toLocaleString()} tokens
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md" aria-label="Cerrar">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">{context}</pre>
        </div>
        <div className="px-6 py-3 border-t border-stone-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">
            Este bloque se enviará como system prompt a Aurora al iniciar el chat.
          </p>
          <Button variant="secondary" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </>
  );
}

// ── AuditTable ────────────────────────────────────────────────────────────────

function AuditTable({
  overrides,
  validatedOverrides,
  notes,
  hasDoubleMaterialidad,
  onGoToField,
}: {
  overrides: Record<string, string | null>;
  validatedOverrides: Record<string, boolean>;
  notes: Record<string, string>;
  hasDoubleMaterialidad: boolean;
  onGoToField: (stepNum: number) => void;
}) {
  const activeSteps = MOCK_STEPS.filter((s) => !s.onlyDoubleMaterialidad || hasDoubleMaterialidad);
  const allFields = activeSteps.flatMap((s) =>
    s.fields.map((f) => ({ ...f, stepTitle: s.title, stepNum: s.step }))
  );
  const [filter, setFilter] = useState<"all" | "pending" | "validated" | "empty">("all");

  const filtered = allFields.filter((f) => {
    const val = getVal(f, overrides);
    const validated = isValidated(f, validatedOverrides);
    if (filter === "empty") return val === null;
    if (filter === "pending") return val !== null && !validated;
    if (filter === "validated") return validated;
    return true;
  });

  const counts = {
    all: allFields.length,
    pending: allFields.filter((f) => getVal(f, overrides) !== null && !isValidated(f, validatedOverrides)).length,
    validated: allFields.filter((f) => isValidated(f, validatedOverrides)).length,
    empty: allFields.filter((f) => getVal(f, overrides) === null).length,
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">
          Vista de auditoría — {allFields.length} campos
        </h2>
        <div className="flex gap-1.5">
          {(["all", "pending", "validated", "empty"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filter === f ? "bg-brand-primary text-white" : "bg-stone-100 text-slate-600 hover:bg-stone-200"
              }`}
            >
              {{ all: "Todos", pending: "Pendiente", validated: "Validado", empty: "Vacíos" }[f]}
              <span className="ml-1 opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="min-w-full w-max text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Paso</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Campo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Tipo</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap w-72">Valor (resumen)</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Estado</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">Nota</th>
              <th className="px-3 py-2.5 w-6" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((f, i) => {
              const val = getVal(f, overrides);
              const validated = isValidated(f, validatedOverrides);
              const chip = CHIP_STYLES[f.sourceType];
              return (
                <tr
                  key={f.key}
                  onClick={() => onGoToField(f.stepNum)}
                  className={`border-b border-stone-100 cursor-pointer ${i % 2 === 0 ? "bg-white" : "bg-stone-50/50"} hover:bg-brand-primary-light/60 transition-colors group`}
                >
                  <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{f.stepTitle}</td>
                  <td className="px-4 py-2 text-xs font-medium text-slate-800 whitespace-nowrap">{f.label}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${chip.bg} ${chip.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
                      {chip.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600 max-w-xs">
                    {val ? (
                      <span className="line-clamp-2">{val}</span>
                    ) : (
                      <span className="text-slate-400 italic">Vacío</span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {validated ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Validado
                      </span>
                    ) : val ? (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        Pendiente
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-stone-100 rounded-full px-2 py-0.5">
                        Vacío
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 max-w-[120px]">
                    {notes[f.key] ? (
                      <span className="text-[10px] text-brand-primary bg-brand-primary-light rounded-full px-2 py-0.5 truncate block">
                        {notes[f.key]}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 w-6">
                    <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  currentValue,
  isEditing,
  editDraft,
  streamingValue,
  diff,
  hasNote,
  validated,
  onEdit,
  onSaveDraft,
  onCancelEdit,
  onChangeDraft,
  onOpenSources,
  onOpenNotes,
}: {
  field: MockField;
  currentValue: string | null;
  isEditing: boolean;
  editDraft: string;
  streamingValue: string | null;
  diff: FieldDiff | null;
  hasNote: boolean;
  validated: boolean;
  onEdit: () => void;
  onSaveDraft: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (v: string) => void;
  onOpenSources: () => void;
  onOpenNotes: () => void;
}) {
  const chip = CHIP_STYLES[field.sourceType];
  const displayValue = streamingValue ?? currentValue;
  const isEmpty = displayValue === null;
  const isStreaming = streamingValue !== null;

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${chip.bg} ${diff ? "ring-2 ring-brand-primary/30" : ""}`}>
      {diff && (
        <div className="flex items-center gap-1.5 text-[11px] text-brand-primary bg-brand-primary-light border border-brand-primary/20 rounded-lg px-2.5 py-1 mb-2">
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualizado por IA — revisa y valida
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${chip.bg} ${chip.text} border-current/20`}>
            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot} inline-block`} />
            {chip.label}
          </span>
          <span className="text-sm font-medium text-slate-800">{field.label}</span>
          {field.stale && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Fuente +2 años
            </span>
          )}
          {validated && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Validado
            </span>
          )}
          {isStreaming && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary bg-brand-primary-light rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse inline-block" />
              Escribiendo…
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenNotes}
            className={`inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1.5 transition-colors ${
              hasNote
                ? "text-brand-primary bg-brand-primary-light border border-brand-primary/20"
                : "text-slate-400 hover:text-slate-600 bg-white/70 hover:bg-white border border-stone-200"
            }`}
            title="Nota del asesor"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {field.sourceType !== "consultor_only" && (
            <button
              onClick={onOpenSources}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary bg-white/70 hover:bg-white border border-brand-primary/20 hover:border-brand-primary/40 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Fuentes {field.sources?.length ? `(${field.sources.length})` : ""}
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        field.type === "multiselect" ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {(field.options ?? []).map((opt) => {
                const selected = editDraft.split(",").map((s) => s.trim()).filter(Boolean).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const current = editDraft ? editDraft.split(",").map((s) => s.trim()).filter(Boolean) : [];
                      const next = selected ? current.filter((s) => s !== opt) : [...current, opt];
                      onChangeDraft(next.join(", "));
                    }}
                    className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      selected
                        ? "bg-brand-primary text-white border-brand-primary"
                        : "bg-white text-slate-600 border-stone-200 hover:border-brand-primary/40 hover:text-brand-primary-dark"
                    }`}
                  >
                    {selected && (
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {opt}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={onSaveDraft} disabled={!editDraft.trim()}>Guardar</Button>
              <Button variant="secondary" size="sm" onClick={onCancelEdit}>Cancelar</Button>
              <span className="text-xs text-slate-400 ml-1">Selección múltiple</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              className="w-full text-sm border border-brand-primary/40 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 bg-white min-h-[80px]"
              value={editDraft}
              onChange={(e) => onChangeDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit();
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSaveDraft();
              }}
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={onSaveDraft}>Guardar ⌘↵</Button>
              <Button variant="secondary" size="sm" onClick={onCancelEdit}>Cancelar</Button>
              <span className="text-xs text-slate-400 ml-1">Se marcará como validado</span>
            </div>
          </div>
        )
      ) : isEmpty ? (
        <div>
          <p className="text-sm text-slate-600 italic">Pendiente — requiere input del asesor / cliente</p>
          {field.hint && <p className="text-xs text-slate-600 mt-1">{field.hint}</p>}
        </div>
      ) : field.type === "multiselect" ? (
        <div className="group cursor-pointer" onClick={onEdit} title="Clic para editar">
          <div className="flex flex-wrap gap-1.5">
            {(displayValue ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full bg-white border border-brand-primary/20 text-brand-primary-dark font-medium"
              >
                <svg className="w-3 h-3 shrink-0 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {v}
              </span>
            ))}
          </div>
          {!isStreaming && (
            <p className="text-[11px] text-slate-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              Clic para editar · selección múltiple
            </p>
          )}
        </div>
      ) : (
        <div className="group cursor-text" onClick={onEdit} title="Clic para editar">
          <p className={`text-sm text-slate-800 whitespace-pre-line leading-relaxed ${isStreaming ? "opacity-80" : ""}`}>
            {displayValue}
            {isStreaming && <span className="inline-block w-0.5 h-3.5 bg-brand-primary ml-0.5 animate-pulse" />}
          </p>
          {field.sourceType === "interpretation" && !validated && (
            <p className="text-xs text-amber-600 italic mt-1.5">
              Basado en información pública — sujeto a validación del asesor.
            </p>
          )}
          {!isStreaming && (
            <p className="text-[11px] text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Clic para editar · ⌘↵ para guardar
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── StepView ──────────────────────────────────────────────────────────────────

function StepView({
  step,
  overrides,
  validatedOverrides,
  notes,
  editingKey,
  editDraft,
  streamingValues,
  diffs,
  udnContext,
  aiState,
  onEdit,
  onSaveDraft,
  onCancelEdit,
  onChangeDraft,
  onOpenSources,
  onOpenNotes,
  onAiFill,
}: {
  step: MockStep;
  overrides: Record<string, string | null>;
  validatedOverrides: Record<string, boolean>;
  notes: Record<string, string>;
  editingKey: string | null;
  editDraft: string;
  streamingValues: Record<string, string>;
  diffs: Record<string, FieldDiff>;
  udnContext?: UdnContext;
  aiState: StepAiState;
  onEdit: (field: MockField) => void;
  onSaveDraft: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (v: string) => void;
  onOpenSources: (f: MockField) => void;
  onOpenNotes: (f: MockField) => void;
  onAiFill: () => void;
}) {
  const filled = step.fields.filter(
    (f) => (streamingValues[f.key] !== undefined ? streamingValues[f.key] : getVal(f, overrides)) !== null
  ).length;
  const total = step.fields.length;
  const pct = Math.round((filled / total) * 100);
  const fillableCount = getFillableCount(step, overrides, validatedOverrides);
  const skippedCount = step.fields.filter(
    (f) => (f.sourceType === "public" || f.sourceType === "interpretation") && isValidated(f, validatedOverrides)
  ).length;
  const diffCount = Object.keys(diffs).filter((k) => step.fields.some((f) => f.key === k)).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-brand-primary bg-brand-primary-light px-2 py-0.5 rounded-full">
              Paso {step.step} de 9
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{step.subtitle}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-brand-primary-dark">{pct}%</p>
          <p className="text-xs text-slate-500">{filled}/{total} campos</p>
        </div>
      </div>

      <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div className="h-full bg-brand-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {udnContext && step.step >= 6 && <UdnBanner {...udnContext} />}

      {diffCount > 0 && aiState === "done" && (
        <div className="flex items-center gap-2 text-xs text-brand-primary bg-brand-primary-light border border-brand-primary/20 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          IA actualizó <strong className="mx-1">{diffCount} campo{diffCount > 1 ? "s" : ""}</strong> en 1 llamada. Revisa y valida.
          {skippedCount > 0 && <span className="text-slate-500 ml-1">· {skippedCount} ya validados omitidos.</span>}
        </div>
      )}

      {step.aiCanFill && (() => {
        const aiFilledCount = step.fields.filter(
          (f) => (f.sourceType === "public" || f.sourceType === "interpretation") && getVal(f, overrides) !== null
        ).length;
        const staleCount = step.fields.filter(
          (f) => (f.sourceType === "public" || f.sourceType === "interpretation") && f.stale && !isValidated(f, validatedOverrides)
        ).length;
        const needsReextract = fillableCount > 0 || staleCount > 0;

        if (aiState === "streaming") {
          return (
            <div className="flex items-center gap-3 p-4 bg-white border border-stone-200 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">Extrayendo datos públicos…</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Procesando fuentes web · 1 llamada para todo el paso
                </p>
              </div>
              <Button variant="primary" size="sm" loading onClick={() => {}}>Extrayendo…</Button>
            </div>
          );
        }

        if (aiState === "done") {
          return (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Re-extracción completada</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {diffCount} campo{diffCount !== 1 ? "s" : ""} actualizados.
                  {skippedCount > 0 ? ` ${skippedCount} ya validados no se tocaron.` : ""}
                  {" "}Revisa y valida cada uno.
                </p>
              </div>
            </div>
          );
        }

        // Default: AI already filled at client creation — status card
        return (
          <div className="flex items-start gap-3 p-4 bg-white border border-stone-200 rounded-xl">
            <svg className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">
                IA completó este paso al crear el cliente
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {aiFilledCount} campo{aiFilledCount !== 1 ? "s" : ""} con fuentes públicas
                {skippedCount > 0 ? ` · ${skippedCount} validados por el asesor` : ""}
                {staleCount > 0 ? ` · ${staleCount} fuente${staleCount !== 1 ? "s" : ""} desactualizada${staleCount !== 1 ? "s" : ""}` : ""}
                {". Revisa, ajusta y complementa lo no público."}
              </p>
            </div>
            {needsReextract && (
              <button
                onClick={onAiFill}
                className="shrink-0 text-xs font-medium text-slate-500 hover:text-brand-primary border border-stone-200 hover:border-brand-primary/30 bg-white rounded-md px-2.5 py-1.5 transition-colors"
              >
                Re-extraer
              </button>
            )}
          </div>
        );
      })()}

      <div className="space-y-3">
        {step.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            currentValue={getVal(field, overrides)}
            isEditing={editingKey === field.key}
            editDraft={editDraft}
            streamingValue={streamingValues[field.key] ?? null}
            diff={diffs[field.key] ?? null}
            hasNote={!!notes[field.key]}
            validated={isValidated(field, validatedOverrides)}
            onEdit={() => onEdit(field)}
            onSaveDraft={onSaveDraft}
            onCancelEdit={onCancelEdit}
            onChangeDraft={onChangeDraft}
            onOpenSources={() => onOpenSources(field)}
            onOpenNotes={() => onOpenNotes(field)}
          />
        ))}
      </div>
    </div>
  );
}

// ── LockedStep ────────────────────────────────────────────────────────────────

function LockedStep({ step }: { step: MockStep }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-5 py-4 flex items-center gap-4 opacity-60">
      <div className="text-slate-400">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-600">{step.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">Solo aplica para Doble Materialidad</p>
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MOCK_DISTINCT_UNITS = ["Distribución refrigerada", "Cross-docking e-commerce"];

// ── WizardShell ───────────────────────────────────────────────────────────────

export function WizardShell() {
  const [currentStep, setCurrentStep] = useState(1);
  const [hasDoubleMaterialidad, setHasDoubleMaterialidad] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);

  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string | null>>({});
  const [validatedOverrides, setValidatedOverrides] = useState<Record<string, boolean>>({});

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [sourcesField, setSourcesField] = useState<MockField | null>(null);
  const [notesField, setNotesField] = useState<MockField | null>(null);
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>({});

  const [simulateDistinctUnits, setSimulateDistinctUnits] = useState(false);
  const [activeUnit, setActiveUnit] = useState(0);

  const [showAuditTable, setShowAuditTable] = useState(false);
  const [showAuroraPreview, setShowAuroraPreview] = useState(false);

  const [stepAiState, setStepAiState] = useState<Record<number, StepAiState>>({});
  const [streamingValues, setStreamingValues] = useState<Record<string, string>>({});
  const [stepDiffs, setStepDiffs] = useState<Record<number, Record<string, FieldDiff>>>({});

  const [extraSources, setExtraSources] = useState<Record<string, ExtraSource[]>>({});

  function handleAddSource(key: string, src: ExtraSource) {
    setExtraSources((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), src] }));
  }

  function goToField(stepNum: number) {
    setShowAuditTable(false);
    setCurrentStep(stepNum);
    setTimeout(() => mainRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 80);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeStep = MOCK_STEPS.find((s) => s.step === currentStep)!;
  const isStepLocked = activeStep.onlyDoubleMaterialidad && !hasDoubleMaterialidad;

  const activeSteps = MOCK_STEPS.filter((s) => !s.onlyDoubleMaterialidad || hasDoubleMaterialidad);
  const globalFilled = activeSteps.reduce((n, s) => n + countFilledLocal(s, fieldOverrides), 0);
  const globalTotal = activeSteps.reduce((n, s) => n + s.fields.length, 0);
  const globalPct = globalTotal > 0 ? Math.round((globalFilled / globalTotal) * 100) : 0;

  const rawUnidadesDistintas =
    MOCK_STEPS.find((s) => s.step === 5)?.fields.find((f) => f.key === "unidades_distintas")?.value ?? "";
  const isDistinctUnits =
    simulateDistinctUnits ||
    (rawUnidadesDistintas !== "" && !rawUnidadesDistintas.toLowerCase().startsWith("no"));
  const udnContext: UdnContext | undefined = hasDoubleMaterialidad
    ? {
        isDistinct: isDistinctUnits,
        units: isDistinctUnits ? MOCK_DISTINCT_UNITS : ["operación completa (unidad única)"],
        activeUnit,
        onSelectUnit: setActiveUnit,
      }
    : undefined;

  // ── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editingKey) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" && currentStep < MOCK_STEPS.length) goToStep(currentStep + 1);
      if (e.key === "ArrowLeft" && currentStep > 1) goToStep(currentStep - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [currentStep, editingKey]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function goToStep(n: number) {
    setCurrentStep(n);
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(field: MockField) {
    setEditingKey(field.key);
    setEditDraft(getVal(field, fieldOverrides) ?? "");
  }

  function handleSaveDraft() {
    if (!editingKey) return;
    setFieldOverrides((prev) => ({ ...prev, [editingKey]: editDraft || null }));
    setValidatedOverrides((prev) => ({ ...prev, [editingKey]: editDraft.trim().length > 0 }));
    setEditingKey(null);
    setEditDraft("");
  }

  function handleCancelEdit() {
    setEditingKey(null);
    setEditDraft("");
  }

  function handleSaveNote(key: string, note: string) {
    setFieldNotes((prev) => ({ ...prev, [key]: note }));
  }

  function handleAiFill() {
    const stepNum = currentStep;
    const step = MOCK_STEPS.find((s) => s.step === stepNum)!;
    const fillable = step.fields.filter(
      (f) =>
        (f.sourceType === "public" || f.sourceType === "interpretation") &&
        !isValidated(f, validatedOverrides)
    );
    if (fillable.length === 0) return;

    setStepAiState((prev) => ({ ...prev, [stepNum]: "streaming" }));

    const preSnapshot: Record<string, string | null> = {};
    fillable.forEach((f) => { preSnapshot[f.key] = getVal(f, fieldOverrides); });

    let fieldIdx = 0;

    function streamNext() {
      if (fieldIdx >= fillable.length) {
        const newOverrides: Record<string, string | null> = {};
        const diffs: Record<string, FieldDiff> = {};
        fillable.forEach((f) => {
          newOverrides[f.key] = f.value;
          if (preSnapshot[f.key] !== f.value) {
            diffs[f.key] = { prev: preSnapshot[f.key], next: f.value };
          }
        });
        setFieldOverrides((prev) => ({ ...prev, ...newOverrides }));
        setStreamingValues({});
        setStepDiffs((prev) => ({ ...prev, [stepNum]: diffs }));
        setStepAiState((prev) => ({ ...prev, [stepNum]: "done" }));
        return;
      }

      const field = fillable[fieldIdx];
      const target = field.value ?? "";
      let charIdx = 0;
      const tickSize = Math.max(1, Math.ceil(target.length / 18));

      const interval = setInterval(() => {
        charIdx += tickSize;
        if (charIdx >= target.length) {
          clearInterval(interval);
          setStreamingValues((prev) => {
            const next = { ...prev };
            delete next[field.key];
            return next;
          });
          fieldIdx++;
          setTimeout(streamNext, 60);
        } else {
          setStreamingValues((prev) => ({ ...prev, [field.key]: target.slice(0, charIdx) }));
        }
      }, 35);
    }

    streamNext();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-brand-primary rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">R</span>
          </div>
          <div>
            <p className="text-[11px] text-slate-500 leading-none">Cliente</p>
            <p className="text-sm font-semibold text-slate-900 leading-snug">{MOCK_CLIENT.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-2.5">
            <div className="w-32 h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full transition-all duration-500"
                style={{ width: `${globalPct}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-brand-primary-dark whitespace-nowrap">
              {globalPct}% completo
            </span>
            <span className="text-xs text-slate-500">{globalFilled}/{globalTotal} campos</span>
          </div>

          <button
            onClick={() => setShowAuditTable((v) => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showAuditTable
                ? "bg-brand-primary text-white border-brand-primary"
                : "bg-white text-slate-600 border-stone-200 hover:bg-stone-50"
            }`}
          >
            Auditoría
          </button>

          <button
            onClick={() => setShowAuroraPreview(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-slate-600 hover:bg-stone-50 transition-colors"
          >
            Preview Aurora
          </button>

          <div className="flex items-center gap-2.5 pl-3 border-l border-stone-200">
            <span className="text-xs text-slate-600 whitespace-nowrap">Servicio: Doble Materialidad</span>
            <button
              role="switch"
              aria-checked={hasDoubleMaterialidad}
              onClick={() => setHasDoubleMaterialidad((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                hasDoubleMaterialidad ? "bg-brand-primary" : "bg-stone-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  hasDoubleMaterialidad ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-stone-200">
            <span className="text-xs text-slate-500 whitespace-nowrap">UDN distintas (sim)</span>
            <button
              role="switch"
              aria-checked={simulateDistinctUnits}
              onClick={() => setSimulateDistinctUnits((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                simulateDistinctUnits ? "bg-amber-400" : "bg-stone-300"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  simulateDistinctUnits ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <span className="text-[10px] text-slate-400 bg-stone-100 rounded px-2 py-1">
            dev preview — sin backend
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!showAuditTable && (
          <nav
            aria-label="Pasos del cuestionario"
            className="w-64 shrink-0 bg-white border-r border-stone-200 overflow-y-auto py-4"
          >
            <p className="px-4 text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Cuestionario
            </p>
            {MOCK_STEPS.map((step) => {
              const locked = step.onlyDoubleMaterialidad && !hasDoubleMaterialidad;
              const filled = countFilledLocal(step, fieldOverrides);
              const total = step.fields.length;
              const pct = Math.round((filled / total) * 100);
              const isActive = currentStep === step.step;

              return (
                <button
                  key={step.step}
                  onClick={() => goToStep(step.step)}
                  disabled={locked}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors rounded-none ${
                    isActive
                      ? "bg-brand-primary-light text-brand-primary-dark"
                      : locked
                      ? "opacity-40 cursor-not-allowed text-slate-500"
                      : "hover:bg-stone-50 text-slate-700"
                  }`}
                >
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      isActive
                        ? "bg-brand-primary text-white"
                        : pct === 100
                        ? "bg-emerald-500 text-white"
                        : locked
                        ? "bg-stone-200 text-stone-400"
                        : "bg-stone-200 text-slate-600"
                    }`}
                  >
                    {pct === 100 && !isActive ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : locked ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    ) : (
                      step.step
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate leading-snug">{step.title}</p>
                    {!locked && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{filled}/{total}</span>
                      </div>
                    )}
                    {locked && <p className="text-[10px] text-slate-400 mt-0.5">Doble Materialidad</p>}
                  </div>
                </button>
              );
            })}

            <div className="mx-4 mt-4 pt-4 border-t border-stone-200">
              <div className="bg-stone-50 rounded-xl p-3 space-y-1.5">
                {(["public", "interpretation", "consultor_only"] as SourceType[]).map((t) => {
                  const chip = CHIP_STYLES[t];
                  const fields = activeSteps.flatMap((s) => s.fields).filter((f) => f.sourceType === t);
                  const filledCount = fields.filter((f) => getVal(f, fieldOverrides) !== null).length;
                  return (
                    <div key={t} className="flex items-center justify-between">
                      <span className={`text-[10px] font-medium ${chip.text}`}>{chip.label}</span>
                      <span className="text-[10px] text-slate-500">{filledCount}/{fields.length}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        <main id="main-content" ref={mainRef} className="flex-1 overflow-y-auto px-8 py-6">
          {showAuditTable ? (
            <AuditTable
              overrides={fieldOverrides}
              validatedOverrides={validatedOverrides}
              notes={fieldNotes}
              hasDoubleMaterialidad={hasDoubleMaterialidad}
              onGoToField={goToField}
            />
          ) : (
            <div className="max-w-2xl mx-auto">
              {isStepLocked ? (
                <div className="space-y-4">
                  <LockedStep step={activeStep} />
                  <div className="bg-white border border-stone-200 rounded-xl p-6 text-center">
                    <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 mb-1">
                      Paso disponible con Doble Materialidad
                    </p>
                    <p className="text-xs text-slate-500 mb-4">
                      Activa el toggle en la barra superior para ver este paso.
                    </p>
                    <Button variant="primary" size="sm" onClick={() => setHasDoubleMaterialidad(true)}>
                      Activar Doble Materialidad
                    </Button>
                  </div>
                </div>
              ) : (
                <StepView
                  step={activeStep}
                  overrides={fieldOverrides}
                  validatedOverrides={validatedOverrides}
                  notes={fieldNotes}
                  editingKey={editingKey}
                  editDraft={editDraft}
                  streamingValues={streamingValues}
                  diffs={stepDiffs[currentStep] ?? {}}
                  udnContext={udnContext}
                  aiState={stepAiState[currentStep] ?? "idle"}
                  onEdit={handleEdit}
                  onSaveDraft={handleSaveDraft}
                  onCancelEdit={handleCancelEdit}
                  onChangeDraft={setEditDraft}
                  onOpenSources={setSourcesField}
                  onOpenNotes={setNotesField}
                  onAiFill={handleAiFill}
                />
              )}

              <div className="sticky bottom-0 bg-stone-50 flex items-center justify-between mt-8 pt-4 pb-4 border-t border-stone-200">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentStep === 1}
                  onClick={() => goToStep(currentStep - 1)}
                >
                  ← Paso anterior
                </Button>
                <span className="text-xs text-slate-400">
                  {currentStep} / {MOCK_STEPS.length} · ← → para navegar
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={currentStep === MOCK_STEPS.length}
                  onClick={() => goToStep(currentStep + 1)}
                >
                  Siguiente paso →
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>

      <SourcesDrawer
        field={sourcesField}
        extraSources={sourcesField ? (extraSources[sourcesField.key] ?? []) : []}
        onAddSource={handleAddSource}
        onClose={() => setSourcesField(null)}
      />
      <NotesDrawer
        field={notesField}
        note={notesField ? (fieldNotes[notesField.key] ?? "") : ""}
        onSave={handleSaveNote}
        onClose={() => setNotesField(null)}
      />
      {showAuroraPreview && (
        <AuroraPreviewModal
          onClose={() => setShowAuroraPreview(false)}
          overrides={fieldOverrides}
          validatedOverrides={validatedOverrides}
        />
      )}
    </div>
  );
}
