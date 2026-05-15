"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface TerminologySynonym {
  id: string;
  responsable_term: string;
  category: string;
  synonyms_es: string[];
  synonyms_en: string[];
  active: boolean;
  sort_order: number;
}

const CATEGORIES = [
  "materialidad",
  "gobierno",
  "ambiental",
  "social",
  "reporte",
  "certificaciones",
  "general",
];

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function TagList({
  tags,
  onRemove,
}: {
  tags: string[];
  onRemove: (i: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
      {tags.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-sm px-2 py-0.5"
        >
          {t}
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="text-slate-400 hover:text-slate-700 leading-none"
            aria-label={`Quitar "${t}"`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <TagList tags={value} onRemove={(i) => onChange(value.filter((_, j) => j !== i))} />
      <div className="flex gap-1.5">
        <input
          className="font-sans flex-1 text-sm border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          value={draft}
          placeholder={placeholder ?? "Agregar término…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            }
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => addTag(draft)} type="button">
          +
        </Button>
      </div>
      <p className="text-[10px] text-slate-400">Enter o coma para agregar</p>
    </div>
  );
}

type FormState = {
  responsable_term: string;
  category: string;
  synonyms_es: string[];
  synonyms_en: string[];
  active: boolean;
};

const EMPTY_FORM: FormState = {
  responsable_term: "",
  category: "general",
  synonyms_es: [],
  synonyms_en: [],
  active: true,
};

export function GlosarioManager() {
  const toast = useToast();
  const { data, isLoading, error, mutate } = useSWR<TerminologySynonym[]>(
    "/api/configuracion/glosario",
    fetcher
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TerminologySynonym | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<TerminologySynonym | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(t: TerminologySynonym) {
    setEditing(t);
    setForm({
      responsable_term: t.responsable_term,
      category: t.category,
      synonyms_es: [...t.synonyms_es],
      synonyms_en: [...t.synonyms_en],
      active: t.active,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function suggestSynonyms() {
    if (!form.responsable_term.trim()) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/configuracion/glosario/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: form.responsable_term }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { synonyms_es?: string[]; synonyms_en?: string[] };
      const newEs = (j.synonyms_es ?? []).filter((s) => !form.synonyms_es.includes(s));
      const newEn = (j.synonyms_en ?? []).filter((s) => !form.synonyms_en.includes(s));
      setForm((f) => ({
        ...f,
        synonyms_es: [...f.synonyms_es, ...newEs],
        synonyms_en: [...f.synonyms_en, ...newEn],
      }));
      if (newEs.length + newEn.length === 0) {
        toast.push("info", "Sin sinónimos nuevos que agregar");
      } else {
        toast.push("success", `${newEs.length + newEn.length} sinónimos sugeridos`);
      }
    } catch {
      toast.push("error", "Error al sugerir sinónimos");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSave() {
    if (!form.responsable_term.trim() || !form.category) return;
    setSaving(true);
    try {
      const method = editing ? "PATCH" : "POST";
      const body = editing
        ? { id: editing.id, ...form }
        : form;
      const res = await fetch("/api/configuracion/glosario", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.push("success", editing ? "Término actualizado" : "Término agregado");
      void mutate();
      closeModal();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TerminologySynonym) {
    setDeleting(null);
    try {
      const res = await fetch(`/api/configuracion/glosario?id=${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.push("success", "Término eliminado");
      void mutate();
    } catch {
      toast.push("error", "Error al eliminar");
    }
  }

  async function toggleActive(t: TerminologySynonym) {
    try {
      const res = await fetch("/api/configuracion/glosario", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, active: !t.active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void mutate();
    } catch {
      toast.push("error", "Error al actualizar");
    }
  }

  const terms = data ?? [];

  if (isLoading) return <SkeletonTable rows={6} cols={4} />;
  if (error) {
    return (
      <div className="p-4 border border-rose-200 bg-rose-50 rounded text-sm text-rose-700">
        No se pudo cargar.{" "}
        <button onClick={() => mutate()} className="underline">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Glosario de terminología</h2>
          <p className="mt-0.5 text-xs text-slate-500 max-w-xl">
            Define los términos oficiales de ResponSable y sus sinónimos en español e inglés.
            La IA los usa para reconocer vocabulario de clientes y mercado en documentos y reportes.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openNew}>
          + Agregar término
        </Button>
      </div>

      {/* Tabla */}
      {terms.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded p-8 text-center">
          <p className="text-sm text-slate-500">Sin términos. Agrega el primero.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full w-max">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2 min-w-[160px]">
                  Término ResponSable
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">
                  Categoría
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2 min-w-[200px]">
                  Sinónimos ES
                </th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2 min-w-[200px]">
                  Sinónimos EN
                </th>
                <th className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">
                  Activo
                </th>
                <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terms.map((t) => (
                <tr
                  key={t.id}
                  className={`hover:bg-slate-50/70 transition-colors ${!t.active ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-slate-900">{t.responsable_term}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] font-bold uppercase rounded-sm px-1.5 py-0.5 bg-slate-100 text-slate-600">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.synonyms_es.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        t.synonyms_es.map((s, i) => (
                          <span
                            key={i}
                            className="text-[10px] rounded-sm px-1.5 py-0.5 bg-teal-50 text-teal-800 border border-teal-200"
                          >
                            {s}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.synonyms_en.length === 0 ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        t.synonyms_en.map((s, i) => (
                          <span
                            key={i}
                            className="text-[10px] rounded-sm px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200"
                          >
                            {s}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => void toggleActive(t)}
                      title={t.active ? "Desactivar" : "Activar"}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/30 ${
                        t.active ? "bg-brand-primary" : "bg-slate-200"
                      }`}
                      role="switch"
                      aria-checked={t.active}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform ${
                          t.active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(t)}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        Borrar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear / editar */}
      {modalOpen && (
        <Modal
          open
          onClose={closeModal}
          title={editing ? "Editar término" : "Agregar término al glosario"}
          size="lg"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="secondary" size="sm" onClick={closeModal}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                disabled={!form.responsable_term.trim()}
                onClick={() => void handleSave()}
              >
                {editing ? "Guardar cambios" : "Agregar"}
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Término + botón sugerir */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Término ResponSable{" "}
                <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={form.responsable_term}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, responsable_term: e.target.value }))
                    }
                    placeholder="ej. Doble materialidad"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={suggesting}
                  disabled={!form.responsable_term.trim()}
                  onClick={() => void suggestSynonyms()}
                  title="La IA sugiere sinónimos en ES e EN para este término"
                >
                  Sugerir con IA ✨
                </Button>
              </div>
              <p className="text-[10px] text-slate-400">
                El nombre oficial que usa ResponSable en su metodología y reportes.
              </p>
            </div>

            {/* Categoría */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Categoría</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: c }))}
                    className={`text-[11px] font-medium rounded-sm border px-2.5 py-1 transition-colors ${
                      form.category === c
                        ? "bg-brand-primary-light border-brand-primary/30 text-brand-primary-dark"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Sinónimos ES */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Sinónimos en español{" "}
                <span className="text-slate-400 font-normal">
                  — cómo lo llaman las empresas y el mercado
                </span>
              </label>
              <TagInput
                value={form.synonyms_es}
                onChange={(v) => setForm((f) => ({ ...f, synonyms_es: v }))}
                placeholder="ej. Análisis de materialidad, Temas relevantes…"
              />
            </div>

            {/* Sinónimos EN */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Sinónimos en inglés{" "}
                <span className="text-slate-400 font-normal">— equivalentes en inglés</span>
              </label>
              <TagInput
                value={form.synonyms_en}
                onChange={(v) => setForm((f) => ({ ...f, synonyms_en: v }))}
                placeholder="ej. Materiality assessment, Material topics…"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm eliminar */}
      {deleting && (
        <ConfirmModal
          open
          title="Eliminar término"
          description={`Se eliminará "${deleting.responsable_term}" y todos sus sinónimos del glosario. La IA dejará de reconocerlos.`}
          tone="destructive"
          confirmLabel="Eliminar"
          onConfirm={async () => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
