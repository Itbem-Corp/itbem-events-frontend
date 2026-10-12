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
