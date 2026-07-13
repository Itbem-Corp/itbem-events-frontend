import { readApiData } from "./apiEnvelope";

export interface UploadQuota {
  limit: number | null;
  remaining: number | null;
  used: number | null;
}

function toNonNegativeInt(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

function firstValue(source: Record<string, unknown>, keys: string[]): unknown {
  let blankString: string | undefined;

  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) {
      blankString ??= value;
      continue;
    }
    return value;
  }

  return blankString;
}

export function readUploadQuota(data: unknown): UploadQuota {
  const candidates = [readApiData(data)];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const rawData = firstValue(data as Record<string, unknown>, ["data", "Data"]);
    if (rawData !== undefined && !candidates.includes(rawData)) {
      candidates.push(rawData);
    }
  }
  const payload =
    candidates.find(
      (candidate): candidate is Record<string, unknown> =>
        candidate !== null && typeof candidate === "object" && !Array.isArray(candidate),
    ) ?? {};

  return {
    limit: toNonNegativeInt(
      firstValue(payload, ["uploads_limit", "uploadsLimit", "UploadsLimit"]),
    ),
    remaining: toNonNegativeInt(
      firstValue(payload, [
        "uploads_remaining",
        "uploadsRemaining",
        "UploadsRemaining",
      ]),
    ),
    used: toNonNegativeInt(
      firstValue(payload, ["uploads_used", "uploadsUsed", "UploadsUsed"]),
    ),
  };
}

export function getSelectableUploadSlots({
  currentBatchCount,
  reservedQuotaCount,
  perBatchLimit,
  quotaRemaining,
}: {
  currentBatchCount: number;
  reservedQuotaCount: number;
  perBatchLimit: number;
  quotaRemaining: number | null;
}): number {
  const batchSlots = Math.max(0, Math.trunc(perBatchLimit) - Math.max(0, Math.trunc(currentBatchCount)));
  if (quotaRemaining === null) return batchSlots;

  const quotaSlots = Math.max(0, Math.trunc(quotaRemaining) - Math.max(0, Math.trunc(reservedQuotaCount)));
  return Math.min(batchSlots, quotaSlots);
}

export function getSelectableUploadSlotsWithPending({
  currentBatchCount,
  reservedQuotaCount,
  pendingSelectionCount,
  perBatchLimit,
  quotaRemaining,
}: {
  currentBatchCount: number;
  reservedQuotaCount: number;
  pendingSelectionCount: number;
  perBatchLimit: number;
  quotaRemaining: number | null;
}): number {
  const pending = Math.max(0, Math.trunc(pendingSelectionCount));
  return getSelectableUploadSlots({
    currentBatchCount: currentBatchCount + pending,
    reservedQuotaCount: reservedQuotaCount + pending,
    perBatchLimit,
    quotaRemaining,
  });
}

export function decrementUploadQuota(remaining: number | null, uploadedCount: number): number | null {
  if (remaining === null) return null;
  return Math.max(0, Math.trunc(remaining) - Math.max(0, Math.trunc(uploadedCount)));
}

export function reconcileUploadQuotaRemaining(
  currentRemaining: number | null,
  backendRemaining: number | null,
): number | null {
  if (backendRemaining === null) return currentRemaining;
  if (currentRemaining === null) return backendRemaining;
  return Math.min(
    Math.max(0, Math.trunc(currentRemaining)),
    Math.max(0, Math.trunc(backendRemaining)),
  );
}

export function getUploadDisplayLimit(perBatchLimit: number, quotaRemaining: number | null): number {
  if (quotaRemaining === null) return Math.max(0, Math.trunc(perBatchLimit));
  return Math.max(0, Math.min(Math.trunc(perBatchLimit), Math.trunc(quotaRemaining)));
}
