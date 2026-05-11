"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

import type { DocMeta, ServiceOption } from "@/components/documents/doc-types";
import { ServiceMultiSelect } from "@/components/documents/ServiceMultiSelect";
import { RowActions } from "@/components/documents/RowActions";
import { PreviewModal } from "@/components/documents/PreviewModal";
import { PasteExtractModal } from "@/components/documents/PasteExtractModal";
import { BulkKindModal } from "@/components/documents/BulkKindModal";
import { BulkServicesModal } from "@/components/documents/BulkServicesModal";
import { EditServicesModal } from "@/components/documents/EditServicesModal";
import { DiscoverModal } from "@/components/documents/DiscoverModal";

const KIND_LABEL: Record<DocMeta["kind"], string> = {
  general: "General",
  sustainability_report: "Sustentabilidad",
  financial_report: "Financiero",
};

const KIND_COLOR: Record<DocMeta["kind"], string> = {
  general: "bg-slate-100 text-slate-700",
  sustainability_report: "bg-emerald-100 text-emerald-800",
  financial_report: "bg-amber-100 text-amber-800",
};

const TYPE_BADGE: Record<DocMeta["file_type"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  xlsx: "XLSX",
  txt: "TXT",
  md: "MD",
};

// ── Iconos SVG inline (reemplazan emojis ✕ ⚠ ↗ — coherencia con design system) ──
function IconX({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function IconWarn({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
function IconExtLink({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}
function IconPaste({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// Normaliza URL para dedup (mismo PDF servido con/sin trailing slash o case distinto).
function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return u.toLowerCase().trim().replace(/\/$/, "");
  }
}

export function DocumentsTab({
  clientId,
  isAdmin,
  questionnaireSteps,
  onExtractForStep,
}: {
  clientId: string;
  isAdmin: boolean;
  /** Pasos del cuestionario para el selector de extracción */
  questionnaireSteps?: { key: string; title: string }[];
  /** Callback: texto + stepKey → ClientTabs navega a Cuestionario y llena */
  onExtractForStep?: (stepKey: string, text: string) => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ data: DocMeta[] }>(
    `/api/clients/${clientId}/documents`,
    fetcher
  );
  // Catálogo de servicios cargado dinámicamente — nunca hardcodeado
  const { data: catalogData } = useSWR<{ data: { id: string; value: string; label: string }[] }>(
    `/api/catalogs?category=services`,
    fetcher
  );
  const serviceOptions: ServiceOption[] = (catalogData?.data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
  }));
  const serviceLabelById = Object.fromEntries(serviceOptions.map((s) => [s.id, s.label]));

  const [filter, setFilter] = useState<"all" | DocMeta["kind"]>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<DocMeta | null>(null);
  const [previewing, setPreviewing] = useState<DocMeta | null>(null);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [editingServices, setEditingServices] = useState<DocMeta | null>(null);
  // Multi-select: IDs de servicios seleccionados para el próximo upload
  const [uploadServiceIds, setUploadServiceIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Confirmación dedup al subir — almacena archivos pendientes + lista de duplicados detectados
  const [dupConfirm, setDupConfirm] = useState<{
    files: File[];
    dupNames: string[];
    newFiles: File[];
  } | null>(null);
  const toast = useToast();

  // ── Extracción hacia cuestionario ─────────────────────────────────────────
  // Muestra UI cuando el prop existe; el selector de pasos maneja el caso vacío/cargando.
  const canExtract = !!onExtractForStep;
  const hasSteps = (questionnaireSteps?.length ?? 0) > 0;
  // Paste flow ahora vive en modal dedicado (antes panel inline colapsable).
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [extractStepKey, setExtractStepKey] = useState<string>("");
  const [extracting, setExtracting] = useState(false);
  // Docs seleccionados para extracción + bulk actions
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  // Bulk actions sobre selección
  const [bulkKindOpen, setBulkKindOpen] = useState(false);
  const [bulkServicesOpen, setBulkServicesOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  // Drag & drop upload
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  async function fetchDocContent(docId: string): Promise<string | null> {
    const res = await fetch(`/api/clients/${clientId}/documents/${docId}?mode=content`);
    if (!res.ok) return null;
    const j = (await res.json()) as { data: { markdown_content: string | null } };
    return j.data.markdown_content;
  }

  function toggleDocSelect(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleExtractFromDocs() {
    if (selectedDocIds.size === 0 || !extractStepKey || !onExtractForStep) return;
    setExtracting(true);
    try {
      const parts: string[] = [];
      for (const id of Array.from(selectedDocIds)) {
        const md = await fetchDocContent(id);
        const doc = docs.find((d) => d.id === id);
        if (md) parts.push(`# ${doc?.file_name ?? id}\n\n${md}`);
      }
      const combined = parts.join("\n\n---\n\n").slice(0, 50_000);
      if (!combined.trim()) {
        toast.push("error", "Los documentos seleccionados no tienen contenido extraíble");
        return;
      }
      onExtractForStep(extractStepKey, combined);
      setSelectedDocIds(new Set());
    } finally {
      setExtracting(false);
    }
  }

  function handleExtractPaste(text: string, stepKey: string) {
    if (!text.trim() || !stepKey || !onExtractForStep) return;
    onExtractForStep(stepKey, text.trim().slice(0, 50_000));
    setPasteModalOpen(false);
  }

  // Bulk: cambiar kind de N documentos seleccionados
  async function handleBulkKind(newKind: DocMeta["kind"]) {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    setBulkKindOpen(false);
    let ok = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/clients/${clientId}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: newKind }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          failures.push(j.error ?? `HTTP ${res.status}`);
        } else {
          ok++;
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "error");
      }
    }
    void mutate();
    setSelectedDocIds(new Set());
    if (ok > 0 && failures.length === 0) toast.push("success", `${ok} documento(s) actualizados`);
    else if (ok > 0) toast.push("warning", `${ok} OK · ${failures.length} fallaron`);
    else toast.push("error", failures[0] ?? "Error en bulk update");
  }

  // Bulk: cambiar service_ids de N documentos seleccionados
  async function handleBulkServices(serviceIds: string[]) {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    setBulkServicesOpen(false);
    let ok = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/clients/${clientId}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service_ids: serviceIds }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          failures.push(j.error ?? `HTTP ${res.status}`);
        } else {
          ok++;
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "error");
      }
    }
    void mutate();
    setSelectedDocIds(new Set());
    if (ok > 0 && failures.length === 0) toast.push("success", `${ok} documento(s) actualizados`);
    else if (ok > 0) toast.push("warning", `${ok} OK · ${failures.length} fallaron`);
    else toast.push("error", failures[0] ?? "Error en bulk update");
  }

  // Bulk: eliminar N documentos seleccionados (solo admin)
  async function handleBulkDelete() {
    const ids = Array.from(selectedDocIds);
    if (ids.length === 0) return;
    setBulkDeleteOpen(false);
    let ok = 0;
    const failures: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/clients/${clientId}/documents/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          failures.push(j.error ?? `HTTP ${res.status}`);
        } else {
          ok++;
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "error");
      }
    }
    void mutate();
    setSelectedDocIds(new Set());
    if (ok > 0 && failures.length === 0) toast.push("success", `${ok} documento(s) eliminados`);
    else if (ok > 0) toast.push("warning", `${ok} OK · ${failures.length} fallaron`);
    else toast.push("error", failures[0] ?? "Error al eliminar");
  }

  // Drag & drop upload — overlay sobre toda la tab
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current++;
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current--;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files);
  }

  // Cerrar menú bulk al click fuera o Escape
  useEffect(() => {
    if (!bulkMenuOpen) return;
    function onClickOutside(ev: MouseEvent) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(ev.target as Node)) setBulkMenuOpen(false);
    }
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setBulkMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [bulkMenuOpen]);

  const docs = data?.data ?? [];
  // URLs ya ingestadas — set normalizado para el DiscoverModal (evita re-ingestar la misma URL).
  const existingUrlSet = (() => {
    const s = new Set<string>();
    for (const d of docs) if (d.source_url) s.add(normalizeUrl(d.source_url));
    return s;
  })();
  // Columnas Servicio + Estado siempre renderizadas (layout estable — el usuario no se confunde
  // con cambios de columnas según data). Si vacío → "—".
  // Detección de duplicados — un hash que aparece 2+ veces marca todas sus filas
  const dupHashes = (() => {
    const counts = new Map<string, number>();
    for (const d of docs) {
      if (d.content_hash) counts.set(d.content_hash, (counts.get(d.content_hash) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([h]) => h));
  })();
  // Filtro por kind + por servicio (uploadServiceIds sirve también como filtro activo) + búsqueda por nombre
  const q = searchQuery.trim().toLowerCase();
  const filtered = docs
    .filter((d) => filter === "all" || d.kind === filter)
    .filter((d) => uploadServiceIds.length === 0 || uploadServiceIds.some((sid) => d.service_ids.includes(sid)))
    .filter((d) => !q || d.file_name.toLowerCase().includes(q) || (d.source_url ?? "").toLowerCase().includes(q));

  const counts = {
    all: docs.length,
    general: docs.filter((d) => d.kind === "general").length,
    sustainability_report: docs.filter((d) => d.kind === "sustainability_report").length,
    financial_report: docs.filter((d) => d.kind === "financial_report").length,
  };

  // Métricas de cobertura — strip 1 condicional (sólo render cuando hay alerta).
  // El recap completo (N docs · X con contenido · último Y) vive en el tooltip
  // del badge tab "Documentos [N]" en ClientTabs (siempre disponible sin ocupar
  // pixels permanentes en este tab).
  const withContent = docs.filter((d) => d.has_content).length;
  const failedCount = docs.filter((d) => d.parse_status === "failed").length;

  // Detección dedup pre-upload — match por (nombre lowercase, size_bytes).
  // Evita duplicados accidentales al re-subir un archivo ya cargado.
  function detectDuplicates(files: File[]): { dupNames: string[]; newFiles: File[] } {
    const existingKey = new Set(
      docs.map((d) => `${d.file_name.toLowerCase()}|${d.size_bytes}`)
    );
    const dupNames: string[] = [];
    const newFiles: File[] = [];
    for (const f of files) {
      if (existingKey.has(`${f.name.toLowerCase()}|${f.size}`)) dupNames.push(f.name);
      else newFiles.push(f);
    }
    return { dupNames, newFiles };
  }

  async function handleUpload(files: FileList) {
    const arr = Array.from(files);
    const { dupNames, newFiles } = detectDuplicates(arr);
    if (dupNames.length > 0) {
      setDupConfirm({ files: arr, dupNames, newFiles });
      return;
    }
    await doUpload(arr);
  }

  async function doUpload(files: File[]) {
    setUploading(true);
    let okCount = 0;
    const failures: string[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "general");
      if (uploadServiceIds.length > 0) fd.append("service_ids", uploadServiceIds.join(","));
      try {
        const res = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          failures.push(`${file.name}: ${j.error ?? "error"}`);
        } else {
          okCount++;
        }
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    setUploading(false);
    void mutate();
    if (okCount > 0 && failures.length === 0) toast.push("success", `${okCount} archivo(s) subidos`);
    else if (okCount > 0) toast.push("warning", `${okCount} OK · ${failures.length} fallaron`);
    else if (files.length === 0) toast.push("info", "Sin archivos nuevos por subir");
    else toast.push("error", failures[0] ?? "Error subiendo");
  }

  async function handleDelete(doc: DocMeta) {
    setDeleting(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.push("success", "Documento eliminado");
      void mutate();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  async function handleDownload(doc: DocMeta) {
    try {
      const res = await fetch(`/api/clients/${clientId}/documents/${doc.id}?mode=download`);
      const j = await res.json();
      if (!res.ok || !j.data?.url) throw new Error(j.error ?? "Error generando link");
      window.open(j.data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al descargar");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return "< 1 KB";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (isLoading) return <SkeletonTable rows={5} cols={7} />;
  if (error) {
    return (
      <div className="p-6 border border-rose-200 bg-rose-50 rounded text-sm text-rose-700">
        No se pudo cargar la lista.{" "}
        <button onClick={() => mutate()} className="underline">Reintentar</button>
      </div>
    );
  }

  // Filtros de categoría — solo categorías con docs. Sin pill "Todos" (redundante con
  // search bar y badge de tab). Click en pill activa toggle a "all".
  const filterOptions = [
    ...(counts.general > 0 ? [{ k: "general" as const, label: `General (${counts.general})` }] : []),
    ...(counts.sustainability_report > 0 ? [{ k: "sustainability_report" as const, label: `Sustentabilidad (${counts.sustainability_report})` }] : []),
    ...(counts.financial_report > 0 ? [{ k: "financial_report" as const, label: `Financiero (${counts.financial_report})` }] : []),
  ];

  return (
    <div
      className="px-1 relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag & drop overlay — visible solo cuando el usuario arrastra archivos sobre la tab */}
      {isDragging && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-brand-primary-light/95 border-2 border-dashed border-brand-primary rounded pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="text-center">
            <svg className="w-10 h-10 text-brand-primary-dark mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-semibold text-brand-primary-dark">Suelta para subir</p>
            <p className="text-xs text-brand-primary-dark/70 mt-0.5">PDF, DOCX, XLSX, PPTX, TXT · Máx. 25 MB</p>
          </div>
        </div>
      )}

      {/* Banner alerta — sólo cuando hay condición accionable. Vive arriba del
          strip fusionado para que el ojo lo capte primero. Caso todo-ok: no
          renderiza, ahorra ~32px. */}
      {docs.length > 0 && (() => {
        const noContent = docs.length - withContent;
        const alerts: { label: string; tone: "rose" | "amber" }[] = [];
        if (failedCount > 0) {
          alerts.push({ label: `${failedCount} sin texto extraíble`, tone: "rose" });
        } else if (noContent > 0) {
          alerts.push({ label: `${noContent} sin contenido aún`, tone: "amber" });
        }
        if (counts.financial_report === 0) {
          alerts.push({ label: "falta informe financiero", tone: "amber" });
        }
        if (counts.sustainability_report === 0) {
          alerts.push({ label: "falta informe sustentabilidad", tone: "amber" });
        }
        if (alerts.length === 0) return null;
        const isCritical = alerts.some((a) => a.tone === "rose");
        return (
          <div
            className={`mb-3 px-3 py-2 rounded border text-xs flex items-center gap-2 flex-wrap ${
              isCritical
                ? "bg-rose-50 border-rose-200"
                : "bg-amber-50 border-amber-200"
            }`}
            role="status"
            aria-live="polite"
          >
            <svg
              className={`w-3.5 h-3.5 shrink-0 ${isCritical ? "text-rose-600" : "text-amber-600"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {alerts.map((a, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-300" aria-hidden="true">·</span>}
                <span className={a.tone === "rose" ? "text-rose-700 font-medium" : "text-amber-800"}>
                  {a.label}
                </span>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setDiscoverOpen(true)}
              className="ml-auto text-[11px] font-semibold text-brand-primary-dark hover:underline"
              title="Buscar con IA documentos públicos del cliente"
            >
              Resolver →
            </button>
          </div>
        );
      })()}

      {/* Strip único fusionado — search + pills + servicios + CTAs en 1 fila.
          flex-wrap permite wrap natural en viewport ≤1280px sin overflow.
          Ahorra ~36px verticales vs los 2 strips separados anteriores. */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {docs.length > 0 && (
          <>
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o URL…"
                className="font-sans w-full text-xs border border-slate-300 rounded pl-8 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded"
                  aria-label="Limpiar búsqueda"
                >
                  <IconX className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Pills kind toggle */}
            {filterOptions.map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(filter === f.k ? "all" : f.k)}
                className={`text-[11px] font-medium rounded-sm border px-2.5 py-2 transition-colors ${
                  filter === f.k
                    ? "bg-brand-primary-light border-brand-primary/30 text-brand-primary-dark"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
                aria-pressed={filter === f.k}
              >
                {f.label}
              </button>
            ))}
            {/* Multi-select Servicios */}
            {serviceOptions.length > 0 && (
              <ServiceMultiSelect
                options={serviceOptions}
                selected={uploadServiceIds}
                onChange={setUploadServiceIds}
              />
            )}
          </>
        )}
        {docs.length === 0 && (
          <span className="text-xs text-slate-500">
            Sin documentos. Sube PDF, DOCX, XLSX… o usa &ldquo;Buscar con IA&rdquo;.
          </span>
        )}
        {/* ml-auto empuja CTAs a la derecha — siempre presentes para que el usuario
            no tenga que volver a un strip vacío para subir. */}
        <div className="ml-auto flex items-center gap-2">
          {/* CTAs secundarios — labels colapsan a icon-only en viewports ≤lg para
              que el strip único entre en 1 fila en 1264px. "Subir archivo"
              mantiene label siempre (acción primaria, debe ser inmediato) */}
          {canExtract && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPasteModalOpen(true)}
              title="Pegar texto para extracción al cuestionario"
              aria-label="Pegar texto"
            >
              <IconPaste className="w-3.5 h-3.5 lg:mr-1" />
              <span className="hidden lg:inline">Pegar texto</span>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDiscoverOpen(true)}
            title="Buscar documentos públicos del cliente con IA"
            aria-label="Buscar con IA"
          >
            <svg className="w-3.5 h-3.5 lg:mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden lg:inline">Buscar con IA</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
            </svg>
            Subir archivo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded p-8 text-center">
          <p className="text-sm text-slate-500">
            {docs.length === 0
              ? "Sube PDF, DOCX o XLSX del cliente para que la IA tenga contexto directo del negocio."
              : "Sin resultados para este filtro."}
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full w-max">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {canExtract && <th className="px-3 py-2 w-8" />}
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tipo</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Nombre</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Categoría</th>
                {/* Columnas Servicio + Estado siempre renderizadas (layout estable). Si vacío → "—" */}
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Servicio</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tamaño</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Fecha</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Estado</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (
                <Fragment key={d.id}>
                  <tr className={`hover:bg-slate-50/70 transition-colors ${selectedDocIds.has(d.id) ? "bg-brand-primary/5" : ""}`}>
                    {canExtract && (
                      <td className="px-3 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={selectedDocIds.has(d.id)}
                          disabled={!d.has_content || d.parse_status !== "ok"}
                          onChange={() => toggleDocSelect(d.id)}
                          className="accent-brand-primary"
                          aria-label={`Seleccionar ${d.file_name}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-700 rounded-sm px-1.5 py-0.5">
                        {TYPE_BADGE[d.file_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900 truncate">{d.file_name}</span>
                        {d.content_hash && dupHashes.has(d.content_hash) && (
                          <span
                            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-sm px-1.5 py-0.5 bg-amber-100 text-amber-800 whitespace-nowrap"
                            title="Otro documento del cliente tiene el mismo contenido (hash MD5 idéntico). Considera borrar uno para no inflar el contexto IA."
                          >
                            <IconWarn className="w-3 h-3" />
                            Duplicado
                          </span>
                        )}
                      </div>
                      {d.source_url && (
                        <a
                          href={d.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 hover:underline truncate max-w-full mt-0.5"
                          title={d.source_url}
                        >
                          <IconExtLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{d.source_url}</span>
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold uppercase rounded-sm px-1.5 py-0.5 ${KIND_COLOR[d.kind]}`}>
                        {KIND_LABEL[d.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {d.service_ids.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {d.service_ids.map((sid) => (
                            <span
                              key={sid}
                              className="text-[10px] font-semibold rounded-sm px-1.5 py-0.5 bg-slate-100 text-slate-700 whitespace-nowrap"
                            >
                              {serviceLabelById[sid] ?? sid}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700 text-right tabular-nums">
                      {formatSize(d.size_bytes)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-xs text-slate-700 tabular-nums"
                      title={d.uploaded_by ? `Subido por ${d.uploaded_by}` : undefined}
                    >
                      {new Date(d.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.parse_status === "ok" && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Convertido
                        </span>
                      )}
                      {d.parse_status === "pending" && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-semibold">
                          <svg className="w-3.5 h-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Procesando
                        </span>
                      )}
                      {d.parse_status === "failed" && (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-700 font-semibold">
                          <IconWarn className="w-3.5 h-3.5 shrink-0" />
                          Falló
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RowActions
                        doc={d}
                        isAdmin={isAdmin}
                        onPreview={() => setPreviewing(d)}
                        onEditServices={() => setEditingServices(d)}
                        onDownload={() => void handleDownload(d)}
                        onDelete={() => setDeleting(d)}
                      />
                    </td>
                  </tr>
                  {/* Error expandido inline — visible cuando parse falló */}
                  {d.parse_status === "failed" && d.parse_error && (
                    <tr className="bg-rose-50/50">
                      <td
                        colSpan={8 + (canExtract ? 1 : 0)}
                        className="px-3 py-2 text-xs text-rose-700"
                      >
                        <span className="font-semibold">Error de conversión:</span> {d.parse_error}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer sticky — visible cuando hay selección. Combina extracción + bulk actions
          (cambiar categoría, cambiar servicios, borrar admin) sobre la selección. */}
      {selectedDocIds.size > 0 && (
        <div
          className="sticky bottom-3 z-10 mt-3 flex items-center gap-3 px-4 py-3 bg-white/95 backdrop-blur-sm border border-brand-primary/30 rounded shadow-sm ring-1 ring-brand-primary/10"
          role="region"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-xs text-brand-primary-dark font-semibold shrink-0">
            {selectedDocIds.size} doc{selectedDocIds.size !== 1 ? "s" : ""} seleccionado{selectedDocIds.size !== 1 ? "s" : ""}
          </span>
          {canExtract && (
            <>
              <div className="flex-1 min-w-[180px]">
                <SelectField
                  value={extractStepKey}
                  onChange={setExtractStepKey}
                  options={(questionnaireSteps ?? []).map((s) => ({ value: s.key, label: s.title }))}
                  placeholder={hasSteps ? "Selecciona un paso…" : "Cargando pasos…"}
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={extracting}
                disabled={!extractStepKey || !hasSteps}
                onClick={() => void handleExtractFromDocs()}
              >
                Extraer y llenar →
              </Button>
            </>
          )}
          {/* Bulk actions menu — categoría / servicios / borrar */}
          <div ref={bulkMenuRef} className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={bulkMenuOpen}
            >
              Más acciones
              <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
            {bulkMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 bottom-full mb-1 z-30 bg-white border border-slate-200 rounded shadow-sm min-w-[200px] py-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setBulkKindOpen(true); setBulkMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Cambiar categoría
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setBulkServicesOpen(true); setBulkMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Cambiar servicios
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setBulkDeleteOpen(true); setBulkMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 border-t border-slate-100"
                  >
                    Borrar seleccionados
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedDocIds(new Set())}
            className="text-xs text-slate-600 hover:text-slate-900 shrink-0 underline-offset-2 hover:underline"
          >
            Limpiar
          </button>
        </div>
      )}

      {editingServices && (
        <EditServicesModal
          clientId={clientId}
          doc={editingServices}
          serviceOptions={serviceOptions}
          onClose={() => setEditingServices(null)}
          onSaved={() => {
            setEditingServices(null);
            void mutate();
          }}
        />
      )}

      {discoverOpen && (
        <DiscoverModal
          clientId={clientId}
          existingUrls={existingUrlSet}
          onClose={() => setDiscoverOpen(false)}
          onIngested={() => { void mutate(); }}
        />
      )}

      {/* Confirmación dedup pre-upload — lista archivos ya existentes y deja
          elegir entre subir solo nuevos, subir todo o cancelar. Evita duplicados
          accidentales al re-arrastrar la misma carpeta. */}
      {dupConfirm && (
        <Modal
          open
          onClose={() => setDupConfirm(null)}
          title="Archivos ya existen"
          size="md"
        >
          <div className="space-y-3 text-sm">
            <p className="text-slate-700">
              {dupConfirm.dupNames.length === 1
                ? "Este archivo ya está en el cliente:"
                : `Estos ${dupConfirm.dupNames.length} archivos ya están en el cliente:`}
            </p>
            <ul className="border border-amber-200 bg-amber-50 rounded p-2 max-h-[200px] overflow-y-auto text-xs text-amber-900 space-y-1">
              {dupConfirm.dupNames.map((n) => (
                <li key={n} className="flex items-center gap-1.5">
                  <IconWarn className="w-3 h-3 shrink-0 text-amber-600" />
                  <span className="truncate">{n}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-600">
              Match por nombre y tamaño exacto. Subir igual creará una segunda copia.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setDupConfirm(null)}>
                Cancelar
              </Button>
              {dupConfirm.newFiles.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const newFiles = dupConfirm.newFiles;
                    setDupConfirm(null);
                    void doUpload(newFiles);
                  }}
                >
                  Subir solo nuevos ({dupConfirm.newFiles.length})
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const allFiles = dupConfirm.files;
                  setDupConfirm(null);
                  void doUpload(allFiles);
                }}
              >
                Subir todos ({dupConfirm.files.length})
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {previewing && <PreviewModal clientId={clientId} doc={previewing} onClose={() => setPreviewing(null)} />}

      {deleting && (
        <ConfirmModal
          open
          title="Eliminar documento"
          description={`Se borrará "${deleting.file_name}" del Storage y la base de datos. Acción irreversible.`}
          tone="destructive"
          confirmLabel="Eliminar"
          onConfirm={async () => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}

      {/* Modal: pegar texto para extracción al cuestionario (antes panel inline colapsable) */}
      {pasteModalOpen && canExtract && (
        <PasteExtractModal
          questionnaireSteps={questionnaireSteps ?? []}
          initialStepKey={extractStepKey}
          onExtract={(text, stepKey) => {
            setExtractStepKey(stepKey);
            handleExtractPaste(text, stepKey);
          }}
          onClose={() => setPasteModalOpen(false)}
        />
      )}

      {/* Modal: bulk cambiar categoría de N documentos */}
      {bulkKindOpen && (
        <BulkKindModal
          count={selectedDocIds.size}
          onConfirm={handleBulkKind}
          onClose={() => setBulkKindOpen(false)}
        />
      )}

      {/* Modal: bulk cambiar servicios de N documentos */}
      {bulkServicesOpen && (
        <BulkServicesModal
          count={selectedDocIds.size}
          serviceOptions={serviceOptions}
          onConfirm={handleBulkServices}
          onClose={() => setBulkServicesOpen(false)}
        />
      )}

      {/* Confirm: bulk delete (solo admin) */}
      {bulkDeleteOpen && (
        <ConfirmModal
          open
          title={`Eliminar ${selectedDocIds.size} documento${selectedDocIds.size !== 1 ? "s" : ""}`}
          description="Se borrarán del Storage y la base de datos. Acción irreversible."
          tone="destructive"
          confirmLabel="Eliminar"
          onConfirm={async () => handleBulkDelete()}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}
    </div>
  );
}

