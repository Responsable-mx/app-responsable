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
  is_test_account: boolean;
  feature_flags: Record<string, boolean>;
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
            {isLoading ? (
              <span className="inline-block h-5 w-20 bg-slate-100 rounded animate-pulse align-middle" />
            ) : (
              <>{users.length} {users.length === 1 ? "usuario" : "usuarios"}</>
            )}
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

      {!isLoading && users.length > 0 && (() => {
        const hasSeniority = users.some((u) => u.seniority_level !== null);
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  <th className="pb-2 pr-4 w-[220px]">Email</th>
                  <th className="pb-2 pr-4 w-[140px]">Nombre</th>
                  <th className="pb-2 pr-4">Rol</th>
                  {hasSeniority && <th className="pb-2 pr-4">Seniority</th>}
                  <th className="pb-2 pr-4">Estado</th>
                  <th className="pb-2 pr-4 hidden sm:table-cell">Último login</th>
                  <th className="pb-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.email} className="even:bg-slate-50 hover:bg-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs w-[220px] max-w-[220px]">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate" title={u.email}>{u.email}</span>
                        {u.is_test_account && (
                          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 border border-amber-200">
                            TEST
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700 w-[140px] max-w-[140px]">
                      <span className="block truncate" title={u.full_name ?? ""}>{u.full_name ?? "—"}</span>
                    </td>
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
                    {hasSeniority && (
                      <td className="py-2 pr-4">
                        {u.seniority_level ? (
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm bg-teal-50 text-teal-800">
                            {seniorityItems.find((s) => s.value === u.seniority_level)?.label ?? u.seniority_level}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    )}
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
                    <td className="py-2 pr-4 text-xs text-slate-600 hidden sm:table-cell">
                      {u.last_login ? (
                        new Date(u.last_login).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setEditing(u)}
                        title="Editar usuario"
                        className="text-xs px-3 py-2 text-slate-700 hover:bg-slate-100 rounded min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        title="Eliminar usuario"
                        className="text-xs px-3 py-2 text-red-700 hover:bg-red-50 rounded ml-1 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

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
  const [isTestAccount, setIsTestAccount] = useState(user?.is_test_account ?? false);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>(user?.feature_flags ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setFlag(key: string, val: boolean | null) {
    setFeatureFlags((prev) => {
      const next = { ...prev };
      if (val === null) delete next[key];
      else next[key] = val;
      return next;
    });
  }

  const { data: clientsData } = useSWR<{ data: ClientOption[] }>(
    role === "cliente" ? "/api/clients?catalog=1&limit=200" : null,
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
            is_test_account: isTestAccount,
            feature_flags: featureFlags,
          }
        : {
            email,
            role,
            active,
            full_name: fullName.trim() || null,
            seniority_level: seniorityLevel || null,
            client_id: role === "cliente" ? clientId : null,
            is_test_account: isTestAccount,
            feature_flags: featureFlags,
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
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="accent-brand-primary"
            />
            Activo (puede iniciar sesión)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isTestAccount}
              onChange={(e) => setIsTestAccount(e.target.checked)}
              className="accent-amber-500"
            />
            Cuenta de prueba — se excluye de métricas de equipo
          </label>
        </div>

        {/* Acceso a módulos — solo relevante para admin/consultor */}
        {role !== "cliente" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-slate-700">Acceso a módulos</p>
            <p className="text-xs text-slate-500 -mt-1">
              Deja en &quot;Default&quot; para usar los permisos estándar del rol.
            </p>
            {[
              {
                key: "chat_ia",
                label: "Chat IA",
                desc: "Acceso a la pestaña Chat IA",
                defaultFor: ["admin", "consultor"],
              },
              {
                key: "equipo",
                label: "Vista Equipo",
                desc: "Acceso a /equipo con cronogramas y heatmap",
                defaultFor: ["admin"],
              },
            ].map(({ key, label, desc, defaultFor }) => {
              const isDefault = featureFlags[key] === undefined;
              const val = isDefault ? defaultFor.includes(role) : featureFlags[key];
              return (
                <div key={key} className="flex items-start gap-3 p-2.5 rounded border border-slate-100 bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700">{label}</p>
                    <p className="text-[11px] text-slate-500">{desc}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(["default", "on", "off"] as const).map((opt) => {
                      const active =
                        opt === "default" ? isDefault : opt === "on" ? (!isDefault && val === true) : (!isDefault && val === false);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() =>
                            setFlag(key, opt === "default" ? null : opt === "on" ? true : false)
                          }
                          className={`px-2 py-0.5 text-[10px] font-medium rounded-sm border transition-colors ${
                            active
                              ? opt === "off"
                                ? "bg-red-50 border-red-300 text-red-700"
                                : "bg-brand-primary-light border-brand-primary text-brand-primary-dark"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          {opt === "default" ? "Default" : opt === "on" ? "Sí" : "No"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
