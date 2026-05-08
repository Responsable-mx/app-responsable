"use client";

import { useState, useRef, useEffect } from "react";
import useSWR, { mutate } from "swr";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { DmIroConfig } from "@/lib/dm/iros";

// ── AutoTextarea — se ajusta al contenido ────────────────────────────────────
function AutoTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={className}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}

// ── Fetcher ──────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Colores por categoría ────────────────────────────────────────────────────
const CATEGORY_BADGE: Record<string, string> = {
  ambiental:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  social:     "bg-blue-50 text-blue-700 border-blue-200",
  gobernanza: "bg-amber-50 text-amber-700 border-amber-200",
};

const CATEGORY_LABEL: Record<string, string> = {
  ambiental:  "Ambiental",
  social:     "Social",
  gobernanza: "Gobernanza",
};

// ── Form state ───────────────────────────────────────────────────────────────
type EditForm = {
  label:                    string;
  impact_desc:              string;
  risk_desc:                string;
  opportunity_desc:         string;
  questionnaire_field_keys: string; // CSV — se convierte a array al guardar
  is_active:                boolean;
};

function iroToForm(iro: DmIroConfig): EditForm {
  return {
    label:                    iro.label,
    impact_desc:              iro.impact_desc,
    risk_desc:                iro.risk_desc,
    opportunity_desc:         iro.opportunity_desc,
    questionnaire_field_keys: iro.questionnaire_field_keys.join(", "),
    is_active:                iro.is_active,
  };
}

// ── Componente principal ─────────────────────────────────────────────────────
export function IrosManager() {
  const { data, error, isLoading } = useSWR<{ data: DmIroConfig[] }>("/api/iros", fetcher);
  const { push } = useToast();

  const [editing, setEditing] = useState<DmIroConfig | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const iros = data?.data ?? [];

  // Agrupar por categoría
  const byCategory = {
    ambiental:  iros.filter((i) => i.category === "ambiental"),
    social:     iros.filter((i) => i.category === "social"),
    gobernanza: iros.filter((i) => i.category === "gobernanza"),
  };

  function openEdit(iro: DmIroConfig) {
    setEditing(iro);
    setForm(iroToForm(iro));
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
  }

  async function handleSave() {
    if (!editing || !form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/iros/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label:                    form.label.trim(),
          impact_desc:              form.impact_desc.trim(),
          risk_desc:                form.risk_desc.trim(),
          opportunity_desc:         form.opportunity_desc.trim(),
          questionnaire_field_keys: form.questionnaire_field_keys
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          is_active: form.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      push("success", `${editing.esrs_standard} actualizado`);
      void mutate("/api/iros");
      closeEdit();
    } catch (e) {
      push("error", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-l-4 border-l-rose-500 pl-4 py-2 bg-rose-50 rounded-r text-sm text-rose-700">
        Error cargando IROs. Recarga la página.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {(Object.entries(byCategory) as [string, DmIroConfig[]][]).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              {CATEGORY_LABEL[cat] ?? cat}
            </p>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded overflow-hidden">
              {items.map((iro) => (
                <div
                  key={iro.id}
                  className="flex items-start gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                >
                  {/* Estándar + active status */}
                  <div className="flex-shrink-0 w-14 pt-0.5">
                    <span className="text-sm font-bold text-slate-700">{iro.esrs_standard}</span>
                    {!iro.is_active && (
                      <span className="block text-[10px] text-slate-400 mt-0.5">Inactivo</span>
                    )}
                  </div>

                  {/* Label + descripciones */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{iro.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{iro.impact_desc}</p>
                    {iro.questionnaire_field_keys.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {iro.questionnaire_field_keys.map((k) => (
                          <span
                            key={k}
                            className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 rounded-sm px-1.5 py-0.5"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Categoría + editar */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-medium border rounded-sm px-1.5 py-0.5 ${CATEGORY_BADGE[iro.category] ?? ""}`}
                    >
                      {CATEGORY_LABEL[iro.category] ?? iro.category}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(iro)}>
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de edición */}
      {editing && form && (
        <Modal
          open
          onClose={closeEdit}
          title={`${editing.esrs_standard} — ${editing.label}`}
        >
          <div className="space-y-4 min-w-[480px] max-w-lg">
            {/* Label */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Nombre del estándar
              </label>
              <input
                className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>

            {/* Impacto */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Impacto (Empresa → Sociedad)
              </label>
              <AutoTextarea
                className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 min-h-[60px]"
                value={form.impact_desc}
                onChange={(e) => setForm({ ...form, impact_desc: e.target.value })}
              />
            </div>

            {/* Riesgo */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Riesgo (Entorno → Empresa)
              </label>
              <AutoTextarea
                className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 min-h-[44px]"
                value={form.risk_desc}
                onChange={(e) => setForm({ ...form, risk_desc: e.target.value })}
              />
            </div>

            {/* Oportunidad */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Oportunidad (Entorno → Empresa)
              </label>
              <AutoTextarea
                className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 min-h-[44px]"
                value={form.opportunity_desc}
                onChange={(e) => setForm({ ...form, opportunity_desc: e.target.value })}
              />
            </div>

            {/* Campos cuestionario */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Campos del cuestionario vinculados
              </label>
              <input
                className="font-sans w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                placeholder="campo_key1, campo_key2, ..."
                value={form.questionnaire_field_keys}
                onChange={(e) => setForm({ ...form, questionnaire_field_keys: e.target.value })}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Claves separadas por coma. Si el campo tiene respuesta en el cuestionario del cliente, se inyecta como contexto en el prompt de benchmark.
              </p>
            </div>

            {/* Activo */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary/30"
              />
              <span className="text-sm text-slate-700">Activo (incluir en benchmark y reporte)</span>
            </label>

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button size="sm" variant="ghost" onClick={closeEdit} disabled={saving}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={handleSave} loading={saving}>
                Guardar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
