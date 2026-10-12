export type SharedUploadGate = "published" | "disabled" | "limit-reached" | null;

interface SharedUploadOpenInput {
  allowUploads?: boolean | null;
  shareUploadsEnabled?: boolean | null;
}

interface SharedUploadGateInput {
  uploadsNotEnabled: boolean;
  wallPublished: boolean;
  quotaLoaded: boolean;
  uploadsRemaining: number | null;
}

export function isSharedUploadOpen({
  allowUploads,
  shareUploadsEnabled,
}: SharedUploadOpenInput): boolean {
  return allowUploads === true && shareUploadsEnabled === true;
}

export function getSharedUploadGate({
  uploadsNotEnabled,
  wallPublished,
  quotaLoaded,
  uploadsRemaining,
}: SharedUploadGateInput): SharedUploadGate {
  if (wallPublished) return "published";
  if (uploadsNotEnabled) return "disabled";
  if (quotaLoaded && uploadsRemaining !== null && uploadsRemaining <= 0) {
    return "limit-reached";
  }
  return null;
}

export interface SharedUploadStatusSnapshot {
  uploadsNotEnabled: boolean;
  wallPublished: boolean;
  uploadsRemaining: number | null;
}

export type ForbiddenUploadOutcome =
  /** Some files made it: acknowledge them on the success screen. */
  | "acknowledge-uploaded"
  /** The fresh status explains the 403 (published / disabled / limit). */
  | "show-gate"
  /** Status could not be re-checked; the status error screen takes over. */
  | "status-unavailable"
  /** Status says uploads are open: let the guest try again. */
  | "retry";

/**
 * A 403 during a shared upload can mean the wall was just published, the
 * organizer turned uploads off, or the guest hit the limit. Decide what to
 * show from a fresh upload-status check instead of assuming "coming soon".
 */
export function resolveForbiddenUploadOutcome(
  doneCount: number,
  status: SharedUploadStatusSnapshot | null,
): ForbiddenUploadOutcome {
  if (doneCount > 0) return "acknowledge-uploaded";
  if (!status) return "status-unavailable";
  const gate = getSharedUploadGate({ ...status, quotaLoaded: true });
  return gate ? "show-gate" : "retry";
}

export type UploadBatchOutcome =
  | { kind: "all-done"; doneCount: number; skippedCount: 0 }
  /** The quota ran out (429) after some files were uploaded. */
  | { kind: "partial-limit"; doneCount: number; skippedCount: number }
  | { kind: "incomplete"; doneCount: number; skippedCount: number };

/** What the shared upload page shows once a batch finishes. */
export function resolveUploadBatchOutcome(
  entries: ReadonlyArray<{ status: string }>,
  quotaExhausted: boolean,
): UploadBatchOutcome {
  const doneCount = entries.filter((entry) => entry.status === "done").length;
  const skippedCount = entries.length - doneCount;
  if (entries.length > 0 && skippedCount === 0) {
    return { kind: "all-done", doneCount, skippedCount: 0 };
  }
  if (doneCount > 0 && quotaExhausted) {
    return { kind: "partial-limit", doneCount, skippedCount };
  }
  return { kind: "incomplete", doneCount, skippedCount };
}

export function limitReachedNotice(skippedCount: number): string {
  return skippedCount === 1
    ? "Llegaste al límite de archivos para este evento, así que 1 archivo no se subió."
    : `Llegaste al límite de archivos para este evento, así que ${skippedCount} archivos no se subieron.`;
}
