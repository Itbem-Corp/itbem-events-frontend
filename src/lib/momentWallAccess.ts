interface PersonalUploadAccessInput {
  prettyToken?: string | null;
  identifier?: string | null;
  allowUploads?: boolean | null;
  wallPublished?: boolean | null;
  uploadsRemaining?: number | null;
}

interface MomentWallPublishedInput {
  moments_wall_published?: boolean | null;
  momentsWallPublished?: boolean | null;
  show_moment_wall?: boolean | null;
  show_wall?: boolean | null;
  showMomentWall?: boolean | null;
  showWall?: boolean | null;
  published?: boolean | null;
}

export function resolveMomentWallPublished({
  moments_wall_published,
  momentsWallPublished,
  show_moment_wall,
  show_wall,
  showMomentWall,
  showWall,
  published,
}: MomentWallPublishedInput): boolean {
  return (
    moments_wall_published ??
    momentsWallPublished ??
    show_moment_wall ??
    show_wall ??
    showMomentWall ??
    showWall ??
    published ??
    false
  );
}

export function canShowPersonalUpload({
  prettyToken,
  identifier,
  allowUploads,
  wallPublished,
  uploadsRemaining,
}: PersonalUploadAccessInput): boolean {
  if (!prettyToken || !identifier || !allowUploads || wallPublished)
    return false;
  if (
    typeof uploadsRemaining === "number" &&
    Number.isFinite(uploadsRemaining) &&
    uploadsRemaining <= 0
  ) {
    return false;
  }
  return true;
}
