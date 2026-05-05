"use client";

// Preview de primitives `components/ui/*` sin auth.
// Visible solo en non-prod (middleware bypass `/dev/*`).
// Útil para revisar tokens brand, contraste, focus ring sin login.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  SkeletonCard,
  SkeletonList,
  SkeletonTable,
  SkeletonDetail,
} from "@/components/ui/Skeleton";

function PreviewInner() {
  const { push } = useToast();
  const [openModal, setOpenModal] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [inputErr, setInputErr] = useState(false);

  return (
    <main id="main-content" className="max-w-4xl mx-auto p-8 space-y-12">
      <header>
        <h1 className="text-3xl font-bold text-brand-primary-dark">
          Primitives ResponSable
        </h1>
        <p className="text-slate-700 mt-2">
          Vista de revisión de tokens brand, contraste WCAG y estados de
          interacción. Ruta solo accesible en non-prod.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">Button</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button loading>Cargando</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <Button size="sm">Pequeño (32px)</Button>
          <Button size="md">Medio (40px)</Button>
          <Button size="lg">Grande (48px)</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">Input</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <Input label="Correo" placeholder="tu@responsable.net" />
          <Input
            label="Con helper"
            helper="Mostraremos esto solo a admins"
            placeholder="…"
          />
          <Input
            label="Con error"
            error={inputErr ? "Correo inválido" : undefined}
            placeholder="forzar error"
            onChange={(e) => setInputErr(!e.target.value.includes("@"))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">
          Modal + ConfirmModal
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setOpenModal(true)}>Abrir Modal</Button>
          <Button
            variant="destructive"
            onClick={() => setOpenConfirm(true)}
          >
            Abrir Confirm destructivo
          </Button>
        </div>
        <Modal
          open={openModal}
          onClose={() => setOpenModal(false)}
          title="Modal de ejemplo"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpenModal(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setOpenModal(false)}>Aceptar</Button>
            </>
          }
        >
          <p>
            Cierre con ESC, click overlay, o el ✕ del header. Focus trap con
            Tab/Shift+Tab.
          </p>
        </Modal>
        <ConfirmModal
          open={openConfirm}
          onCancel={() => setOpenConfirm(false)}
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 1200));
            setOpenConfirm(false);
            push("success", "Acción confirmada");
          }}
          title="¿Eliminar este cliente?"
          description="Esta acción no se puede deshacer. Se borran 6 bloques narrativos asociados."
          confirmLabel="Sí, eliminar"
          tone="destructive"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">Toast</h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => push("success", "Cambios guardados")}>
            success
          </Button>
          <Button onClick={() => push("error", "Algo falló al enviar")}>
            error
          </Button>
          <Button
            onClick={() => push("warning", "Faltan campos obligatorios")}
          >
            warning
          </Button>
          <Button onClick={() => push("info", "Procesando en segundo plano")}>
            info
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">Skeletons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonDetail />
        </div>
        <SkeletonList items={2} />
        <SkeletonTable rows={3} cols={4} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-700">SkipLink</h2>
        <div className="bg-slate-100 rounded-lg p-4 text-sm text-slate-700 space-y-2">
          <p>
            <strong>Patrón:</strong> oculto fuera de viewport hasta recibir
            foco con Tab. Al primer Tab desde la barra de URL aparece arriba
            a la izquierda con fondo brand-primary.
          </p>
          <p>
            <strong>Cómo probarlo:</strong> click en la barra de URL,
            presiona <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 font-mono text-xs">Tab</kbd>{" "}
            una vez. El link &quot;Saltar al contenido principal&quot; debe
            aparecer en la esquina superior izquierda. Otro Tab y desaparece.
          </p>
          <p>
            <strong>Dónde vive:</strong> instanciado en{" "}
            <code className="font-mono text-xs">app/layout.tsx</code> como
            primer hijo del <code className="font-mono text-xs">&lt;body&gt;</code>{" "}
            — un solo SkipLink por página, target ={" "}
            <code className="font-mono text-xs">#main-content</code>.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <PreviewInner />
    </ToastProvider>
  );
}
