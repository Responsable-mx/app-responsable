"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { SelectField } from "@/components/ui/SelectField";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type DocMeta = {
  id: string;
  client_id: string;
  uploaded_by: string | null;
  kind: "general" | "sustainability_report" | "financial_report";
  file_name: string;
  file_type: "pdf" | "docx" | "pptx" | "xlsx" | "txt" | "md";
  mime_type: string;
  size_bytes: number;
  source_url: string | null;
  parse_status: "pending" | "ok" | "failed";
  parse_error: string | null;
  has_content: boolean;
  service_ids: string[];
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

type ServiceOption = { id: string; label: string };

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

// ──────────────────────────────────────────────────────────────────────────────
// PasteExtractModal — reemplaza panel colapsable inline (UX: single source of truth)
// ──────────────────────────────────────────────────────────────────────────────
function PasteExtractModal({
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

// ──────────────────────────────────────────────────────────────────────────────
// BulkKindModal — cambia el `kind` de N documentos seleccionados
// ──────────────────────────────────────────────────────────────────────────────
function BulkKindModal({
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
              { value: "general", label: "General" },
              { value: "sustainability_report", label: "Sustentabilidad" },
              { value: "financial_report", label: "Financiero" },
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

// ──────────────────────────────────────────────────────────────────────────────
// BulkServicesModal — reemplaza service_ids de N documentos seleccionados
// ──────────────────────────────────────────────────────────────────────────────
function BulkServicesModal({
  count,
  serviceOptions,
  onConfirm,
  onClose,
}: {
  count: number;
  serviceOptions: ServiceOption[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Modal open onClose={onClose} title={`Cambiar servicios de ${count} documento${count !== 1 ? "s" : ""}`}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-600">
          Reemplaza por completo la lista de servicios en los documentos seleccionados.
          Deja vacío para limpiar todas las asociaciones.
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Servicios
          </p>
          {serviceOptions.length === 0 ? (
            <p className="text-xs text-slate-600">Cargando catálogo…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {serviceOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, o.id]
                          : selected.filter((s) => s !== o.id)
                      )
                    }
                    className="rounded border-slate-300 text-brand-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(selected)}>
            Aplicar a {count}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// EditServicesModal: edita service_ids de un documento existente
// ──────────────────────────────────────────────────────────────────────────────
function EditServicesModal({
  clientId,
  doc,
  serviceOptions,
  onClose,
  onSaved,
}: {
  clientId: string;
  doc: DocMeta;
  serviceOptions: ServiceOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(doc.service_ids);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_ids: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.push("success", "Servicios actualizados");
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Editar servicios del documento">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Documento</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{doc.file_name}</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Servicios que usa este documento
          </p>
          {serviceOptions.length === 0 ? (
            <p className="text-xs text-slate-600">Cargando catálogo…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {serviceOptions.map((o) => (
                <label key={o.id} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 px-2 py-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={selected.includes(o.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, o.id]
                          : selected.filter((s) => s !== o.id)
                      )
                    }
                    className="rounded border-slate-300 text-brand-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DiscoverModal: busca docs públicos del cliente con IA y los ingesta al aprobar
// ──────────────────────────────────────────────────────────────────────────────
type Candidate = {
  url: string;
  title: string;
  year?: number | string | null;
  kind: "sustainability_report" | "financial_report";
  serviceIds?: string[];
};

type DiscoverState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; candidates: Candidate[] }
  | { status: "error"; message: string };

function DiscoverModal({
  clientId,
  existingUrls,
  onClose,
  onIngested,
}: {
  clientId: string;
  /** URLs ya ingestadas (normalizadas) — para marcar candidatos duplicados y no pre-seleccionarlos. */
  existingUrls: Set<string>;
  onClose: () => void;
  onIngested: () => void;
}) {
  const [state, setState] = useState<DiscoverState>({ status: "idle" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [kindOverride, setKindOverride] = useState<Record<number, Candidate["kind"]>>({});
  const [serviceOverride, setServiceOverride] = useState<Record<number, string[]>>({});
  const { data: catalogData } = useSWR<{ data: { id: string; value: string; label: string }[] }>(
    `/api/catalogs?category=services`,
    fetcher
  );
  const serviceOptions: ServiceOption[] = (catalogData?.data ?? []).map((c) => ({ id: c.id, label: c.label }));
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<{ idx: number; ok: boolean; msg?: string }[]>([]);
  const toast = useToast();

  async function handleSearch() {
    setState({ status: "searching" });
    setSelected(new Set());
    setKindOverride({});
    setIngestResults([]);
    try {
      // Busca ambos tipos en paralelo
      const [susRes, finRes] = await Promise.allSettled([
        fetch(`/api/clients/${clientId}/research-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "sustainability_report" }),
        }).then((r) => r.json()),
        fetch(`/api/clients/${clientId}/research-reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "financial_report" }),
        }).then((r) => r.json()),
      ]);

      const candidates: Candidate[] = [];
      if (susRes.status === "fulfilled" && susRes.value?.data?.candidates) {
        for (const c of susRes.value.data.candidates as Candidate[]) {
          candidates.push({ ...c, kind: "sustainability_report" });
        }
      }
      if (finRes.status === "fulfilled" && finRes.value?.data?.candidates) {
        for (const c of finRes.value.data.candidates as Candidate[]) {
          candidates.push({ ...c, kind: "financial_report" });
        }
      }

      if (candidates.length === 0) {
        setState({ status: "done", candidates: [] });
      } else {
        setState({ status: "done", candidates });
        // Pre-seleccionar solo los que NO existan ya en el cliente (dedup pre-ingest).
        setSelected(
          new Set(
            candidates
              .map((c, i) => ({ c, i }))
              .filter(({ c }) => !existingUrls.has(normalizeUrl(c.url)))
              .map(({ i }) => i)
          )
        );
      }
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Error de red" });
    }
  }

  async function handleIngest() {
    if (state.status !== "done") return;
    const toIngest = Array.from(selected);
    setIngesting(true);
    const results: { idx: number; ok: boolean; msg?: string }[] = [];

    for (const idx of toIngest) {
      const c = state.candidates[idx];
      if (!c) continue;
      const kind = kindOverride[idx] ?? c.kind;
      try {
        const res = await fetch(`/api/clients/${clientId}/ingest-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, url: c.url, service_ids: serviceOverride[idx] ?? c.serviceIds ?? [] }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          results.push({ idx, ok: false, msg: j.error ?? `HTTP ${res.status}` });
        } else {
          results.push({ idx, ok: true });
        }
      } catch (e) {
        results.push({ idx, ok: false, msg: e instanceof Error ? e.message : "Error" });
      }
    }

    setIngesting(false);
    setIngestResults(results);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    if (ok > 0) {
      onIngested();
      toast.push("success", `${ok} documento${ok > 1 ? "s" : ""} ingresado${ok > 1 ? "s" : ""}`);
    }
    if (fail === 0 && ok > 0) onClose();
    else if (fail > 0) toast.push("warning", `${fail} fallaron — revisa los errores`);
  }

  const candidates = state.status === "done" ? state.candidates : [];
  const resultMap = Object.fromEntries(ingestResults.map((r) => [r.idx, r]));

  return (
    <Modal open onClose={onClose} title="Buscar documentos con IA" size="lg">
      <div className="flex flex-col gap-4">
        {/* Descripción */}
        <p className="text-xs text-slate-600">
          La IA busca en la web los documentos públicos del cliente: informes de sustentabilidad,
          financieros, GRI, TCFD y código de ética. Valida y selecciona cuáles ingestar.
        </p>

        {/* Estado: idle */}
        {state.status === "idle" && (
          <div className="border border-dashed border-slate-300 rounded p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">
              Presiona buscar para que la IA encuentre documentos públicos del cliente.
            </p>
            <Button variant="primary" size="sm" onClick={() => void handleSearch()}>
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Iniciar búsqueda
            </Button>
          </div>
        )}

        {/* Estado: buscando */}
        {state.status === "searching" && (
          <div className="border border-slate-200 rounded p-6 text-center bg-slate-50">
            <svg className="w-5 h-5 text-brand-primary mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-xs text-slate-600">
              Buscando informes de sustentabilidad y financieros… puede tardar 30–90 s.
            </p>
          </div>
        )}

        {/* Estado: error */}
        {state.status === "error" && (
          <div className="border border-rose-200 rounded p-4 bg-rose-50 text-xs text-rose-700">
            <p className="font-semibold mb-1">Error en la búsqueda</p>
            <p>{state.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void handleSearch()}>
              Reintentar
            </Button>
          </div>
        )}

        {/* Estado: resultados */}
        {state.status === "done" && candidates.length === 0 && (
          <div className="border border-dashed border-slate-300 rounded p-6 text-center">
            <p className="text-sm text-slate-500 mb-3">No se encontraron documentos públicos para este cliente.</p>
            <Button variant="secondary" size="sm" onClick={() => void handleSearch()}>
              Buscar de nuevo
            </Button>
          </div>
        )}

        {state.status === "done" && candidates.length > 0 && (() => {
          const dupCount = candidates.filter((c) => existingUrls.has(normalizeUrl(c.url))).length;
          return (
          <>
            {dupCount > 0 && (
              <div className="px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-center gap-2" role="status" aria-live="polite">
                <svg className="w-3.5 h-3.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>
                  {dupCount === 1
                    ? "1 candidato ya está en este cliente — desmarcado por defecto."
                    : `${dupCount} candidatos ya están en este cliente — desmarcados por defecto.`}
                </span>
              </div>
            )}
            <div className="overflow-x-auto border border-slate-200 rounded bg-white shadow-sm">
              <table className="min-w-full w-max text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === candidates.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(candidates.map((_, i) => i)) : new Set())
                        }
                        className="rounded border-slate-300"
                        aria-label={selected.size === candidates.length ? "Deseleccionar todos" : "Seleccionar todos"}
                      />
                    </th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Título</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Año</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tipo</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Servicio</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((c, idx) => {
                    const result = resultMap[idx];
                    const isSelected = selected.has(idx);
                    const isDup = existingUrls.has(normalizeUrl(c.url));
                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${isSelected ? "bg-brand-primary-light/10" : isDup ? "bg-amber-50/40" : "hover:bg-slate-50/70"}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!!result}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(idx); else next.delete(idx);
                              setSelected(next);
                            }}
                            className="rounded border-slate-300"
                            aria-label={`Seleccionar ${c.title}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-primary-dark hover:underline font-semibold leading-snug line-clamp-2"
                          >
                            {c.title}
                          </a>
                          <span className="block text-xs text-slate-600 truncate mt-0.5">{c.url}</span>
                          {isDup && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              <IconWarn className="w-2.5 h-2.5" />
                              Ya existe
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-700 text-xs">
                          {c.year ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 min-w-[160px]">
                          <SelectField
                            value={kindOverride[idx] ?? c.kind}
                            onChange={(v) =>
                              setKindOverride((p) => ({ ...p, [idx]: v as Candidate["kind"] }))
                            }
                            disabled={!!result}
                            options={[
                              { value: "sustainability_report", label: "Sustentabilidad" },
                              { value: "financial_report", label: "Financiero" },
                            ]}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          {serviceOptions.length > 0 && (
                            <ServiceMultiSelect
                              options={serviceOptions}
                              selected={serviceOverride[idx] ?? []}
                              onChange={(ids) => setServiceOverride((p) => ({ ...p, [idx]: ids }))}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {!result && <span className="text-xs text-slate-500">Pendiente</span>}
                          {result?.ok && (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Ingresado
                            </span>
                          )}
                          {result && !result.ok && (
                            <span className="text-xs text-rose-700 font-semibold" title={result.msg}>
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleSearch()}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Buscar de nuevo
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-700" aria-live="polite">{selected.size} seleccionado{selected.size !== 1 ? "s" : ""}</span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={ingesting}
                  disabled={selected.size === 0}
                  onClick={() => void handleIngest()}
                >
                  Ingestar seleccionados
                </Button>
              </div>
            </div>
          </>
          );
        })()}
      </div>
    </Modal>
  );
}

// Multi-select compacto para servicios (sin <select> nativo — CLAUDE.md §SelectField)
function ServiceMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: ServiceOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const label =
    selected.length === 0
      ? "Todos los servicios"
      : selected.length === 1
      ? (options.find((o) => o.id === selected[0])?.label ?? "1 servicio")
      : `${selected.length} servicios`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 min-w-[120px] justify-between"
      >
        <span className="truncate max-w-[140px]">{label}</span>
        <svg className="w-3 h-3 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-sm min-w-[200px] py-1">
          {options.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
                className="rounded border-slate-300 text-brand-primary"
              />
              {o.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border-t border-slate-100 mt-1"
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// RowActions: Ver inline + kebab dropdown con Servicios/Descargar/Borrar
// Reduce densidad de 4 botones a 2, evita scroll horizontal en tabla.
// ──────────────────────────────────────────────────────────────────────────────
function RowActions({
  doc,
  isAdmin,
  onPreview,
  onEditServices,
  onDownload,
  onDelete,
}: {
  doc: DocMeta;
  isAdmin: boolean;
  onPreview: () => void;
  onEditServices: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => doc.has_content && onPreview()}
        disabled={!doc.has_content}
        className={`text-[11px] px-2 min-h-[40px] inline-flex items-center transition-colors rounded ${
          doc.has_content
            ? "text-brand-primary-dark hover:underline"
            : "text-slate-300 cursor-default"
        }`}
        title={doc.has_content ? "Ver Markdown extraído" : "Sin contenido extraído"}
      >
        Ver
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Más acciones"
        aria-expanded={open}
        className="min-h-[40px] min-w-[32px] inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        title="Más acciones"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded shadow-sm min-w-[160px] py-1">
          <button
            type="button"
            onClick={() => { onEditServices(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            Servicios
          </button>
          <button
            type="button"
            onClick={() => { onDownload(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
          >
            Descargar
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 border-t border-slate-100"
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const previewFetcher = (url: string): Promise<{ data: { markdown_content: string | null } }> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as unknown as { data: { markdown_content: string | null } };
  });

function PreviewModal({ clientId, doc, onClose }: { clientId: string; doc: DocMeta; onClose: () => void }) {
  const { data, error, isLoading } = useSWR<{ data: { markdown_content: string | null } }>(
    `/api/clients/${clientId}/documents/${doc.id}?mode=content`,
    previewFetcher
  );
  return (
    <Modal open onClose={onClose} title={`Vista previa: ${doc.file_name}`}>
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Markdown extraído · {doc.file_type.toUpperCase()} · {(doc.size_bytes / 1024).toFixed(0)} KB
        </p>
        {isLoading && <p className="text-sm text-slate-600">Cargando contenido…</p>}
        {error && <p className="text-sm text-rose-700">Error al cargar contenido</p>}
        {data && (
          <pre className="font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words">
            {data.data.markdown_content ?? "(sin contenido)"}
          </pre>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-900">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}
