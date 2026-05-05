"use client";

// Mockup del wizard de contexto de cliente (9 pasos).
// Sin backend, sin Supabase, sin auth. Solo UI + datos mock.
// Acceso: http://localhost:3000/dev/clientes-wizard-preview

import { ToastProvider } from "@/components/ui/Toast";
import { WizardShell } from "./WizardShell";

export default function ClientesWizardPreview() {
  return (
    <ToastProvider>
      <WizardShell />
    </ToastProvider>
  );
}
