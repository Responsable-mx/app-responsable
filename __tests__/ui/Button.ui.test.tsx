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

  it("loading=true muestra spinner, deshabilita y bloquea click", async () => {
    const handle = vi.fn();
    render(
      <Button loading onClick={handle}>
        Enviando
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /enviando/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await userEvent.click(btn);
    expect(handle).not.toHaveBeenCalled();
  });

  it("disabled=true bloquea click sin spinner", async () => {
    const handle = vi.fn();
    render(
      <Button disabled onClick={handle}>
        Acción
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /acción/i });
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    await userEvent.click(btn);
    expect(handle).not.toHaveBeenCalled();
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
