"use client";

import type { SaveState } from "./wizard-ui-types";

interface Props {
  state: SaveState;
  errorMsg: string | null;
}

export function SaveIndicator({ state, errorMsg }: Props) {
  if (state === "saving")
    return <span className="text-[11px] text-slate-500">Guardando…</span>;
  if (state === "saved")
    return <span className="text-[11px] text-emerald-700">✓ Guardado</span>;
  if (state === "conflict")
    return (
      <span
        className="text-[11px] text-amber-700 font-semibold"
        title={errorMsg ?? ""}
      >
        Conflicto · recargar
      </span>
    );
  if (state === "error")
    return (
      <span className="text-[11px] text-rose-700 max-w-[200px] text-right leading-tight block">
        {errorMsg ?? "Error al guardar"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      Autoguardado activo
    </span>
  );
}
