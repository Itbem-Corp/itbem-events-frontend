export type PublicMomentProcessingStatus =
  | ""
  | "pending"
  | "processing"
  | "done"
  | "failed";
export type PublicMomentApprovalStatus = "approved" | "pending_review";
export type PublicMomentPublicationStatus =
  | "published"
  | "processing"
  | "pending_review"
  | "failed";

export const PUBLIC_MOMENT_MEDIA_REFRESH_SKEW_MS = 60 * 1000;
export const PUBLIC_MOMENTS_LIVE_REFRESH_MS = 30 * 1000;

export interface PublicMoment {
  id: string;
  title?: string;
  content_url: string;
  content_url_expires_at?: string;
  content_view_url?: string;
  content_view_url_expires_at?: string;
  thumbnail_url?: string;
  thumbnail_url_expires_at?: string;
  thumbnail_view_url?: string;
  thumbnail_view_url_expires_at?: string;
  description?: string;
  created_at: string;
  order?: number;
  approval_status?: PublicMomentApprovalStatus;
  publication_status?: PublicMomentPublicationStatus;
  processing_status?: PublicMomentProcessingStatus;
  processing_duration_ms?: number;
  original_size_bytes?: number;
  optimized_size_bytes?: number;
  content_type?: string;
  error_message?: string;
  media_variants?: PublicMediaVariant[];
}

export interface PublicMediaVariant {
  url: string;
  view_url?: string;
  view_url_expires_at?: string;
  width: number;
  format: "webp" | "avif";
  bytes?: number;
}

export interface PublicMomentsPage {
  items: PublicMoment[];
  total?: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
  next_cursor?: string;
  published?: boolean;
  moments_wall_published?: boolean;
  show_moment_wall?: boolean;
  allow_uploads?: boolean;
  allow_messages?: boolean;
  share_uploads_enabled?: boolean;
  uploads_limit?: number;
  uploads_remaining?: number;
  uploads_used?: number;
  event_name?: string;
  event_type?: string;
  event_date?: string;
  event_date_time?: string;
  timezone?: string;
}
