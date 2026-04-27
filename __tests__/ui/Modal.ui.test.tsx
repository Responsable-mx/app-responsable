/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@/components/ui/Modal";

describe("Modal primitive", () => {
  it("no renderiza nada cuando open=false", () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        contenido
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("render dialog accesible cuando open=true", () => {
    render(
      <Modal open onClose={() => {}} title="Confirmación">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Confirmación");
  });

  it("ESC dispara onClose", async () => {
    const handle = vi.fn();
    render(
      <Modal open onClose={handle} title="X">
        body
      </Modal>,
    );
    await userEvent.keyboard("{Escape}");
    expect(handle).toHaveBeenCalled();
  });

  it("click en overlay cierra; click en contenido NO cierra", async () => {
    const handle = vi.fn();
    render(
      <Modal open onClose={handle} title="X">
        <p>texto interno</p>
      </Modal>,
    );
    // click en contenido NO cierra
    await userEvent.click(screen.getByText("texto interno"));
    expect(handle).not.toHaveBeenCalled();
    // click en overlay (presentation root) sí cierra
    const overlay = screen.getByRole("presentation");
    await userEvent.click(overlay);
    expect(handle).toHaveBeenCalled();
  });

  it("botón Cerrar (✕) dispara onClose", async () => {
    const handle = vi.fn();
    render(
      <Modal open onClose={handle} title="X">
        body
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(handle).toHaveBeenCalled();
  });

  it("foco inicial al primer focusable al abrir", async () => {
    render(
      <Modal open onClose={() => {}} title="X">
        <button>primer</button>
        <button>segundo</button>
      </Modal>,
    );
    const closeBtn = screen.getByRole("button", { name: /cerrar/i });
    // El primer focusable interno es el botón Cerrar del header.
    expect(document.activeElement).toBe(closeBtn);
  });

  it("contenedor dialog es focusable (tabIndex=-1)", () => {
    render(
      <Modal open onClose={() => {}} title="X">
        body
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("tabindex", "-1");
  });
});
