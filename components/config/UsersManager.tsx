"use client";

import { useState } from "react";
import useSWR from "swr";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/SelectField";

type User = {
  email: string;
  role: "admin" | "consultor" | "cliente";
  full_name: string | null;
  active: boolean;
  invited_by: string | null;
  last_login: string | null;
  seniority_level: string | null;
  client_id: string | null;
  created_at: string;
};

type ClientOption = { id: string; name: string };

type SeniorityItem = { value: string; label: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const seniorityFetcher = (url: string): Promise<SeniorityItem[]> =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => (j.data ?? []).map((i: { value: string; label: string }) => ({ value: i.value, label: i.label })));

export function UsersManager() {
  const { data, error, isLoading, mutate } = useSWR<{ data: User[] }>(
    "/api/users",
    fetcher
  );
  const { data: seniorityItems = [] } = useSWR<SeniorityItem[]>(
    "/api/catalogs?category=seniority_levels",
    seniorityFetcher,
    { revalidateOnFocus: false }
  );

  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [feedback, setFeedback] = useState("");

  const users = data?.data ?? [];

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/users/${encodeURIComponent(deleteTarget.email)}`,
      { method: "DELETE" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setFeedback(json.error ?? "Error al eliminar");
    else {
      setFeedback(`Eliminado: ${deleteTarget.email}`);
      mutate();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isLoading ? "—" : users.length} {isLoading ? "usuarios" : users.length === 1 ? "usuario" : "usuarios"}
          </h2>
        </div>
        <Button variant="primary" size="sm" onClick={() => setInviting(true)}>
          + Invitar usuario
        </Button>
      </div>

      {feedback && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded p-2 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback("")} className="text-amber-700 hover:underline">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          Error: {(error as Error).message}
        </div>
      )}

      {isLoading && <SkeletonTable rows={4} cols={5} />}

      {!isLoading && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full w-max text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Rol</th>
                <th className="pb-2 pr-4">Seniority</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2 pr-4">Último login</th>
                <th className="pb-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.email} className="hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                  <td className="py-2 pr-4 text-slate-700">{u.full_name ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm ${
                        u.role === "admin"
                          ? "bg-indigo-50 text-indigo-800"
                          : u.role === "cliente"
                          ? "bg-teal-50 text-teal-800"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {u.seniority_level ? (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm bg-teal-50 text-teal-800">
                        {seniorityItems.find((s) => s.value === u.seniority_level)?.label ?? u.seniority_level}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm ${
                        u.active
                          ? "bg-green-50 text-green-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {u.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-600">
                    {u.last_login ? (
                      new Date(u.last_login).toLocaleDateString("es-MX")
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setEditing(u)}
                      className="text-xs px-3 py-2 text-slate-700 hover:bg-slate-100 rounded min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      className="text-xs px-3 py-2 text-red-700 hover:bg-red-50 rounded ml-1 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                    >
                      ⊗
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(inviting || editing) && (
        <UserEditor
          user={editing}
          seniorityItems={seniorityItems}
          onClose={() => {
            setInviting(false);
            setEditing(null);
          }}
          onSaved={() => {
            setInviting(false);
            setEditing(null);
            mutate();
          }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title={`Eliminar ${deleteTarget?.email ?? ""}`}
        description="Se quita del whitelist. El usuario no podrá iniciar sesión. Sus acciones pasadas (clientes que creó, logs IA) se conservan."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function UserEditor({
  user,
  seniorityItems,
  onClose,
  onSaved,
}: {
  user: User | null;
  seniorityItems: SeniorityItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [role, setRole] = useState<"admin" | "consultor" | "cliente">(user?.role ?? "consultor");
  const [active, setActive] = useState(user?.active ?? true);
  const [seniorityLevel, setSeniorityLevel] = useState(user?.seniority_level ?? "");
  const [clientId, setClientId] = useState(user?.client_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: clientsData } = useSWR<{ data: ClientOption[] }>(
    role === "cliente" ? "/api/clients?limit=500" : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (role === "cliente" && !clientId) {
        setError("Rol cliente requiere seleccionar una empresa.");
        setSaving(false);
        return;
      }
      const payload = user
        ? {
            role,
            active,
            full_name: fullName.trim() || null,
            seniority_level: seniorityLevel || null,
            client_id: role === "cliente" ? clientId : null,
          }
        : {
            email,
            role,
            active,
            full_name: fullName.trim() || null,
            seniority_level: seniorityLevel || null,
            client_id: role === "cliente" ? clientId : null,
          };
      const url = user
        ? `/api/users/${encodeURIComponent(user.email)}`
        : "/api/users";
      const method = user ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      title={user ? "Editar usuario" : "Invitar usuario"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            loading={saving}
            disabled={!email.trim()}
          >
            {user ? "Guardar" : "Invitar"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <Input
          label="Correo *"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={user !== null}
          className="font-mono"
          placeholder="alguien@responsable.net"
          autoFocus={user === null}
        />
        <Input
          label="Nombre completo"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="María López"
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Rol</label>
          <SelectField
            value={role}
            onChange={(v) => setRole(v as "admin" | "consultor" | "cliente")}
            options={[
              { value: "consultor", label: "Consultor · chat IA y clientes" },
              { value: "admin", label: "Admin · además gestiona configuración" },
              { value: "cliente", label: "Cliente · solo ve su propia empresa" },
            ]}
            placeholder="Seleccionar rol"
          />
        </div>

        {role === "cliente" && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Empresa <span className="text-brand-berry">*</span>
            </label>
            <SelectField
              value={clientId}
              onChange={(v) => setClientId(v)}
              options={(clientsData?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
              placeholder="— Seleccionar empresa —"
            />
            <p className="text-xs text-slate-500">
              El usuario solo verá datos de esta empresa.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">
            Nivel de seniority (default)
          </label>
          <SelectField
            value={seniorityLevel}
            onChange={(v) => setSeniorityLevel(v)}
            options={seniorityItems.map((s) => ({ value: s.value, label: s.label }))}
            placeholder="— Sin asignar —"
          />
          <p className="text-xs text-slate-500">
            Nivel global del consultor. Puede sobreescribirse por proyecto en la pestaña Equipo del cliente.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="accent-brand-primary"
          />
          Activo (puede iniciar sesión)
        </label>

        {error && (
          <div role="alert" className="text-sm text-brand-berry bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
          Submit
        </button>
      </form>
    </Modal>
  );
}
