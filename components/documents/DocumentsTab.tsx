"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
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
  created_at: string;
  updated_at: string;
};

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

  if (isLoading) return <div className="p-6 text-sm text-slate-500">Cargando documentos…</div>;
  if (error) {
    return (
      <div className="p-6 border border-rose-200 bg-rose-50 rounded text-sm text-rose-700">
        No se pudo cargar la lista. <button onClick={() => mutate()} className="underline">Reintentar</button>
      </div>
    );
  }

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
        </div>
        <div>
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

      {/* Filtros por kind — solo si hay documentos */}
      {docs.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {([
            { k: "all" as const, label: `Todos (${counts.all})` },
            { k: "general" as const, label: `General (${counts.general})` },
            { k: "sustainability_report" as const, label: `Sustentabilidad (${counts.sustainability_report})` },
            { k: "financial_report" as const, label: `Financiero (${counts.financial_report})` },
          ]).map((f) => (
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
              ? 'Sin documentos. Sube tu primer archivo con el botón "Subir archivo".'
              : "Sin resultados para este filtro."}
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded bg-white shadow-sm overflow-hidden">
          <table className="min-w-full w-max">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tipo</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Nombre</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Categoría</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Tamaño</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Fecha</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Estado</th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
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
                  <td className="px-3 py-2.5 text-xs text-slate-600 text-right tabular-nums">
                    {(d.size_bytes / 1024).toFixed(0)} KB
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 tabular-nums">
                    {new Date(d.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2.5">
                    {d.parse_status === "ok" && (
                      <span className="text-[10px] text-emerald-700 font-semibold">✓ Convertido</span>
                    )}
                    {d.parse_status === "pending" && (
                      <span className="text-[10px] text-amber-700 font-semibold">… Procesando</span>
                    )}
                    {d.parse_status === "failed" && (
                      <span title={d.parse_error ?? ""} className="text-[10px] text-rose-700 font-semibold">
                        ⚠ Falló
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {d.has_content && (
                        <button
                          type="button"
                          onClick={() => setPreviewing(d)}
                          className="text-[11px] text-brand-primary-dark hover:underline px-1"
                          title="Ver Markdown"
                        >
                          Ver
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDownload(d)}
                        className="text-[11px] text-slate-600 hover:text-slate-900 hover:underline px-1"
                        title="Descargar original"
                      >
                        Descargar
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeleting(d)}
                          className="text-[11px] text-rose-600 hover:underline px-1"
                          title="Eliminar (solo admin)"
                        >
                          Borrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
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

const previewFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as { data: { markdown_content: string | null } };
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
          <pre className="font-mono text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 max-h-[450px] overflow-y-auto whitespace-pre-wrap break-words">
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
