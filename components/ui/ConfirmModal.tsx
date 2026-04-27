"use client";

// ConfirmModal — wrapper de Modal para confirmaciones destructivas o importantes.
// Reemplaza window.confirm() con un modal accesible (focus trap, restore focus,
// ESC, click-outside — heredado de Modal). Estado `busy` async manejado internamente.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "primary",
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "destructive";
}) {
  const [busy, setBusy] = useState(false);
  // Guard para evitar setState tras unmount cuando onConfirm cierra el modal.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } catch (err) {
      // Última red: si el caller no maneja el error, queda logueado.
      console.error("[ConfirmModal] onConfirm threw:", err);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "primary"}
            onClick={handleConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-700">{description}</div>
    </Modal>
  );
}
