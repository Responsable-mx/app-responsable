/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/Button";

describe("Button primitive", () => {
  it("renderiza children y dispara onClick", async () => {
    const handle = vi.fn();
    render(<Button onClick={handle}>Guardar</Button>);
    await userEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(handle).toHaveBeenCalledOnce();
  });

  it("loading=true muestra spinner, deshabilita y bloquea click — SIN opacity reducida", async () => {
    const handle = vi.fn();
    render(
      <Button loading onClick={handle}>
        Enviando
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /enviando/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveAttribute("data-loading", "true");
    // Crítico: loading NO debe verse idéntico a disabled. Sin opacity-50,
    // el spinner mantiene contraste pleno.
    expect(btn.className).not.toContain("opacity-50");
    expect(btn.className).toContain("cursor-not-allowed");
    await userEvent.click(btn);
    expect(handle).not.toHaveBeenCalled();
  });

  it("disabled=true bloquea click + opacity-50 + sin spinner", async () => {
    const handle = vi.fn();
    render(
      <Button disabled onClick={handle}>
        Acción
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /acción/i });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    expect(btn).not.toHaveAttribute("data-loading");
    expect(btn.className).toContain("opacity-50");
    await userEvent.click(btn);
    expect(handle).not.toHaveBeenCalled();
  });

  it("loading + disabled juntos: loading prevalece (spinner sin opacity)", () => {
    render(
      <Button loading disabled>
        X
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /x/i });
    expect(btn.className).not.toContain("opacity-50");
    expect(btn).toHaveAttribute("data-loading", "true");
  });

  it("variant destructive aplica clases brand-berry", () => {
    render(<Button variant="destructive">Eliminar</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand-berry");
  });

  it("type=button por default (no submit accidental en forms)", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
