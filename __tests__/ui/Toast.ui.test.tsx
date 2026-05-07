/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ToastProvider,
  useToast,
  type ToastTone,
} from "@/components/ui/Toast";

function Trigger({ tone = "success" as ToastTone }: { tone?: ToastTone }) {
  const { push } = useToast();
  return <button onClick={() => push(tone, "Guardado")}>disparar</button>;
}

describe("Toast system", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("push muestra toast con role=status y aria-live", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: /disparar/i }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
    // contenedor con aria-live polite
    const liveRegion = screen.getByRole("status").parentElement;
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  it("auto-dismiss a los 4s", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: /disparar/i }),
    );
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("useToast fuera de provider lanza error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/inside <ToastProvider>/);
    spy.mockRestore();
  });

  it("dismiss manual cierra el toast antes del auto-dismiss", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /disparar/i }));
    expect(screen.getByRole("status")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /cerrar notificación/i }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("toast tone error usa fondo brand-berry", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger tone="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /disparar/i }));
    expect(screen.getByRole("status").className).toContain("bg-brand-berry");
  });

  it("toast tone warning usa fondo amber", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger tone="warning" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /disparar/i }));
    expect(screen.getByRole("status").className).toContain("bg-amber-600");
  });

  it("toast tone info usa fondo brand-primary", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger tone="info" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /disparar/i }));
    expect(screen.getByRole("status").className).toContain("bg-brand-primary");
  });

  it("múltiples toasts coexisten (dos role=status presentes)", async () => {
    function DoubleTrigger() {
      const { push } = useToast();
      return (
        <button
          onClick={() => {
            push("success", "Primero");
            push("info", "Segundo");
          }}
        >
          disparar doble
        </button>
      );
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <DoubleTrigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /disparar doble/i }));
    const toasts = screen.getAllByRole("status");
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toHaveTextContent("Primero");
    expect(toasts[1]).toHaveTextContent("Segundo");
  });
});
