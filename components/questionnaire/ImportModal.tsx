"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type DocMeta = {
  id: string;
  file_name: string;
  file_type: "pdf" | "docx" | "pptx" | "xlsx" | "txt" | "md";
  kind: "general" | "sustainability_report" | "financial_report";
  size_bytes: number;
  parse_status: "pending" | "ok" | "failed";
  parse_error: string | null;
  has_content: boolean;
  created_at: string;
};

const KIND_LABEL: Record<DocMeta["kind"], string> = {
  general: "General",
  sustainability_report: "Informe sustentabilidad",
  financial_report: "Informe financiero",
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

type Tab = "paste" | "upload" | "library";

export function ImportModal({
  open,
  onClose,
  clientId,
  stepTitle,
  onExtract,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  stepTitle: string;
  // Llamado con el texto/markdown a procesar via doc-fill
  onExtract: (text: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState<"general" | "sustainability_report" | "financial_report">("sustainability_report");
  const [extracting, setExtracting] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const { data: docsData, mutate: mutateDocs, error: docsError } = useSWR<{ data: DocMeta[] }>(
    open ? `/api/clients/${clientId}/documents` : null,
    fetcher
  );
  const docs = docsData?.data ?? [];

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset al cerrar; open viene de prop, sin loop
      setPasteText("");
      setSelectedDocIds(new Set());
      setTab("paste");
      setUploadKind("sustainability_report");
    }
  }, [open]);

  async function handleUpload(files: FileList) {
    setUploading(true);
    let okCount = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", uploadKind);
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
    void mutateDocs();
    if (okCount > 0 && failures.length === 0) {
      toast.push("success", `${okCount} archivo(s) subidos y convertidos`);
    } else if (okCount > 0 && failures.length > 0) {
      toast.push("warning", `${okCount} OK · ${failures.length} fallaron`);
    } else {
      toast.push("error", failures[0] ?? "Error subiendo archivos");
    }
    if (okCount > 0) setTab("library");
  }

  async function fetchDocContent(docId: string): Promise<string | null> {
    const res = await fetch(`/api/clients/${clientId}/documents/${docId}?mode=content`);
    if (!res.ok) return null;
    const j = (await res.json()) as { data: { markdown_content: string | null } };
    return j.data.markdown_content;
  }

  async function handleExtractFromPaste() {
    if (pasteText.trim().length < 10) return;
    setExtracting(true);
    try {
      await onExtract(pasteText);
    } finally {
      setExtracting(false);
    }
  }

  async function handleExtractFromLibrary() {
    if (selectedDocIds.size === 0) return;
    setExtracting(true);
    try {
      const parts: string[] = [];
      for (const id of Array.from(selectedDocIds)) {
        const md = await fetchDocContent(id);
        const doc = docs.find((d) => d.id === id);
        if (md) {
          parts.push(`# ${doc?.file_name ?? id}\n\n${md}`);
        }
      }
      const combined = parts.join("\n\n---\n\n");
      if (combined.trim().length === 0) {
        toast.push("error", "Los documentos seleccionados no tienen contenido extraíble");
        return;
      }
      // Tope de 50k chars del endpoint doc-fill
      const sliced = combined.slice(0, 50_000);
      await onExtract(sliced);
    } finally {
      setExtracting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Importar para "${stepTitle}"`}>
      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4 -mt-2">
        {([
          { k: "paste", label: "Pegar texto" },
          { k: "upload", label: "Subir archivo" },
          { k: "library", label: `Mis documentos${docs.length > 0 ? ` (${docs.length})` : ""}` },
        ] as { k: Tab; label: string }[]).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              tab === t.k
                ? "text-brand-primary-dark border-b-2 border-brand-primary -mb-px"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Pega transcripción, notas o datos copiados. Aurora extraerá los campos relevantes.
          </p>
          <textarea
            className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 resize-y min-h-[180px] max-h-[400px]"
            placeholder="Pega aquí…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            disabled={extracting}
          />
          <p className="text-[10px] text-slate-400 tabular-nums">
            {pasteText.length.toLocaleString()} / 50,000 chars
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-800"
              disabled={extracting}
            >
              Cancelar
            </button>
            <Button
              variant="primary"
              size="md"
              loading={extracting}
              disabled={pasteText.trim().length < 10 || pasteText.length > 50_000}
              onClick={handleExtractFromPaste}
            >
              Extraer y llenar
            </Button>
          </div>
        </div>
      )}

      {tab === "upload" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Sube PDF, Word, PowerPoint, Excel, TXT o Markdown (máx 25MB cada uno). Se convierten a texto y se guardan en el cliente para referencia futura.
          </p>
          {/* Selector de tipo */}
          <div className="flex gap-2">
            {(
              [
                { k: "sustainability_report", label: "Sustentabilidad" },
                { k: "financial_report", label: "Financiero" },
                { k: "general", label: "General" },
              ] as { k: typeof uploadKind; label: string }[]
            ).map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setUploadKind(opt.k)}
                className={`px-3 py-1.5 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors ${
                  uploadKind === opt.k
                    ? "bg-brand-primary text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">
            {uploadKind === "sustainability_report"
              ? "Informe de sustentabilidad — Aurora lo usará como fuente primaria."
              : uploadKind === "financial_report"
              ? "Informe financiero — Aurora lo usará como fuente primaria."
              : "Documento general — disponible en “Mis documentos” para pegar manualmente."}
          </p>

          <div
            className="border-2 border-dashed border-slate-300 rounded p-6 text-center hover:border-brand-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) void handleUpload(e.dataTransfer.files);
            }}
          >
            <svg className="w-8 h-8 mx-auto mb-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-slate-600">
              Arrastra archivos o <span className="text-brand-primary-dark font-semibold">haz click para seleccionar</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">PDF · DOCX · PPTX · XLSX · TXT · MD</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {uploading && (
            <p className="text-xs text-slate-500 text-center">Subiendo y convirtiendo a Markdown…</p>
          )}
          <div className="flex items-center justify-end">
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {tab === "library" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Selecciona uno o varios documentos del cliente. Aurora usará su contenido para extraer los campos.
          </p>
          {docsError ? (
            <div className="text-center py-6 text-sm text-rose-600">
              Error al cargar documentos. Intenta de nuevo.
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-400">
              Sin documentos. Usa la pestaña &quot;Subir archivo&quot;.
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
              {docs.map((d) => {
                const selected = selectedDocIds.has(d.id);
                const failed = d.parse_status === "failed";
                return (
                  <label
                    key={d.id}
                    className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selected ? "bg-brand-primary/5" : ""
                    } ${failed ? "opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={failed || !d.has_content}
                      onChange={() => toggleSelect(d.id)}
                      className="mt-0.5 accent-brand-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 rounded-sm px-1.5 py-0.5">
                          {TYPE_BADGE[d.file_type]}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 truncate">{d.file_name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-500">{KIND_LABEL[d.kind]}</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500 tabular-nums">{(d.size_bytes / 1024).toFixed(0)} KB</span>
                        <span className="text-[10px] text-slate-400">·</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(d.created_at).toLocaleDateString("es-MX")}
                        </span>
                        {failed && (
                          <span className="text-[10px] text-rose-600 font-medium">
                            · ⚠ {d.parse_error?.slice(0, 40) ?? "parse falló"}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-800"
              disabled={extracting}
            >
              Cancelar
            </button>
            <Button
              variant="primary"
              size="md"
              loading={extracting}
              disabled={selectedDocIds.size === 0}
              onClick={handleExtractFromLibrary}
            >
              Extraer de {selectedDocIds.size} documento{selectedDocIds.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
