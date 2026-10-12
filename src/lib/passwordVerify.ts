import { getPublicApiErrorMessage } from "./apiError";

export interface PasswordVerifyFailure {
  ok: false;
  message: string;
  /** Seconds the guest must wait (429 `too_many_attempts` + Retry-After). */
  retryAfterSeconds?: number;
}

interface FailedVerifyResult {
  status: number;
  payload: unknown;
  retryAfterSeconds?: number;
}

/** Spanish failure for POST /verify-access, carrying the 429 wait time. */
export function passwordVerifyFailure(
  result: FailedVerifyResult,
): PasswordVerifyFailure {
  const failure: PasswordVerifyFailure = {
    ok: false,
    message: getPublicApiErrorMessage(
      result,
      "password",
      "Contraseña incorrecta. Intenta de nuevo.",
    ),
  };
  if (result.status === 429) {
    // Retry-After is at least 1 s; without it, lock for one minute.
    failure.retryAfterSeconds = result.retryAfterSeconds ?? 60;
  }
  return failure;
}

/** Remaining whole seconds of a lock that ends at `lockedUntil` (ms). */
export function remainingLockSeconds(
  lockedUntil: number | null,
  now = Date.now(),
): number {
  if (lockedUntil === null) return 0;
  return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
}
