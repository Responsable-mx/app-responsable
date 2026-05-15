"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  VocabularyReviewModal,
  type VocabProposal,
} from "@/components/documents/VocabularyReviewModal";

interface ClientVocabEntry {
  id: string;
  client_term: string;
  responsable_term: string;
  active: boolean;
  created_at: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

interface Props {
  clientId: string;
}

export function VocabularySection({ clientId }: Props) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<ClientVocabEntry[]>(
    `/api/clients/${clientId}/vocabulary`,
    fetcher
  );

  const [extracting, setExtracting] = useState(false);
  const [proposals, setProposals] = useState<VocabProposal[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ client_term: "", responsable_term: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [deleting, setDeleting] = useState<ClientVocabEntry | null>(null);

  const vocab = data ?? [];

  async function handleExtract() {
    setExtracting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/vocabulary/extract`, {
        method: "POST",
      });
      const j = (await res.json()) as { proposals?: VocabProposal[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setProposals(j.proposals ?? []);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al analizar documentos");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSaveProposals(accepted: VocabProposal[]) {
    let ok = 0;
    for (const p of accepted) {
      try {
        const res = await fetch(`/api/clients/${clientId}/vocabulary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_term: p.client_term,
            responsable_term: p.responsable_term,
          }),
        });
        if (res.ok) ok++;
      } catch {
        // continue
      }
    }
    if (ok > 0) {
      toast.push("success", `${ok} término${ok !== 1 ? "s" : ""} guardado${ok !== 1 ? "s" : ""}`);
      void mutate();
    } else {
      toast.push("error", "No se pudo guardar ningún término");
    }
    setProposals(null);
  }

  async function handleAddManual() {
    if (!addForm.client_term.trim() || !addForm.responsable_term.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/vocabulary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.push("success", "Término agregado");
      void mutate();
      setAddOpen(false);
      setAddForm({ client_term: "", responsable_term: "" });
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setAddSaving(false);
    }
  }

  async function handleToggle(entry: ClientVocabEntry) {
    try {
      const res = await fetch(`/api/clients/${clientId}/vocabulary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vocabId: entry.id, active: !entry.active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void mutate();
    } catch {
      toast.push("error", "Error al actualizar");
    }
  }

  async function handleDelete(entry: ClientVocabEntry) {
    setDeleting(null);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/vocabulary?vocabId=${entry.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push("success", "Término eliminado");
      void mutate();
    } catch {
      toast.push("error", "Error al eliminar");
    }
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      {/* Header sección */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Vocabulario del cliente
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-400 max-w-md">
            Términos propios que usa esta empresa — la IA los reconoce al leer documentos y los
            usa al generar reportes.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            loading={extracting}
            onClick={() => void handleExtract()}
            title="Analiza los documentos subidos y propone términos equivalentes"
          >
            <svg
              className="w-3.5 h-3.5 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            Extraer vocabulario
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            + Agregar
          </Button>
        </div>
      </div>

      {/* Tabla vocabulario */}
      {isLoading ? (
        <SkeletonList items={3} />
      ) : vocab.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded p-5 text-center">
          <p className="text-xs text-slate-400">
            Sin vocabulario registrado. Usa &ldquo;Extraer vocabulario&rdquo; para que la IA
            analice los documentos, o agrega términos manualmente.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded bg-white overflow-x-auto">
          <table className="min-w-full w-max">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2 min-w-[160px]">
                  El cliente dice
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2 min-w-[160px]">
                  Equivale a
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2">
                  Agregado
                </th>
                <th className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2">
                  Activo
                </th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 py-2">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vocab.map((entry) => (
                <tr
                  key={entry.id}
                  className={`hover:bg-slate-50/70 transition-colors ${!entry.active ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-slate-900">
                      {entry.client_term}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm text-slate-700">{entry.responsable_term}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 tabular-nums">
                    {new Date(entry.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => void handleToggle(entry)}
                      className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${
                        entry.active ? "bg-brand-primary" : "bg-slate-200"
                      }`}
                      role="switch"
                      aria-checked={entry.active}
                      title={entry.active ? "Desactivar" : "Activar"}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                          entry.active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setDeleting(entry)}
                      className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal agregar manual */}
      {addOpen && (
        <Modal
          open
          onClose={() => { setAddOpen(false); setAddForm({ client_term: "", responsable_term: "" }); }}
          title="Agregar término manualmente"
          size="md"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={addSaving}
                disabled={!addForm.client_term.trim() || !addForm.responsable_term.trim()}
                onClick={() => void handleAddManual()}
              >
                Agregar
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                ¿Cómo lo llama el cliente?{" "}
                <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <Input
                value={addForm.client_term}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, client_term: e.target.value }))
                }
                placeholder="ej. Análisis de riesgos ESG"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                ¿A qué equivale en la terminología de ResponSable?{" "}
                <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <Input
                value={addForm.responsable_term}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, responsable_term: e.target.value }))
                }
                placeholder="ej. Doble materialidad"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Modal revisar propuestas IA */}
      {proposals !== null && (
        <VocabularyReviewModal
          proposals={proposals}
          onSave={handleSaveProposals}
          onClose={() => setProposals(null)}
        />
      )}

      {/* Confirm borrar */}
      {deleting && (
        <ConfirmModal
          open
          title="Eliminar término"
          description={`Se eliminará "${deleting.client_term}" del vocabulario del cliente.`}
          tone="destructive"
          confirmLabel="Eliminar"
          onConfirm={async () => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
