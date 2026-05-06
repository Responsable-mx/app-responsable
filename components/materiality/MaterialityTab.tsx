"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  COLOR_META,
  deriveColor,
  type MaterialityTopic,
  type TopicColor,
  type TopicSize,
} from "@/lib/materiality/types";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: MaterialityTopic[] }>;
  });

const COLOR_DOT: Record<TopicColor, string> = {
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  teal: "bg-brand-primary",
  slate: "bg-slate-400",
};

const COLOR_BG: Record<TopicColor, string> = {
  rose: "bg-rose-50",
  amber: "bg-amber-50",
  teal: "bg-brand-primary-light",
  slate: "bg-slate-100",
};

const COLOR_TEXT: Record<TopicColor, string> = {
  rose: "text-rose-700",
  amber: "text-amber-700",
  teal: "text-brand-primary-dark",
  slate: "text-slate-600",
};

const COLOR_SHAPE: Record<TopicColor, string> = {
  rose: "rounded-full",
  amber: "rotate-45 rounded-sm",
  teal: "rounded-sm",
  slate: "rounded-full",
};

const SIZE_PX: Record<TopicSize, number> = { sm: 11, md: 15, lg: 20 };

export function MaterialityTab({ clientId }: { clientId: string }) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/clients/${clientId}/materiality`,
    fetcher
  );
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterQuadrant, setFilterQuadrant] = useState<TopicColor | null>(null);
  const [editingTopic, setEditingTopic] = useState<MaterialityTopic | null>(null);
  const [confirmInit, setConfirmInit] = useState(false);
  const [busyInit, setBusyInit] = useState(false);

  const topics = useMemo(() => data?.data ?? [], [data]);
  const selected = topics.find((t) => t.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const dm = topics.filter((t) => t.color === "rose").length;
    const fin = topics.filter((t) => t.color === "teal").length;
    const imp = topics.filter((t) => t.color === "amber").length;
    const seg = topics.filter((t) => t.color === "slate").length;
    const validated = topics.filter((t) => t.validated === true).length;
    const top = topics
      .filter((t) => t.color === "rose")
      .sort((a, b) => SIZE_PX[b.size] - SIZE_PX[a.size])[0];
    return { dm, fin, imp, seg, validated, total: topics.length, top: top?.label ?? "—" };
  }, [topics]);

  const [busyBulk, setBusyBulk] = useState(false);
  const [confirmUnvalidate, setConfirmUnvalidate] = useState(false);

  // Bulk toggle validated. Antes el badge "Todas validadas" se mostraba
  // automáticamente sin que el consultor confirmara; ahora exige aprobación
  // explícita uno por uno o vía este botón.
  async function bulkSetValidated(value: boolean) {
    if (busyBulk) return;
    setBusyBulk(true);
    try {
      const targets = value
        ? topics.filter((t) => !t.validated)
        : topics.filter((t) => t.validated);
      // PATCH paralelo. Cada falla individual no rompe a las demás.
      const results = await Promise.allSettled(
        targets.map((t) =>
          fetch(`/api/materiality-topics/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            // D-12: incluir clientId para ownership check en el server.
            body: JSON.stringify({ validated: value, clientId }),
          }).then(async (r) => {
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j.error ?? `HTTP ${r.status}`);
            }
            return r.json();
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await mutate();
      if (failed === 0) {
        toast.push("success", value ? `${targets.length} temas validados` : `${targets.length} validaciones removidas`);
      } else {
        toast.push("warning", `${targets.length - failed} OK · ${failed} fallaron`);
      }
    } finally {
      setBusyBulk(false);
    }
  }

  async function initFromTemplate() {
    setBusyInit(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/materiality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      await mutate();
      setConfirmInit(false);
      toast.push("success", "Plantilla cargada (20 temas)");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al inicializar");
    } finally {
      setBusyInit(false);
    }
  }

  async function patchTopic(id: string, patch: Partial<MaterialityTopic>) {
    try {
      const res = await fetch(`/api/materiality-topics/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // D-12: siempre incluir clientId para ownership check.
        body: JSON.stringify({ ...patch, clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      await mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al actualizar");
    }
  }

  async function deleteTopic(id: string) {
    try {
      // D-12: clientId como query param — el server verifica ownership antes de borrar.
      const res = await fetch(`/api/materiality-topics/${id}?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Error");
      }
      await mutate();
      setEditingTopic(null);
      setSelectedId(null);
      toast.push("success", "Tema eliminado");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  if (isLoading) {
    return (
      <div className="border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
        Cargando matriz…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rose-200 bg-rose-50 rounded p-4 text-sm text-rose-700">
        No se pudo cargar la matriz.{" "}
        <button onClick={() => mutate()} className="underline">
          Reintentar
        </button>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <>
        <div className="border border-slate-200 rounded bg-slate-50/50 p-8 text-center">
          <h3 className="text-sm font-bold text-slate-700 mb-1">
            Matriz de materialidad sin iniciar
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            Carga la plantilla con 20 temas pre-clasificados (5 doble material,
            5 impacto, 5 financiero, 5 seguimiento). Editables después.
          </p>
          {/* D-22: la plantilla default contiene temas de distribución de alimentos refrigerados.
              El disclaimer advierte al consultor que los temas son un punto de partida y
              deben adaptarse al sector real del cliente. */}
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 max-w-md mx-auto mb-4">
            La plantilla usa temas de referencia (GHG, agua, cadena de suministro, etc.).
            Revisa y adapta al sector real del cliente antes de validar.
          </p>
          {/* D-30: deshabilitar botón mientras busyInit para evitar doble submit. */}
          <Button
            variant="primary"
            size="md"
            disabled={busyInit}
            onClick={() => setConfirmInit(true)}
          >
            Cargar plantilla (20 temas)
          </Button>
        </div>
        <ConfirmModal
          open={confirmInit}
          onCancel={() => setConfirmInit(false)}
          onConfirm={initFromTemplate}
          title="Cargar plantilla de materialidad"
          description="Se crearán 20 temas pre-clasificados editables. Puedes modificar posiciones, colores, etiquetas y eliminar/agregar después."
          confirmLabel={busyInit ? "Cargando…" : "Cargar 20 temas"}
          tone="primary"
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Narrative chip + bulk validate */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded">
        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
        <p className="flex-1 text-[11px] text-slate-700 font-medium">
          {/* Riesgo principal primero — dato más relevante para el gerente */}
          {stats.dm > 0 && (
            <>
              <span className="font-bold text-slate-900">
                Riesgo principal: {stats.top}
              </span>
              {" · "}
            </>
          )}
          <span className="font-bold text-rose-600">{stats.dm} doble material</span>
          {" · "}
          <span className="font-bold text-brand-primary-dark">{stats.fin} financiero</span>
          {" · "}
          <span className="font-bold text-amber-700">{stats.imp} por impacto</span>
          {" · "}
          <span
            className={`font-bold ${
              stats.validated === stats.total && stats.total > 0
                ? "text-emerald-700"
                : "text-slate-700"
            }`}
            title="Temas con posicionamiento confirmado por el consultor"
          >
            {stats.validated}/{stats.total} validados
          </span>
        </p>
        {stats.total > 0 && (
          stats.validated === stats.total ? (
            <button
              onClick={() => setConfirmUnvalidate(true)}
              disabled={busyBulk}
              className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 hover:underline shrink-0 disabled:opacity-40 disabled:no-underline"
              title="Quitar validación a todos los temas"
            >
              {busyBulk ? "…" : "Quitar validación"}
            </button>
          ) : (
            <button
              onClick={() => bulkSetValidated(true)}
              disabled={busyBulk}
              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 hover:bg-emerald-100 shrink-0 disabled:opacity-40"
              title="Marcar todos los temas como validados"
            >
              {busyBulk ? "Validando…" : "Validar todos"}
            </button>
          )
        )}
      </div>

      <div className="flex gap-4">
        {/* Matriz BCG */}
        <div className="flex-1 min-w-0">
          {/* Y-axis */}
          <div className="flex">
            <div className="w-12 shrink-0 flex flex-col justify-between items-end pr-2 pt-1 pb-1" style={{ height: 320 }}>
              <span className="text-[9px] text-slate-400 tabular-nums">10</span>
              <span
                className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.12em] -rotate-90 whitespace-nowrap origin-center"
                title="Impacto del negocio en sociedad y medio ambiente"
              >
                Impacto
              </span>
              <span className="text-[9px] text-slate-400 tabular-nums">0</span>
            </div>

            {/* Plot */}
            <div className="relative flex-1 bg-white border-2 border-slate-300" style={{ height: 320 }}>
              {/* Grid */}
              {[20, 40, 60, 80].map((p) => (
                <div key={`v${p}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${p}%`, borderLeft: "1px solid #e2e8f0" }} />
              ))}
              {[20, 40, 60, 80].map((p) => (
                <div key={`h${p}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: `${p}%`, borderTop: "1px solid #e2e8f0" }} />
              ))}
              {/* Dividers */}
              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", borderTop: "2px dashed #94a3b8" }} />
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: "50%", borderLeft: "2px dashed #94a3b8" }} />

              {/* Quadrant labels */}
              <div className="absolute top-2 left-2.5 pointer-events-none">
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">Material por impacto</span>
              </div>
              <div className="absolute top-2 right-2.5 pointer-events-none text-right">
                <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wide">Doble material ★</span>
              </div>
              <div className="absolute bottom-2 left-2.5 pointer-events-none">
                <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">En seguimiento</span>
              </div>
              <div className="absolute bottom-2 right-2.5 pointer-events-none text-right">
                <span className="text-[9px] font-bold text-brand-primary-dark uppercase tracking-wide">Material financiero</span>
              </div>

              {/* Topics */}
              {topics.map((t, i) => {
                const sz = SIZE_PX[t.size];
                const isSelected = selectedId === t.id;
                const dimmed = filterQuadrant !== null && t.color !== filterQuadrant;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(isSelected ? null : t.id)}
                    onKeyDown={(e) => { if (e.key === "Escape") setSelectedId(null); }}
                    aria-label={`${i + 1}. ${t.label}`}
                    className={`absolute flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-full z-10 group transition-opacity ${dimmed ? "opacity-15 pointer-events-none" : "opacity-100"}`}
                    style={{ left: `${t.x_pos}%`, top: `${t.y_pos}%`, transform: "translate(-50%,-50%)", width: 40, height: 40 }}
                  >
                    <div
                      className={`ring-2 ring-white shadow-sm flex items-center justify-center transition-all select-none ${COLOR_DOT[t.color]} ${COLOR_SHAPE[t.color]} ${
                        isSelected ? "ring-[3px] ring-slate-800 shadow-lg scale-150" : "opacity-90 group-hover:opacity-100 group-hover:scale-125"
                      }`}
                      style={{ width: sz, height: sz }}
                    >
                      {sz >= 15 && (
                        <span className={`text-[7px] font-bold text-white leading-none ${t.color === "amber" ? "-rotate-45" : ""}`}>
                          {i + 1}
                        </span>
                      )}
                    </div>
                    {sz < 15 && (
                      <span className="absolute -top-3 text-[8px] font-bold text-slate-500 leading-none select-none">
                        {i + 1}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Popover */}
              {selected && <TopicPopover
                topic={selected}
                index={topics.findIndex(t => t.id === selected.id)}
                onClose={() => setSelectedId(null)}
                onEdit={() => { setEditingTopic(selected); setSelectedId(null); }}
              />}
            </div>
          </div>

          {/* X-axis */}
          <div className="relative ml-12 mt-1.5" style={{ height: 12 }}>
            {[0, 2, 4, 6, 8, 10].map((n, i) => (
              <span key={n} className="absolute text-[9px] text-slate-400 tabular-nums -translate-x-1/2" style={{ left: `${i * 20}%` }}>
                {n}
              </span>
            ))}
          </div>
          <div className="ml-12 mt-0.5 text-center">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.12em]">
              Materialidad financiera para el negocio
            </span>
          </div>
        </div>

        {/* Right panel: filter + index */}
        <div className="w-44 shrink-0 flex flex-col gap-3">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Filtrar cuadrante</p>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setFilterQuadrant(null)}
                className={`text-left text-[9px] font-semibold px-2 py-1 rounded transition-colors uppercase tracking-wide ${
                  filterQuadrant === null ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                Todos ({topics.length})
              </button>
              {(Object.entries(COLOR_META) as [TopicColor, typeof COLOR_META[TopicColor]][]).map(([key, val]) => {
                const count = topics.filter((t) => t.color === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterQuadrant(filterQuadrant === key ? null : key)}
                    className={`text-left text-[9px] font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1.5 uppercase tracking-wide ${
                      filterQuadrant === key
                        ? `${COLOR_BG[key]} ${COLOR_TEXT[key]} ring-1 ring-inset ring-current/30`
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    <span className="shrink-0">{val.symbol}</span>
                    {val.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Índice</p>
            <div className="space-y-px max-h-[240px] overflow-y-auto pr-0.5">
              {topics.map((t, i) => {
                const isSelected = selectedId === t.id;
                const dimmed = filterQuadrant !== null && t.color !== filterQuadrant;
                if (dimmed) return null;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(isSelected ? null : t.id)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors ${
                      isSelected ? COLOR_BG[t.color] : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-[9px] tabular-nums shrink-0 w-4 text-right font-medium ${
                      isSelected ? COLOR_TEXT[t.color] : "text-slate-400"
                    }`}>
                      {i + 1}
                    </span>
                    <span className={`text-[10px] shrink-0 leading-none ${COLOR_TEXT[t.color]}`}>
                      {COLOR_META[t.color].symbol}
                    </span>
                    <span className={`text-[10px] leading-tight truncate ${
                      isSelected ? `${COLOR_TEXT[t.color]} font-semibold` : "text-slate-700"
                    }`}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editingTopic && (
        <TopicEditor
          topic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSave={async (patch) => {
            await patchTopic(editingTopic.id, patch);
            setEditingTopic(null);
          }}
          onDelete={async () => deleteTopic(editingTopic.id)}
        />
      )}

      <ConfirmModal
        open={confirmUnvalidate}
        onCancel={() => setConfirmUnvalidate(false)}
        onConfirm={async () => {
          setConfirmUnvalidate(false);
          await bulkSetValidated(false);
        }}
        title="Quitar validación a todos los temas"
        description={`Se quitará el estado validado de los ${stats.validated} temas marcados. Esta acción es reversible.`}
        confirmLabel="Quitar validación"
        tone="destructive"
      />
    </div>
  );
}

function TopicPopover({
  topic,
  index,
  onClose,
  onEdit,
}: {
  topic: MaterialityTopic;
  index: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const goLeft = topic.x_pos > 55;
  const goUp = topic.y_pos > 55;
  return (
    <div
      className="absolute z-30 bg-white border border-slate-200 rounded shadow-md p-4 w-56"
      style={{
        ...(goLeft ? { right: `calc(${100 - topic.x_pos}% + 6px)` } : { left: `calc(${topic.x_pos}% + 6px)` }),
        ...(goUp ? { bottom: `calc(${100 - topic.y_pos}% + 6px)` } : { top: `calc(${topic.y_pos}% + 6px)` }),
      }}
    >
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-700 text-base leading-none font-medium"
      >
        ×
      </button>
      <div className="flex items-start gap-2 mb-2 pr-5">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${COLOR_DOT[topic.color]}`} />
        <div>
          <p className="text-[10px] text-slate-400 leading-none mb-1">#{index + 1}</p>
          <p className="text-sm font-bold text-slate-900 leading-tight">{topic.label}</p>
        </div>
      </div>
      <span className={`inline-flex rounded-full px-2 py-0.5 mb-2 ${COLOR_BG[topic.color]}`}>
        <span className={`text-[10px] font-semibold ${COLOR_TEXT[topic.color]}`}>
          {COLOR_META[topic.color].label}
        </span>
      </span>
      <p className="text-[11px] text-slate-500 mb-1 tabular-nums">
        Posición: x={topic.x_pos}, y={topic.y_pos}
      </p>
      <p className="text-[11px] mb-3">
        {topic.validated ? (
          <span className="text-emerald-700 font-semibold">✓ Validado</span>
        ) : (
          <span className="text-slate-500">Pendiente de validación</span>
        )}
      </p>
      {topic.notes && (
        <p className="text-[11px] text-slate-600 mb-3 italic">{topic.notes}</p>
      )}
      <button
        onClick={onEdit}
        className="w-full text-xs font-semibold text-brand-primary-dark bg-brand-primary-light border border-brand-primary/30 rounded-lg px-3 py-2 hover:bg-brand-primary/20 transition-colors text-left"
      >
        Editar tema →
      </button>
    </div>
  );
}

function TopicEditor({
  topic,
  onClose,
  onSave,
  onDelete,
}: {
  topic: MaterialityTopic;
  onClose: () => void;
  onSave: (patch: Partial<MaterialityTopic>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(topic.label);
  const [x, setX] = useState(topic.x_pos);
  const [y, setY] = useState(topic.y_pos);
  const [color, setColor] = useState<TopicColor>(topic.color);
  const [size, setSize] = useState<TopicSize>(topic.size);
  const [notes, setNotes] = useState(topic.notes ?? "");
  const [validated, setValidated] = useState(topic.validated);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const autoColor = deriveColor(x, y);

  async function handleSave() {
    setBusy(true);
    try {
      await onSave({ label, x_pos: x, y_pos: y, color, size, notes, validated });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-editor-title"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="topic-editor-title" className="text-sm font-bold text-slate-900">
            Editar tema
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <Field label="Etiqueta">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="X · Materialidad financiera">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={x}
                onChange={(e) => setX(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-400">0</span>
                <span className="text-xs font-semibold tabular-nums text-slate-700">{x}</span>
                <span className="text-[10px] text-slate-400">100</span>
              </div>
            </Field>
            <Field label="Y · Impacto (invertido)">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={y}
                onChange={(e) => setY(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-400">0=alto</span>
                <span className="text-xs font-semibold tabular-nums text-slate-700">{y}</span>
                <span className="text-[10px] text-slate-400">100=bajo</span>
              </div>
            </Field>
          </div>

          <Field label="Cuadrante (color)">
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(COLOR_META) as TopicColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`px-2.5 py-1.5 text-xs rounded border transition-colors flex items-center gap-1.5 ${
                    color === c
                      ? `${COLOR_BG[c]} ${COLOR_TEXT[c]} border-current`
                      : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-2 h-2 ${COLOR_SHAPE[c]} ${COLOR_DOT[c]}`} />
                  {COLOR_META[c].label}
                </button>
              ))}
            </div>
            {autoColor !== color && (
              <button
                type="button"
                onClick={() => setColor(autoColor)}
                className="mt-2 text-[10px] text-brand-primary hover:underline"
              >
                Sugerencia por posición: {COLOR_META[autoColor].label} →
              </button>
            )}
          </Field>

          <Field label="Tamaño (relevancia visual)">
            <div className="flex gap-1.5">
              {(["sm", "md", "lg"] as TopicSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`px-3 py-1.5 text-xs rounded border ${
                    size === s
                      ? "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                      : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s === "sm" ? "Pequeño" : s === "md" ? "Mediano" : "Grande"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              placeholder="Justificación, fuentes, observaciones…"
            />
          </Field>

          <Field label="Validación">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={validated}
                onChange={(e) => setValidated(e.target.checked)}
                className="mt-0.5 accent-emerald-600"
              />
              <span className="text-xs text-slate-700">
                <span className="font-semibold">Confirmar posicionamiento.</span>{" "}
                <span className="text-slate-500">
                  Marca cuando el consultor confirme que x/y/color reflejan el juicio del cliente. Cuenta hacia &ldquo;Todas validadas&rdquo; en el header.
                </span>
              </span>
            </label>
          </Field>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-rose-600 hover:underline"
          >
            Eliminar tema
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" loading={busy} onClick={handleSave}>
              Guardar
            </Button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await onDelete();
        }}
        title="Eliminar tema"
        description={`Se eliminará "${topic.label}" de la matriz. La acción no es reversible.`}
        confirmLabel="Eliminar"
        tone="destructive"
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
