"use client";

import { Fragment, useRef, useState } from "react";
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
  service_tag: string | null;
  created_at: string;
  updated_at: string;
};

// Etiquetas de servicio — se muestran como badge secundario cuando está asignado
const SERVICE_TAG_OPTIONS: { value: string; label: string }[] = [
  { value: "doble_materialidad_ia", label: "Doble Materialidad IA" },
  { value: "reporte_gri",           label: "Reporte GRI" },
  { value: "diagnostico_rse",       label: "Diagnóstico RSE" },
  { value: "estrategia_rse",        label: "Estrategia RSE" },
];
const SERVICE_TAG_LABEL: Record<string, string> = Object.fromEntries(
  SERVICE_TAG_OPTIONS.map((o) => [o.value, o.label])
);

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

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: DocMeta[] }>;
  });

export function DocumentsTab({
  clientId,
  isAdmin,
}: {
  clientId: string;
  isAdmin: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ data: DocMeta[] }>(
    `/api/clients/${clientId}/documents`,
    fetcher
  );
  const [filter, setFilter] = useState<"all" | DocMeta["kind"]>("all");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<DocMeta | null>(null);
  const [previewing, setPreviewing] = useState<DocMeta | null>(null);
  const [uploadServiceTag, setUploadServiceTag] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const docs = data?.data ?? [];
  const filtered = filter === "all" ? docs : docs.filter((d) => d.kind === filter);

  const counts = {
    all: docs.length,
    general: docs.filter((d) => d.kind === "general").length,
    sustainability_report: docs.filter((d) => d.kind === "sustainability_report").length,
    financial_report: docs.filter((d) => d.kind === "financial_report").length,
  };

  async function handleUpload(files: FileList) {
    setUploading(true);
    let okCount = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "general");
      if (uploadServiceTag) fd.append("service_tag", uploadServiceTag);
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

  // Filtros de categoría — solo mostrar las que tienen al menos 1 documento
  const filterOptions = [
    { k: "all" as const, label: `Todos (${counts.all})` },
    ...(counts.general > 0 ? [{ k: "general" as const, label: `General (${counts.general})` }] : []),
    ...(counts.sustainability_report > 0 ? [{ k: "sustainability_report" as const, label: `Sustentabilidad (${counts.sustainability_report})` }] : []),
    ...(counts.financial_report > 0 ? [{ k: "financial_report" as const, label: `Financiero (${counts.financial_report})` }] : []),
  ];

  return (
    <div className="px-1">
      {/* Header con upload */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Documentos del cliente
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {docs.length} archivo{docs.length === 1 ? "" : "s"} · convertidos a Markdown como contexto IA
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            PDF, DOCX, XLSX, PPTX, TXT · Máx. 25 MB por archivo
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de servicio (opcional) — aplica al próximo archivo subido */}
          <SelectField
            value={uploadServiceTag}
            onChange={setUploadServiceTag}
            options={SERVICE_TAG_OPTIONS}
            placeholder="Sin servicio"
            className="text-xs"
          />
          <Button
            variant="primary"
            size="sm"
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Filtros por kind — solo categorías con documentos */}
      {docs.length > 0 && filterOptions.length > 1 && (
        <div className="flex gap-1.5 mb-3">
          {filterOptions.map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFilter(f.k)}
              className={`text-[11px] font-medium rounded-sm border px-2 py-1 transition-colors ${
                filter === f.k
                  ? "bg-brand-primary border-brand-primary text-white"
                  : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tipo</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Nombre</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Categoría</th>
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
                  <tr className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 rounded-sm px-1.5 py-0.5">
                        {TYPE_BADGE[d.file_type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-800 font-medium max-w-[280px] truncate">
                      {d.file_name}
                      {d.source_url && (
                        <a
                          href={d.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[10px] text-slate-400 hover:underline truncate"
                        >
                          ↗ {d.source_url}
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold uppercase rounded-sm px-1.5 py-0.5 ${KIND_COLOR[d.kind]}`}>
                        {KIND_LABEL[d.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {d.service_tag ? (
                        <span className="text-[10px] font-semibold rounded-sm px-1.5 py-0.5 bg-brand-primary-light/40 text-brand-primary-dark whitespace-nowrap">
                          {SERVICE_TAG_LABEL[d.service_tag] ?? d.service_tag}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 text-right tabular-nums">
                      {formatSize(d.size_bytes)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 tabular-nums">
                      {new Date(d.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-3 py-2.5">
                      {d.parse_status === "ok" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Convertido
                        </span>
                      )}
                      {d.parse_status === "pending" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold">
                          <svg className="w-3.5 h-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Procesando
                        </span>
                      )}
                      {d.parse_status === "failed" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 font-semibold">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          Falló
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => d.has_content ? setPreviewing(d) : undefined}
                          disabled={!d.has_content}
                          className={`text-[11px] px-2 min-h-[40px] inline-flex items-center transition-colors rounded ${
                            d.has_content
                              ? "text-brand-primary-dark hover:underline"
                              : "text-slate-300 cursor-default"
                          }`}
                          title={d.has_content ? "Ver Markdown" : "Sin contenido extraído"}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownload(d)}
                          className="text-[11px] text-slate-600 hover:text-slate-900 hover:underline px-2 min-h-[40px] inline-flex items-center rounded transition-colors"
                          title="Descargar original"
                        >
                          Descargar
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleting(d)}
                            className="text-[11px] text-rose-600 hover:underline px-2 min-h-[40px] inline-flex items-center rounded transition-colors"
                            title="Eliminar (solo admin)"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Error expandido inline — visible cuando parse falló */}
                  {d.parse_status === "failed" && d.parse_error && (
                    <tr className="bg-rose-50/50">
                      <td colSpan={8} className="px-3 py-2 text-[11px] text-rose-700">
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
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          Markdown extraído · {doc.file_type.toUpperCase()} · {(doc.size_bytes / 1024).toFixed(0)} KB
        </p>
        {isLoading && <p className="text-sm text-slate-500">Cargando contenido…</p>}
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
