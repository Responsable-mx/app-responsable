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
});
