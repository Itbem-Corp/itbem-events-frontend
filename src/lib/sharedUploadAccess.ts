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
