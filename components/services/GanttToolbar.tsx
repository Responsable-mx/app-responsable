"use client";

import type { Dispatch, SetStateAction } from "react";

type Zoom = "fit" | "mes" | "quarter" | "semana" | "dia";

export interface GanttToolbarProps {
  // Zoom
  zoom: Zoom;
  setZoom: (z: Zoom) => void;
  timelineWidth: number | null;
  // Capas
  hasBaseline: boolean;
  showBaseline: boolean;
  setShowBaseline: Dispatch<SetStateAction<boolean>>;
  showFloat: boolean;
  setShowFloat: Dispatch<SetStateAction<boolean>>;
  showDeps: boolean;
  setShowDeps: Dispatch<SetStateAction<boolean>>;
  showCriticalPath: boolean;
  setShowCriticalPath: Dispatch<SetStateAction<boolean>>;
  showEvm: boolean;
  setShowEvm: Dispatch<SetStateAction<boolean>>;
  clientView: boolean;
  setClientView: Dispatch<SetStateAction<boolean>>;
  showLayersMenu: boolean;
  setShowLayersMenu: Dispatch<SetStateAction<boolean>>;
  // Rango personalizado
  customMinDate: string;
  setCustomMinDate: (v: string) => void;
  customMaxDate: string;
  setCustomMaxDate: (v: string) => void;
  // Acciones
  todayInRange: boolean;
  onScrollToToday: () => void;
  exporting: boolean;
  onExportPng: () => void;
  onExportCsv: () => void;
  showExportMenu: boolean;
  setShowExportMenu: Dispatch<SetStateAction<boolean>>;
  // Baseline freeze
  isAdmin: boolean;
  hasOnFreezeBaseline: boolean;
  hasBaselineData: boolean;
  confirmFreeze: boolean;
  setConfirmFreeze: (v: boolean) => void;
  freezing: boolean;
  onFreeze: () => void;
}

const ZOOM_OPTIONS: { v: Zoom; label: string }[] = [
  { v: "fit", label: "Completa" },
  { v: "mes", label: "Mes" },
  { v: "quarter", label: "Trim." },
  { v: "semana", label: "Sem." },
  { v: "dia", label: "Día" },
];

function LayerCheckbox({
  active,
  onClick,
  title,
  colorClass,
  checkColorClass,
  borderActiveClass,
  bgActiveClass,
  label,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  colorClass: string;
  checkColorClass: string;
  borderActiveClass: string;
  bgActiveClass: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-slate-50 transition-colors ${
        active ? colorClass : "text-slate-500"
      }`}
      title={title}
    >
      <span
        className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${
          active ? `${bgActiveClass} ${borderActiveClass}` : "border-slate-300"
        }`}
      >
        {active && (
          <svg
            className={`w-2 h-2 ${checkColorClass}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

export function GanttToolbar({
  zoom,
  setZoom,
  timelineWidth,
  hasBaseline,
  showBaseline,
  setShowBaseline,
  showFloat,
  setShowFloat,
  showDeps,
  setShowDeps,
  showCriticalPath,
  setShowCriticalPath,
  showEvm,
  setShowEvm,
  clientView,
  setClientView,
  showLayersMenu,
  setShowLayersMenu,
  customMinDate,
  setCustomMinDate,
  customMaxDate,
  setCustomMaxDate,
  todayInRange,
  onScrollToToday,
  exporting,
  onExportPng,
  onExportCsv,
  showExportMenu,
  setShowExportMenu,
  isAdmin,
  hasOnFreezeBaseline,
  hasBaselineData,
  confirmFreeze,
  setConfirmFreeze,
  freezing,
  onFreeze,
}: GanttToolbarProps) {
  const activeLayerCount = [
    hasBaseline && showBaseline,
    showFloat,
    showDeps,
    showCriticalPath,
    showEvm,
    clientView,
  ].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
      {/* Grupo 1: Zoom */}
      <div className="flex items-center gap-0.5">
        {ZOOM_OPTIONS.map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setZoom(v)}
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${
              zoom === v
                ? "bg-white border border-slate-200 text-slate-900 shadow-sm"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {timelineWidth && (
        <span
          className="text-[9px] text-slate-300 select-none font-mono"
          title="Navegar: ← → (pan) · Shift+← → (salto) · +/− (zoom) · Home/End · Arrastra el timeline con el mouse"
        >
          ← → · drag
        </span>
      )}
      {timelineWidth !== null && timelineWidth > 5000 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded-sm text-[9px] text-amber-700 font-medium select-none">
          <svg
            className="w-2.5 h-2.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.539-1.333-3.308 0L3.732 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Vista Día muy amplia — considera Sem.
        </span>
      )}
      {/* Separador */}
      <div className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden />

      {/* Grupo 2: Capas — dropdown colapsado */}
      <div className="relative">
        <button
          onClick={() => setShowLayersMenu((v) => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-colors ${
            showLayersMenu
              ? "bg-slate-200 text-slate-700"
              : "text-slate-400 hover:text-slate-700"
          }`}
          title="Capas de visualización"
          aria-haspopup="true"
          aria-expanded={showLayersMenu}
        >
          Capas
          {activeLayerCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[8px] font-bold bg-brand-primary text-white rounded-full leading-none tabular-nums">
              {activeLayerCount}
            </span>
          )}
          <svg
            className={`w-2.5 h-2.5 transition-transform ${showLayersMenu ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showLayersMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowLayersMenu(false)} />
            <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-md py-1 w-48">
              {hasBaseline && (
                <LayerCheckbox
                  active={showBaseline}
                  onClick={() => setShowBaseline((v) => !v)}
                  title="Baseline — línea base congelada (naranja punteada)."
                  colorClass="text-orange-700"
                  checkColorClass="text-orange-600"
                  borderActiveClass="border-orange-400"
                  bgActiveClass="bg-orange-100"
                  label="Baseline"
                />
              )}
              <LayerCheckbox
                active={showFloat}
                onClick={() => setShowFloat((v) => !v)}
                title="Holgura — días libres antes de impactar al siguiente paso."
                colorClass="text-slate-700"
                checkColorClass="text-slate-600"
                borderActiveClass="border-slate-400"
                bgActiveClass="bg-slate-200"
                label="Holgura"
              />
              <LayerCheckbox
                active={showDeps}
                onClick={() => setShowDeps((v) => !v)}
                title="Dependencias — flechas de relación entre actividades."
                colorClass="text-slate-700"
                checkColorClass="text-slate-600"
                borderActiveClass="border-slate-400"
                bgActiveClass="bg-slate-200"
                label="Dependencias"
              />
              <LayerCheckbox
                active={showCriticalPath}
                onClick={() => setShowCriticalPath((v) => !v)}
                title="Ruta crítica — secuencia sin holgura que define la duración mínima."
                colorClass="text-amber-700"
                checkColorClass="text-amber-600"
                borderActiveClass="border-amber-400"
                bgActiveClass="bg-amber-100"
                label="Ruta crítica"
              />
              <LayerCheckbox
                active={showEvm}
                onClick={() => setShowEvm((v) => !v)}
                title="EVM — métricas de rendimiento del proyecto."
                colorClass="text-brand-primary-dark"
                checkColorClass="text-brand-primary-dark"
                borderActiveClass="border-brand-primary/40"
                bgActiveClass="bg-brand-primary/10"
                label="EVM"
              />
              <div className="my-1 border-t border-slate-100" />
              <LayerCheckbox
                active={clientView}
                onClick={() => setClientView((v) => !v)}
                title="Vista cliente — solo hitos contractuales."
                colorClass="text-brand-primary-dark"
                checkColorClass="text-brand-primary-dark"
                borderActiveClass="border-brand-primary/40"
                bgActiveClass="bg-brand-primary/10"
                label="Vista cliente"
              />
            </div>
          </>
        )}
      </div>

      {/* Grupo 3: Acciones — ml-auto */}
      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
        {/* Rango personalizado */}
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          <span className="font-bold uppercase tracking-widest hidden sm:inline">Rango</span>
          <input
            type="date"
            value={customMinDate}
            onChange={(e) => setCustomMinDate(e.target.value)}
            title="Inicio del rango visible (vacío = auto)"
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 font-sans text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 w-28"
          />
          <span>—</span>
          <input
            type="date"
            value={customMaxDate}
            onChange={(e) => setCustomMaxDate(e.target.value)}
            title="Fin del rango visible (vacío = auto)"
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 font-sans text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-primary/50 w-28"
          />
          {(customMinDate || customMaxDate) && (
            <button
              onClick={() => {
                setCustomMinDate("");
                setCustomMaxDate("");
              }}
              className="text-[9px] text-rose-500 hover:text-rose-700 font-bold"
              title="Restablecer rango automático"
            >
              ✕
            </button>
          )}
        </div>
        <div className="w-px h-4 bg-slate-200" aria-hidden />

        {/* Hoy */}
        {todayInRange && (
          <button
            onClick={onScrollToToday}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-brand-primary-dark transition-colors"
          >
            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="4" />
            </svg>
            Hoy
          </button>
        )}

        {/* Exportar dropdown (PNG + CSV) */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
            {exporting ? "..." : "Exportar"}
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-md py-1 w-36">
                <button
                  onClick={() => {
                    onExportPng();
                    setShowExportMenu(false);
                  }}
                  disabled={exporting}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  PNG (imagen)
                </button>
                <button
                  onClick={() => {
                    onExportCsv();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  CSV (Excel)
                </button>
              </div>
            </>
          )}
        </div>

        {/* Baseline freeze */}
        {isAdmin && hasOnFreezeBaseline && !confirmFreeze && (
          <>
            <div className="w-px h-4 bg-slate-200" aria-hidden />
            <button
              onClick={() => setConfirmFreeze(true)}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-amber-700 transition-colors"
              title={
                hasBaselineData
                  ? "Ya existe baseline — actualizará el de referencia."
                  : "Congelar fechas plan como baseline de referencia"
              }
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              {hasBaselineData ? "Actualizar baseline" : "Baseline"}
            </button>
          </>
        )}
        {confirmFreeze && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[10px]">
            <span className="text-amber-700 font-medium">
              {hasBaselineData ? "Sobrescribir baseline?" : "Congelar plan actual como baseline?"}
            </span>
            <button
              onClick={onFreeze}
              disabled={freezing}
              className="px-1.5 py-0.5 bg-amber-500 text-white rounded-sm font-bold hover:bg-amber-600 disabled:opacity-50"
            >
              {freezing ? "..." : "Sí"}
            </button>
            <button
              onClick={() => setConfirmFreeze(false)}
              className="px-1.5 py-0.5 text-slate-500 hover:text-slate-700"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
