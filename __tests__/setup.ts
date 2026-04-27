import { vi } from "vitest";

// "server-only" solo existe en el bundle de Next; stubear para que los tests
// puedan importar archivos que lo declaran.
vi.mock("server-only", () => ({}));

// jest-dom matchers (toHaveAttribute, toHaveTextContent, toBeDisabled...) solo
// aplican en entornos con DOM. Los tests de lib/ corren en env=node por default
// (vitest.config.mts) y no necesitan estos matchers.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
