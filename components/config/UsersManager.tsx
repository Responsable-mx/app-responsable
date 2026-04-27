"use client";

import { useState } from "react";
import useSWR from "swr";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type User = {
  email: string;
  role: "admin" | "consultor";
  full_name: string | null;
  active: boolean;
  invited_by: string | null;
  last_login: string | null;
  created_at: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<{ data: User[] }>;
  });

export function UsersManager() {
  const { data, error, isLoading, mutate } = useSWR("/api/users", fetcher);
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
    <div className="bg-white border border-stone-200 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {users.length} {users.length === 1 ? "usuario" : "usuarios"}
          </h2>
        </div>
        <button
          onClick={() => setInviting(true)}
          className="px-3 py-1.5 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800"
        >
          + Invitar usuario
        </button>
      </div>

      {feedback && (
        <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-2 flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback("")}
            className="text-amber-700 hover:underline"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          Error: {(error as Error).message}
        </div>
      )}

      {isLoading && <div className="text-sm text-slate-600">Cargando…</div>}

      {!isLoading && users.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-2">Email</th>
              <th className="pb-2">Nombre</th>
              <th className="pb-2">Rol</th>
              <th className="pb-2">Estado</th>
              <th className="pb-2">Último login</th>
              <th className="pb-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u.email}>
                <td className="py-2 font-mono text-xs">{u.email}</td>
                <td className="py-2 text-slate-700">{u.full_name ?? "—"}</td>
                <td className="py-2">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      u.role === "admin"
                        ? "bg-indigo-50 text-indigo-800"
                        : "bg-stone-100 text-slate-700"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="py-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      u.active
                        ? "bg-green-50 text-green-800"
                        : "bg-stone-100 text-slate-600"
                    }`}
                  >
                    {u.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="py-2 text-xs text-slate-600">
                  {u.last_login
                    ? new Date(u.last_login).toLocaleDateString("es-MX")
                    : "Nunca"}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setEditing(u)}
                    className="text-xs px-2 py-1 text-slate-700 hover:bg-stone-50 rounded"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="text-xs px-2 py-1 text-red-700 hover:bg-red-50 rounded ml-1"
                  >
                    ⊗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(inviting || editing) && (
        <UserEditor
          user={editing}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Eliminar ${deleteTarget?.email ?? ""}`}
        description="Se quita del whitelist. El usuario no podrá iniciar sesión. Sus acciones pasadas (clientes que creó, logs IA) se conservan."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function UserEditor({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [role, setRole] = useState<"admin" | "consultor">(
    user?.role ?? "consultor"
  );
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = user
        ? { role, active, full_name: fullName.trim() || null }
        : { email, role, active, full_name: fullName.trim() || null };
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
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-lg border border-stone-200 max-w-md w-full p-6"
      >
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {user ? "Editar usuario" : "Invitar usuario"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Correo *
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={user !== null}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm disabled:bg-stone-50 font-mono"
              placeholder="alguien@responsable.net"
              autoFocus={user === null}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre completo
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
              placeholder="María López"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Rol
            </label>
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "admin" | "consultor")
              }
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white"
            >
              <option value="consultor">
                Consultor · solo chat y clientes
              </option>
              <option value="admin">
                Admin · además gestiona configuración
              </option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Activo (puede iniciar sesión)
          </label>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm text-slate-700 hover:bg-stone-50 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !email.trim()}
              className="px-4 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:bg-stone-300"
            >
              {saving ? "Guardando…" : user ? "Guardar" : "Invitar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
