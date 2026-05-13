"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

export function PreferencesPanel({
  currentTourVersion,
}: {
  currentTourVersion: number;
}) {
  const { push } = useToast();
  const [tourVersion, setTourVersion] = useState(currentTourVersion);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function bump() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/tour-version", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        push("error", j.error ?? "Error al reiniciar el tour");
      } else {
        setTourVersion(j.data.version);
        push("success", `Tour reiniciado a v${j.data.version}. Todos los consultores lo verán en su próxima visita al chat.`);
      }
    } catch {
      push("error", "Error de conexión");
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
          entra al chat.
        </p>
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Versión actual del tour</div>
            <div className="text-2xl font-bold text-slate-900 mt-0.5">
              v{tourVersion}
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-lg">
              Incrementa esta versión cuando cambies el flujo o quieras que
              todo el equipo vuelva a verlo. Cada usuario verá el tour la
              próxima vez que entre al chat.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirm(true)}
            disabled={busy}
          >
            Reiniciar tour para todo el equipo
          </Button>
        </div>

        <div className="mt-4 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <strong className="text-slate-700">Para ti solo:</strong> Si quieres
          ver el tour de nuevo únicamente en tu dispositivo, usa el botón ?
          en la barra lateral → &ldquo;Ver tour del chat&rdquo;.
        </div>

      </section>

      <ConfirmModal
        open={confirm}
        title="Reiniciar tour para todo el equipo"
        description={`Se incrementará la versión del tour (a v${
          tourVersion + 1
        }). En la próxima visita al chat, TODOS los consultores verán el tour de nuevo. No afecta datos ni configuración.`}
        confirmLabel="Reiniciar"
        cancelLabel="Cancelar"
        tone="primary"
        onConfirm={bump}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
