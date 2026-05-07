"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SelectField } from "@/components/ui/SelectField";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

type Consultor = {
  id: string;
  client_id: string;
  user_email: string;
  seniority_level: string | null;
  assigned_at: string;
  assigned_by: string | null;
  full_name: string | null;
  user_seniority_level: string | null;
};

type UserOption = {
  email: string;
  full_name: string | null;
  seniority_level: string | null;
};

type SeniorityItem = { value: string; label: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const seniorityFetcher = (url: string): Promise<SeniorityItem[]> =>
  fetch(url)
    .then((r) => r.json())
    .then((j) =>
      (j.data ?? []).map((i: { value: string; label: string }) => ({
        value: i.value,
        label: i.label,
      }))
    );

function seniorityLabel(
  value: string | null,
  items: SeniorityItem[]
): string {
  if (!value) return "—";
  return items.find((s) => s.value === value)?.label ?? value;
}

export function TeamTab({
  clientId,
  isAdmin,
}: {
  clientId: string;
  isAdmin: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ data: Consultor[] }>(
    `/api/clients/${clientId}/consultors`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: seniorityItems = [] } = useSWR<SeniorityItem[]>(
    "/api/catalogs?category=seniority_levels",
    seniorityFetcher,
    { revalidateOnFocus: false }
  );

  const [assigning, setAssigning] = useState(false);
  const [editTarget, setEditTarget] = useState<Consultor | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Consultor | null>(null);
  const { push } = useToast();

  const consultors = data?.data ?? [];
  const hasAnyOverride = consultors.some((c) => c.seniority_level !== null);
  const hasAnyGlobalSeniority = consultors.some((c) => c.user_seniority_level !== null);

  async function handleRemove() {
    if (!removeTarget) return;
    const res = await fetch(
      `/api/clients/${clientId}/consultors/${encodeURIComponent(removeTarget.user_email)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      push("success", `${removeTarget.full_name ?? removeTarget.user_email} removido del equipo`);
      mutate();
    } else {
      const j = await res.json().catch(() => ({}));
      push("error", j.error ?? "Error al remover");
    }
    setRemoveTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {consultors.length} {consultors.length === 1 ? "consultor asignado" : "consultores asignados"}
        </p>
        {isAdmin && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            + Asignar consultor
          </Button>
        )}
      </div>

      {error && (
        <div className="text-sm text-brand-berry bg-brand-berry/5 border border-brand-berry/20 rounded p-3 mb-4">
          Error al cargar equipo: {(error as Error).message}
        </div>
      )}

      {isLoading && <SkeletonTable rows={3} cols={4} />}

      {!isLoading && consultors.length === 0 && (
        <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded">
          Sin consultores asignados a este cliente.
          {isAdmin && (
            <button
              onClick={() => setAssigning(true)}
              className="block mx-auto mt-2 text-brand-primary text-xs hover:underline"
            >
              Asignar ahora →
            </button>
          )}
        </div>
      )}

      {!isLoading && consultors.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full w-max text-sm">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6">Consultor</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6">Email</th>
                <th
                  className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6"
                  title="Nivel del consultor para este proyecto específico (sobreescribe el nivel global cuando está definido)"
                >
                  Nivel en proyecto
                </th>
                {hasAnyOverride && hasAnyGlobalSeniority && (
                  <th
                    className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6"
                    title="Nivel del consultor en todos los proyectos (default cuando no hay override)"
                  >
                    Nivel global
                  </th>
                )}
                <th className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2 pr-6">Asignado</th>
                {isAdmin && <th className="text-right text-[10px] font-bold uppercase tracking-widest text-slate-400 pb-2">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consultors.map((c) => (
                <tr key={c.user_email} className="even:bg-slate-50/60 hover:bg-brand-primary-light/30 transition-colors">
                  <td className="py-2 pr-6 font-medium text-slate-900">
                    {c.full_name ?? <span className="text-slate-400 font-normal">—</span>}
                  </td>
                  <td className="py-2 pr-6 font-mono text-xs text-slate-600">
                    {c.user_email}
                  </td>
                  <td className="py-2 pr-6">
                    {c.seniority_level ? (
                      <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm bg-brand-primary-light text-brand-primary-dark">
                        {seniorityLabel(c.seniority_level, seniorityItems)}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Usa global</span>
                    )}
                  </td>
                  {hasAnyOverride && hasAnyGlobalSeniority && (
                    <td className="py-2 pr-6">
                      <span className="text-xs text-slate-600">
                        {seniorityLabel(c.user_seniority_level, seniorityItems)}
                      </span>
                    </td>
                  )}
                  <td className="py-2 pr-6 text-xs text-slate-500 tabular-nums">
                    {new Date(c.assigned_at).toLocaleDateString("es-MX")}
                    {c.assigned_by && (
                      <span className="ml-1 text-slate-400">
                        · {c.assigned_by.split("@")[0]}
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setEditTarget(c)}
                        className="px-2.5 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded min-w-[40px] min-h-[40px] inline-flex items-center justify-center transition-colors"
                        title="Cambiar nivel en este proyecto"
                        aria-label={`Editar nivel de ${c.full_name ?? c.user_email}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRemoveTarget(c)}
                        className="px-2.5 py-2 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded ml-1 min-w-[40px] min-h-[40px] inline-flex items-center justify-center transition-colors"
                        title="Remover del proyecto"
                        aria-label={`Remover a ${c.full_name ?? c.user_email} del proyecto`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assigning && (
        <AssignModal
          clientId={clientId}
          seniorityItems={seniorityItems}
          existingEmails={consultors.map((c) => c.user_email)}
          onClose={() => setAssigning(false)}
          onSaved={() => {
            setAssigning(false);
            mutate();
          }}
        />
      )}

      {editTarget && (
        <EditSeniorityModal
          clientId={clientId}
          consultor={editTarget}
          seniorityItems={seniorityItems}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            mutate();
          }}
        />
      )}

      <ConfirmModal
        open={removeTarget !== null}
        title={`Remover ${removeTarget?.full_name ?? removeTarget?.user_email ?? ""}`}
        description="Se quitará del equipo de este cliente. El consultor conserva acceso a la app y a otros clientes."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function AssignModal({
  clientId,
  seniorityItems,
  existingEmails,
  onClose,
  onSaved,
}: {
  clientId: string;
  seniorityItems: SeniorityItem[];
  existingEmails: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: usersData } = useSWR<{ data: UserOption[] }>("/api/users", fetcher);
  const available = (usersData?.data ?? []).filter(
    (u) => !existingEmails.includes(u.email)
  );

  const [selectedEmail, setSelectedEmail] = useState("");
  const [seniorityLevel, setSeniorityLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!selectedEmail) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/consultors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: selectedEmail,
          seniority_level: seniorityLevel || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al asignar");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de conexión");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title="Asignar consultor"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!selectedEmail || available.length === 0}
            title={!selectedEmail ? "Selecciona un consultor para continuar" : undefined}
          >
            Asignar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="assign-email-select" className="text-sm font-medium text-slate-700">
            Consultor <span className="text-rose-500">*</span>
          </label>
          {available.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todos los consultores ya están asignados a este cliente.
            </p>
          ) : (
            <SelectField
              id="assign-email-select"
              value={selectedEmail}
              onChange={setSelectedEmail}
              options={available.map((u) => ({
                value: u.email,
                label: u.full_name ? `${u.full_name} (${u.email})` : u.email,
              }))}
              placeholder="— Selecciona un consultor —"
            />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="assign-seniority-select" className="text-sm font-medium text-slate-700">
            Nivel en este proyecto
          </label>
          <SelectField
            id="assign-seniority-select"
            value={seniorityLevel}
            onChange={setSeniorityLevel}
            options={seniorityItems}
            placeholder="— Usar nivel global del consultor —"
          />
          <p className="text-xs text-slate-500">
            Opcional. Si no se elige, se muestra el nivel global del consultor.
          </p>
        </div>
        {error && (
          <div role="alert" className="text-sm text-brand-berry bg-brand-berry/5 border border-brand-berry/20 rounded p-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function EditSeniorityModal({
  clientId,
  consultor,
  seniorityItems,
  onClose,
  onSaved,
}: {
  clientId: string;
  consultor: Consultor;
  seniorityItems: SeniorityItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [seniorityLevel, setSeniorityLevel] = useState(
    consultor.seniority_level ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/consultors/${encodeURIComponent(consultor.user_email)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seniority_level: seniorityLevel || null }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al guardar");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de conexión");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={`Nivel de ${consultor.full_name ?? consultor.user_email}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="edit-seniority-select" className="text-sm font-medium text-slate-700">
            Nivel en este proyecto
          </label>
          <SelectField
            id="edit-seniority-select"
            value={seniorityLevel}
            onChange={setSeniorityLevel}
            options={seniorityItems}
            placeholder="— Usar nivel global del consultor —"
          />
          <p className="text-xs text-slate-500">
            Nivel global de {consultor.full_name ?? consultor.user_email}:{" "}
            <strong>
              {seniorityLabel(consultor.user_seniority_level, seniorityItems)}
            </strong>
          </p>
        </div>
        {error && (
          <div role="alert" className="text-sm text-brand-berry bg-brand-berry/5 border border-brand-berry/20 rounded p-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
