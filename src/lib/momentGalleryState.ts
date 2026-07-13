export interface PendingMoment {
  /** Synthetic local ID (UUID v4 generated on upload). */
  localId: string;
  /** Media kind used to select the pending card treatment. */
  mediaType: "video" | "image";
  /** ISO timestamp used to expire stale processing placeholders. */
  uploadedAt: string;
}

const PENDING_MOMENT_TTL_MS = 15 * 60 * 1000;

function pendingKey(identifier: string): string {
  return `pending_moments:${identifier}`;
}

export function readPending(identifier: string): PendingMoment[] {
  try {
    const raw = sessionStorage.getItem(pendingKey(identifier));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingMoment[];
    const cutoff = Date.now() - PENDING_MOMENT_TTL_MS;
    return parsed.filter(
      (pendingMoment) => new Date(pendingMoment.uploadedAt).getTime() > cutoff,
    );
  } catch {
    return [];
  }
}

export function writePending(
  identifier: string,
  items: readonly PendingMoment[],
): void {
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(pendingKey(identifier));
      return;
    }
    sessionStorage.setItem(pendingKey(identifier), JSON.stringify(items));
  } catch {
    // sessionStorage may be unavailable in private or restricted contexts.
  }
}

export function addPendingMoment(
  identifier: string,
  mediaType: PendingMoment["mediaType"],
): void {
  const entry: PendingMoment = {
    localId: crypto.randomUUID(),
    mediaType,
    uploadedAt: new Date().toISOString(),
  };
  writePending(identifier, [...readPending(identifier), entry]);
}

/** Selects sparse 2×2 featured cards without creating masonry gaps. */
export function getCardType(index: number): "normal" | "featured" {
  if ((index + 1) % 10 !== 0) return "normal";
  return index % 9 === 8 ? "normal" : "featured";
}
