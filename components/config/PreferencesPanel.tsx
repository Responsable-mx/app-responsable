"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export function PreferencesPanel({
  currentTourVersion,
}: {
  currentTourVersion: number;
}) {
  const [tourVersion, setTourVersion] = useState(currentTourVersion);
  const [confirm, setConfirm] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function bump() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/settings/tour-version", {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Error");
      } else {
        setTourVersion(j.data.version);
        setInfo(
          `Nueva versión del tour: ${j.data.version}. Todos los usuarios verán el tour de nuevo en su próxima visita a /chat.`
        );
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tour */}
      <section className="bg-white border border-slate-200 rounded p-6">
        <h2 className="text-lg font-semibold text-slate-900">Tour guiado</h2>
        <p className="text-sm text-slate-600 mt-1">
          El tour aparece automáticamente la primera vez que un consultor
          entra a <code className="bg-slate-100 px-1 rounded">/chat</code>.
        </p>
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-600">Versión actual del tour</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              v{tourVersion}
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-lg">
              Incrementa esta versión cuando cambies el flujo o quieras que
              todo el equipo vuelva a verlo. Cada usuario verá el tour la
              próxima vez que entre al chat.
            </p>
          </div>
          <button
            onClick={() => setConfirm(true)}
            disabled={busy}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 whitespace-nowrap"
          >
            Reiniciar tour para todo el equipo
          </button>
        </div>

        <div className="mt-4 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <strong className="text-slate-700">Para ti solo:</strong> Si quieres
          ver el tour de nuevo únicamente en tu dispositivo, usa el botón ?
          en la barra lateral → &ldquo;Ver tour del chat&rdquo;.
        </div>

        {info && (
          <div className="mt-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
            {info}
          </div>
        )}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">
            {error}
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirm}
        title="Reiniciar tour para todo el equipo"
        description={`Se incrementará la versión del tour (a v${
          tourVersion + 1
        }). En la próxima visita a /chat, TODOS los consultores verán el tour de nuevo. No afecta datos ni configuración.`}
        confirmLabel="Reiniciar"
        cancelLabel="Cancelar"
        onConfirm={bump}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
