/**
 * lib/ai/circuit-breaker.ts
 *
 * Circuit breaker para llamadas a Anthropic API.
 * Evita cascade failures cuando Anthropic devuelve 503/529 repetidamente:
 * - CLOSED  → estado normal, requests pasan
 * - OPEN    → demasiados fallos, rechaza requests inmediatamente con error claro
 * - HALF    → período de prueba, deja pasar 1 request; si pasa → CLOSED, si falla → OPEN
 *
 * Estado en memoria (por instancia serverless). Cross-instance coordination
 * no necesaria para 8-20 usuarios — si una instancia está OPEN, el retry
 * natural de Vercel va a otra.
 *
 * Umbrales conservadores para equipo pequeño:
 *   - Threshold: 5 fallos consecutivos → OPEN
 *   - Timeout: 60s en OPEN antes de pasar a HALF
 */

type State = "CLOSED" | "OPEN" | "HALF";

interface BreakerConfig {
  /** Fallos consecutivos para abrir el circuito */
  failureThreshold: number;
  /** Ms en OPEN antes de intentar HALF */
  openTimeoutMs: number;
}

class CircuitBreaker {
  private state: State = "CLOSED";
  private failures = 0;
  private lastFailureAt = 0;
  private readonly cfg: BreakerConfig;

  constructor(cfg: BreakerConfig) {
    this.cfg = cfg;
  }

  /** true = circuito abierto, rechazar request */
  get isOpen(): boolean {
    if (this.state === "CLOSED") return false;
    if (this.state === "HALF") return false;
    // OPEN — revisar si ya pasó el timeout para mover a HALF
    if (Date.now() - this.lastFailureAt >= this.cfg.openTimeoutMs) {
      this.state = "HALF";
      return false;
    }
    return true;
  }

  /** Llamar cuando un request a Anthropic fue exitoso */
  recordSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  /** Llamar cuando un request a Anthropic falló (503/529/timeout) */
  recordFailure(): void {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.state === "HALF" || this.failures >= this.cfg.failureThreshold) {
      this.state = "OPEN";
    }
  }

  get currentState(): State {
    // Forzar evaluación de transición OPEN→HALF
    void this.isOpen;
    return this.state;
  }

  /** Mensaje legible para el error 503 hacia el cliente */
  get userMessage(): string {
    const waitSec = Math.ceil(
      (this.cfg.openTimeoutMs - (Date.now() - this.lastFailureAt)) / 1_000
    );
    return `El servicio de IA no está disponible temporalmente. Intenta de nuevo en ~${Math.max(waitSec, 5)} segundos.`;
  }
}

// Singleton por proceso — comparte estado entre requests en la misma instancia serverless
export const anthropicBreaker = new CircuitBreaker({
  failureThreshold: 5,
  openTimeoutMs: 60_000,
});

/**
 * Ejecuta `fn` protegida por el circuit breaker.
 * Retorna `{ ok: true, value }` o `{ ok: false, error, status }`.
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: string; status: 503 }> {
  if (anthropicBreaker.isOpen) {
    return { ok: false, error: anthropicBreaker.userMessage, status: 503 };
  }

  try {
    const value = await fn();
    anthropicBreaker.recordSuccess();
    return { ok: true, value };
  } catch (e) {
    // Solo contar como fallo de circuito los errores de disponibilidad Anthropic
    const isAvailabilityError =
      e instanceof Error &&
      (e.message.includes("503") ||
        e.message.includes("529") ||
        e.message.includes("overloaded") ||
        e.message.includes("timeout") ||
        e.message.toLowerCase().includes("econnreset"));

    if (isAvailabilityError) {
      anthropicBreaker.recordFailure();
      return { ok: false, error: anthropicBreaker.userMessage, status: 503 };
    }

    // Error de negocio (400, 401, validation) — no contar como fallo de circuito
    throw e;
  }
}
