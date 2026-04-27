/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/Input";

describe("Input primitive", () => {
  it("vincula label, helper y error con aria correcto", () => {
    render(<Input label="Correo" helper="Usaremos este correo para OTP" />);
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveAttribute("aria-describedby");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      /OTP/,
    );
  });

  it("error setea aria-invalid y describedby apunta a error (no helper)", () => {
    render(
      <Input
        label="Correo"
        helper="ayuda"
        error="Correo inválido"
      />,
    );
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "Correo inválido",
    );
  });

  it("sin label/helper/error renderiza solo el input", () => {
    render(<Input placeholder="x" />);
    expect(screen.getByPlaceholderText("x")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});
