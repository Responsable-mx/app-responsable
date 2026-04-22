import { vi } from "vitest";

// "server-only" solo existe en el bundle de Next; stubear para que los tests
// puedan importar archivos que lo declaran.
vi.mock("server-only", () => ({}));
