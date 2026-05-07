/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { ClientsList } from "@/components/ClientsList";
import { ToastProvider } from "@/components/ui/Toast";

// Wrap render con ToastProvider — ClientsList llama useToast()
function renderWithProviders(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a href={href} {...rest}>{children}</a>,
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// SWR mock: simula filtrado server-side basado en ?q= del key.
// D-05: la búsqueda es server-side (debounce 300ms → SWR key → /api/clients?q=...).
// El mock replicate la lógica ilike de Supabase para que los tests sean deterministas.
type Row = {
  id: string;
  name: string;
  sector: string | null;
  countries: string[] | null;
  size: string | null;
  frameworks: string[] | null;
  certifications: string[] | null;
  updated_at: string;
};

let mockClients: Row[] = [];

vi.mock("swr", () => ({
  default: (key: string) => {
    const url = typeof key === "string" ? key : "";
    const qParam = new URLSearchParams(url.split("?")[1] ?? "").get("q") ?? "";
    const filtered = qParam
      ? mockClients.filter((c) => {
          const q = qParam.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            (c.frameworks ?? []).some((f) => f.toLowerCase().includes(q)) ||
            (c.certifications ?? []).some((cert) =>
              cert.toLowerCase().includes(q)
            )
          );
        })
      : mockClients;
    return { data: { data: filtered }, isLoading: false };
  },
}));

const base = (name: string, extras: Partial<Row> = {}): Row => ({
  id: name.toLowerCase().replace(/\s/g, "-"),
  name,
  sector: extras.sector ?? null,
  countries: extras.countries ?? null,
  size: extras.size ?? null,
  frameworks: extras.frameworks ?? null,
  certifications: extras.certifications ?? null,
  updated_at: "2026-04-01T00:00:00Z",
});

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  mockClients = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ClientsList", () => {
  it("renderiza empty state cuando no hay clientes", () => {
    mockClients = [];
    renderWithProviders(<ClientsList />);
    expect(screen.getByText(/Aún no hay clientes/i)).toBeTruthy();
  });

  it("renderiza lista con clientes y muestra contador total", () => {
    mockClients = [
      base("Heineken", { sector: "Bebidas" }),
      base("IKEA", { sector: "Retail" }),
    ];
    renderWithProviders(<ClientsList />);
    expect(screen.getByText("Heineken")).toBeTruthy();
    expect(screen.getByText("IKEA")).toBeTruthy();
    expect(screen.getByText(/2 clientes/)).toBeTruthy();
  });

  it("filtra por nombre (server-side debounce 300ms)", () => {
    mockClients = [base("Heineken"), base("IKEA"), base("Sanofi")];
    renderWithProviders(<ClientsList />);
    const input = screen.getByPlaceholderText(/Buscar/i);
    // fireEvent.change es síncrono — setQuery dispara inmediatamente.
    // act + vi.runAllTimers ejecuta el setTimeout del debounce → setDebouncedQ → re-render.
    act(() => {
      fireEvent.change(input, { target: { value: "ike" } });
      vi.runAllTimers();
    });
    expect(screen.queryByText("Heineken")).toBeNull();
    expect(screen.getByText("IKEA")).toBeTruthy();
    expect(screen.queryByText("Sanofi")).toBeNull();
    expect(screen.getByText(/1 cliente/)).toBeTruthy();
  });

  it("filtra por framework reportado", () => {
    mockClients = [
      base("Heineken", { frameworks: ["gri", "sbti"] }),
      base("IKEA", { frameworks: ["issb"] }),
    ];
    renderWithProviders(<ClientsList />);
    act(() => {
      fireEvent.change(screen.getByPlaceholderText(/Buscar/i), {
        target: { value: "sbti" },
      });
      vi.runAllTimers();
    });
    expect(screen.getByText("Heineken")).toBeTruthy();
    expect(screen.queryByText("IKEA")).toBeNull();
  });

  it("muestra filtro por sector cuando hay >1 sector", () => {
    mockClients = [
      base("A", { sector: "Bebidas" }),
      base("B", { sector: "Retail" }),
    ];
    renderWithProviders(<ClientsList />);
    expect(screen.getByText(/Todos los sectores/i)).toBeTruthy();
  });

  it("no muestra filtro de sector cuando todos son el mismo", () => {
    mockClients = [
      base("A", { sector: "Bebidas" }),
      base("B", { sector: "Bebidas" }),
    ];
    renderWithProviders(<ClientsList />);
    expect(screen.queryByText(/Todos los sectores/i)).toBeNull();
  });
});
