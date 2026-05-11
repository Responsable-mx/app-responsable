"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import type { DocMeta } from "@/components/documents/doc-types";

const previewFetcher = (url: string): Promise<{ data: { markdown_content: string | null } }> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as unknown as { data: { markdown_content: string | null } };
  });

export function PreviewModal({ clientId, doc, onClose }: { clientId: string; doc: DocMeta; onClose: () => void }) {
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
