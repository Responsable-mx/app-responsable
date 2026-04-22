/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StringListField } from "@/components/fields/StringListField";

function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const spy = vi.fn();
  return (
    <StringListField
      value={initial}
      onChange={(v) => spy(v)}
      placeholder="Escribe y Enter"
    />
  );
}

describe("StringListField", () => {
  it("renderiza input con placeholder cuando lista está vacía", () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText(/Escribe y Enter/)).toBeTruthy();
  });

  it("muestra chips cuando hay valores", () => {
    render(<Harness initial={["Clima", "Agua"]} />);
    expect(screen.getByText("Clima")).toBeTruthy();
    expect(screen.getByText("Agua")).toBeTruthy();
  });

  it("agrega item al presionar Enter", async () => {
    const user = userEvent.setup();
    let value: string[] = [];
    const onChange = vi.fn((v: string[]) => {
      value = v;
    });
    const { rerender } = render(
      <StringListField value={value} onChange={onChange} />
    );
    await user.type(screen.getByRole("textbox"), "Circularidad{Enter}");
    expect(onChange).toHaveBeenCalledWith(["Circularidad"]);
    rerender(<StringListField value={["Circularidad"]} onChange={onChange} />);
    expect(screen.getByText("Circularidad")).toBeTruthy();
  });

  it("ignora duplicados", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StringListField value={["Clima"]} onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "Clima{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respeta maxItems", () => {
    render(<StringListField value={["a", "b", "c"]} onChange={() => {}} maxItems={3} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText("3/3")).toBeTruthy();
  });
});
