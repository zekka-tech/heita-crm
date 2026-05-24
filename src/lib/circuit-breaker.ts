import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type CircuitState = {
  failures: number;
  openedAt: number | null;
  halfOpenInFlight: boolean;
};

type CircuitBreakerOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
};

export class CircuitBreakerOpenError extends Error {
  constructor(
    readonly circuit: string,
    readonly retryAfterMs: number
  ) {
    super(`circuit-open:${circuit}`);
    this.name = "CircuitBreakerOpenError";
  }
}

declare global {
  var __heitaCircuitBreakers__: Map<string, CircuitState> | undefined;
}

function getCircuitState(name: string): CircuitState {
  global.__heitaCircuitBreakers__ ??= new Map<string, CircuitState>();

  const existing = global.__heitaCircuitBreakers__.get(name);
  if (existing) {
    return existing;
  }

  const created: CircuitState = {
    failures: 0,
    openedAt: null,
    halfOpenInFlight: false
  };
  global.__heitaCircuitBreakers__.set(name, created);
  return created;
}

function resolveOptions(options?: CircuitBreakerOptions) {
  return {
    failureThreshold:
      options?.failureThreshold ?? env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    cooldownMs: options?.cooldownMs ?? env.CIRCUIT_BREAKER_COOLDOWN_MS
  };
}

function canAttempt(state: CircuitState, cooldownMs: number) {
  if (state.openedAt === null) {
    return true;
  }

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= cooldownMs && !state.halfOpenInFlight) {
    state.halfOpenInFlight = true;
    return true;
  }

  return false;
}

function resetCircuit(state: CircuitState) {
  state.failures = 0;
  state.openedAt = null;
  state.halfOpenInFlight = false;
}

export function isCircuitBreakerOpenError(
  error: unknown
): error is CircuitBreakerOpenError {
  return error instanceof CircuitBreakerOpenError;
}

export async function runWithCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  options?: CircuitBreakerOptions
): Promise<T> {
  const state = getCircuitState(name);
  const config = resolveOptions(options);

  if (!canAttempt(state, config.cooldownMs)) {
    const retryAfterMs = Math.max(
      0,
      config.cooldownMs - (Date.now() - (state.openedAt ?? Date.now()))
    );
    throw new CircuitBreakerOpenError(name, retryAfterMs);
  }

  try {
    const result = await operation();
    resetCircuit(state);
    return result;
  } catch (error) {
    state.failures += 1;
    state.halfOpenInFlight = false;

    if (state.failures >= config.failureThreshold) {
      state.openedAt = Date.now();
      logger.warn(
        {
          circuit: name,
          failures: state.failures,
          cooldownMs: config.cooldownMs
        },
        "circuit_breaker.opened"
      );
    }

    throw error;
  }
}
