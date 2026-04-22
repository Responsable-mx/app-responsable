/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientsList } from "@/components/ClientsList";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href} {...rest}>{children}</a>,
}));

const base = (
  name: string,
  extras: Partial<{
    sector: string | null;
    countries: string[] | null;
    size: string | null;
    frameworks: string[] | null;
    certifications: string[] | null;
  }> = {}
) => ({
  id: name.toLowerCase().replace(/\s/g, "-"),
  name,
  sector: extras.sector ?? null,
  countries: extras.countries ?? null,
  size: extras.size ?? null,
  frameworks: extras.frameworks ?? null,
  certifications: extras.certifications ?? null,
  updated_at: "2026-04-01T00:00:00Z",
});

describe("ClientsList", () => {
  it("renderiza empty state cuando no hay clientes", () => {
    render(<ClientsList clients={[]} />);
    expect(screen.getByText(/Aún no hay clientes/i)).toBeTruthy();
  });

  it("renderiza lista y muestra contador", () => {
    render(
      <ClientsList
        clients={[
          base("Heineken", { sector: "Bebidas" }),
          base("IKEA", { sector: "Retail" }),
        ]}
      />
    );
    expect(screen.getByText("Heineken")).toBeTruthy();
    expect(screen.getByText("IKEA")).toBeTruthy();
    expect(screen.getByText(/2 de 2/)).toBeTruthy();
  });

  it("filtra por nombre al escribir en el buscador", async () => {
    const user = userEvent.setup();
    render(
      <ClientsList
        clients={[base("Heineken"), base("IKEA"), base("Sanofi")]}
      />
    );
    const input = screen.getByPlaceholderText(/Buscar/i);
    await user.type(input, "ike");
    expect(screen.queryByText("Heineken")).toBeNull();
    expect(screen.getByText("IKEA")).toBeTruthy();
    expect(screen.queryByText("Sanofi")).toBeNull();
    expect(screen.getByText(/1 de 3/)).toBeTruthy();
  });

  it("filtra por framework reportado", async () => {
    const user = userEvent.setup();
    render(
      <ClientsList
        clients={[
          base("Heineken", { frameworks: ["gri", "sbti"] }),
          base("IKEA", { frameworks: ["issb"] }),
        ]}
      />
    );
    await user.type(screen.getByPlaceholderText(/Buscar/i), "sbti");
    expect(screen.getByText("Heineken")).toBeTruthy();
    expect(screen.queryByText("IKEA")).toBeNull();
  });

  it("muestra filtro por sector cuando hay >1 sector", () => {
    render(
      <ClientsList
        clients={[
          base("A", { sector: "Bebidas" }),
          base("B", { sector: "Retail" }),
        ]}
      />
    );
    expect(screen.getByText(/Todos los sectores/i)).toBeTruthy();
  });

  it("no muestra filtro de sector cuando todos son el mismo", () => {
    render(
      <ClientsList
        clients={[
          base("A", { sector: "Bebidas" }),
          base("B", { sector: "Bebidas" }),
        ]}
      />
    );
    expect(screen.queryByText(/Todos los sectores/i)).toBeNull();
  });
});
