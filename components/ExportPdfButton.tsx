"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function ExportPdfButton({ clientId, clientName }: {
  clientId: string;
  clientName: string;
}) {
  const [busy, setBusy] = useState(false);
  const { push: toast } = useToast();

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/export-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast("error", data.error ?? "Error al generar el PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `responsable-${clientName
        .replace(/[^a-zA-Z0-9À-ɏ\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleExport}
      disabled={busy}
      loading={busy}
      title="Exportar ficha completa del cliente en PDF"
    >
      {!busy && (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      )}
      {busy ? "Generando..." : "Exportar PDF"}
    </Button>
  );
}
