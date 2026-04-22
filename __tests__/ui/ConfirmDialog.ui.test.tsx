/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("no renderiza nada si open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza dialog con title y description", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Eliminar Heineken"
        description="Esta acción no se puede deshacer."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Eliminar Heineken")).toBeTruthy();
    expect(screen.getByText(/no se puede deshacer/)).toBeTruthy();
  });

  it("click en Confirmar dispara onConfirm", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="X"
        confirmLabel="Sí borrar"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /Sí borrar/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("Escape dispara onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        title="X"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("aplica clase destructive cuando variant=destructive", () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        title="X"
        variant="destructive"
        confirmLabel="Eliminar"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const btn = screen.getByRole("button", { name: "Eliminar" });
    expect(btn.className).toMatch(/bg-red/);
    expect(container).toBeTruthy();
  });
});
