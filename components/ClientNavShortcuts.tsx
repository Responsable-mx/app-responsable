"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  prevId: string | null;
  nextId: string | null;
};

// Keyboard shortcuts: Alt+← / Alt+→ navega entre clientes.
// Alt evita conflicto con back/forward del browser.
export function ClientNavShortcuts({ prevId, nextId }: Props) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignora si está dentro de input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!e.altKey) return;
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        router.push(`/clientes/${prevId}`);
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        router.push(`/clientes/${nextId}`);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prevId, nextId, router]);
  return null;
}
