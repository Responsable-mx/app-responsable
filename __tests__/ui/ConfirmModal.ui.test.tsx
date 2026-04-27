/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

describe("ConfirmModal", () => {
  it("muestra title y description; Cancelar dispara onCancel", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Eliminar cliente"
        description="Esta acción es irreversible."
        confirmLabel="Sí, eliminar"
      />,
    );
    expect(screen.getByText("Eliminar cliente")).toBeTruthy();
    expect(screen.getByText(/irreversible/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Confirm async muestra loading y bloquea botones hasta resolver", async () => {
    let resolveFn: (() => void) | null = null;
    const onConfirm = vi.fn(
      () => new Promise<void>((res) => (resolveFn = res)),
    );
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        open
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Confirmar"
        description="ok?"
        confirmLabel="Confirmar"
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^confirmar$/i }),
    );
    // Mientras está pending: confirm en aria-busy y cancel disabled
    await waitFor(() => {
      const confirm = screen.getByRole("button", { name: /^confirmar$/i });
      expect(confirm).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled();
    });
    resolveFn!();
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("tone destructive aplica clase brand-berry al confirm", () => {
    render(
      <ConfirmModal
        open
        onCancel={() => {}}
        onConfirm={() => {}}
        title="Borrar"
        description="x"
        confirmLabel="Sí"
        tone="destructive"
      />,
    );
    const confirm = screen.getByRole("button", { name: /sí/i });
    expect(confirm.className).toContain("bg-brand-berry");
  });
});
