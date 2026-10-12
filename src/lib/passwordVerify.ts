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
/**
 * Wait used when a 429 arrives without a readable Retry-After (older API, or
 * the header not exposed through CORS). It matches the backend's per-IP
 * password window (`PasswordAttemptsPerIPWindow`, 10 minutes) so the guest is
 * not invited to retry straight into the same lock.
 */
export const PASSWORD_LOCK_FALLBACK_SECONDS = 10 * 60;

export function passwordVerifyFailure(
  result: FailedVerifyResult,
): PasswordVerifyFailure {
  // Retry-After is at least 1 s when present.
  const retryAfterSeconds =
    result.status === 429
      ? result.retryAfterSeconds && result.retryAfterSeconds > 0
        ? result.retryAfterSeconds
        : PASSWORD_LOCK_FALLBACK_SECONDS
      : undefined;
  const failure: PasswordVerifyFailure = {
    ok: false,
    // The message and the countdown read the same wait.
    message: getPublicApiErrorMessage(
      retryAfterSeconds === undefined
        ? result
        : { ...result, retryAfterSeconds },
      "password",
      "Contraseña incorrecta. Intenta de nuevo.",
    ),
  };
  if (retryAfterSeconds !== undefined) {
    failure.retryAfterSeconds = retryAfterSeconds;
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
