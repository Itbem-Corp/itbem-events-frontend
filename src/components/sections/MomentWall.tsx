"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useId,
  memo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import InvitationLoader, { type InvitationData } from "../InvitationDataLoader";
import PublicEventPasswordGate from "../common/PublicEventPasswordGate";
import { PublicEventLoadError } from "../common/PublicEventLoadError";
import type { SectionComponentProps, MomentWallConfig } from "../engine/types";
import { addPendingMoment } from "../../lib/momentGalleryState";
import { usePublicEventAccess } from "../../hooks/usePublicEventAccess";
import { useVideoThumbnail } from "../../hooks/useVideoThumbnail";
import { normalizeEventsUrl } from "../../lib/eventsUrl";
import {
  buildEventMomentsUrl,
  buildPersonalMomentConfirmUrl,
  buildPersonalMomentUploadUrl,
} from "../../lib/apiUrls";
import { fetchApiData, isApiFetchError } from "../../lib/apiFetch";
import {
  canShowPersonalUpload,
  resolveMomentWallPublished,
} from "../../lib/momentWallAccess";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  resolvePublicAccessParams,
} from "../../lib/publicPreview";
import { isVideoMedia, resolvePublicMediaUrl } from "../../lib/mediaUrl";
import {
  resolvePublicLoadFailure,
  type PublicLoadFailure,
} from "../../lib/publicLoadFailure";
import { resolveMomentUploadContentType } from "../../lib/momentUploadContentType";
import { optimizeMomentUploadImage } from "../../lib/momentUploadImage";
import {
  requireMomentUploadPresign,
  type MomentUploadUrl,
} from "../../lib/momentUploads";
import {
  readUploadQuota,
  reconcileUploadQuotaRemaining,
} from "../../lib/uploadQuota";
import {
  UPLOAD_FILE_ACCEPT,
  validateUploadFile,
} from "../../lib/uploadFilePolicy";
import { uploadToPresignedUrl } from "../../lib/presignedUpload";
import { retryUploadApiOnce } from "../../lib/uploadRetry";
import {
  getPublicMomentsRefreshDelay,
  mergePublicMomentsById,
  normalizePublicMomentsPage,
  normalizePublicMomentUploadResponse,
  PUBLIC_MOMENTS_LIVE_REFRESH_MS,
  publicMomentContentUrl,
  publicMomentsMediaRefreshKey,
  publicMomentPreviewUrl,
  publicMomentThumbnailUrl,
  publicMomentUploadSuccessMessage,
  shouldReplacePublicMomentsOnLiveRefresh,
  shouldShowProcessingStub,
  type PublicMoment as Moment,
} from "../../lib/publicMoments";

const themedHeadingStyle: CSSProperties = {
  color: "var(--eventi-color-heading, #111827)",
  fontFamily: "var(--eventi-font-heading-effective, inherit)",
};

const themedBodyStyle: CSSProperties = {
  color: "var(--eventi-color-body, #374151)",
  fontFamily: "var(--eventi-font-body-effective, inherit)",
};

const themedMutedStyle: CSSProperties = {
  color: "var(--eventi-color-muted, #6b7280)",
};

const themedSurfaceStyle: CSSProperties = {
  ...themedBodyStyle,
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
};

const themedPrimaryButtonStyle: CSSProperties = {
  backgroundColor: "var(--eventi-color-heading, #111827)",
  color: "var(--eventi-color-surface, #ffffff)",
};

const themedSecondaryButtonStyle: CSSProperties = {
  ...themedBodyStyle,
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
  borderColor: "var(--eventi-color-border, #e5e7eb)",
};

const themedInputStyle: CSSProperties = {
  ...themedBodyStyle,
  backgroundColor: "var(--eventi-color-surface, #ffffff)",
  borderColor: "var(--eventi-color-border, #e5e7eb)",
};

const themedSkeletonStyle: CSSProperties = {
  backgroundColor:
    "color-mix(in srgb, var(--eventi-color-border, #e5e7eb) 55%, transparent)",
};

const themedProgressTrackStyle: CSSProperties = {
  backgroundColor:
    "color-mix(in srgb, var(--eventi-color-border, #e5e7eb) 35%, transparent)",
};

const themedProgressBarStyle: CSSProperties = {
  backgroundColor: "var(--eventi-color-accent, #111827)",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

// ── LightboxVideo — autoplay with iOS fallback ───────────────────────────────
function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

const LightboxVideo = memo(function LightboxVideo({
  src,
  className,
}: {
  src: string;
  className: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setNeedsTap(false);
    const p = video.play();
    if (p !== undefined) {
      p.catch(() => setNeedsTap(true));
    }
  }, [src]);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className={className}
      />
      {needsTap && (
        <button
          onClick={() => {
            videoRef.current?.play();
            setNeedsTap(false);
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl"
          aria-label="Reproducir video"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-white ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
});

interface VideoMomentCardProps {
  moment: Moment;
  EVENTS_URL: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}

function VideoMomentCard({
  moment,
  EVENTS_URL,
  onClick,
}: VideoMomentCardProps) {
  const thumbnailUrl = publicMomentThumbnailUrl(moment);
  const contentUrl = publicMomentContentUrl(moment);
  // Only invoke canvas extraction when the backend thumbnail is absent
  const extractedFrame = useVideoThumbnail(
    thumbnailUrl ? null : resolvePublicMediaUrl(contentUrl, EVENTS_URL),
  );

  const posterSrc = thumbnailUrl
    ? resolvePublicMediaUrl(thumbnailUrl, EVENTS_URL)
    : extractedFrame; // null while extracting → falls back to grey div

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black relative group"
    >
      <div className="relative">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={moment.description || "Video del evento"}
            className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          /* Grey fallback: shown until Lambda thumbnail or canvas frame is ready */
          <div className="aspect-video bg-gray-900 w-full group-hover:brightness-110 transition-[filter] duration-300" />
        )}
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white ml-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function MomentWall({
  config,
  EVENTS_URL: rawEventsUrl,
  publicAccess,
}: SectionComponentProps) {
  const EVENTS_URL = normalizeEventsUrl(rawEventsUrl);
  const cfg = config as unknown as MomentWallConfig;
  const title = cfg.title ?? "Momentos";
  const subtitle = cfg.moment_request_message ?? cfg.subtitle;
  const identifier = cfg.identifier;
  const allowUploads = cfg.allow_uploads ?? false;
  const allowMessages = cfg.allow_messages ?? false;
  const wallPublished = resolveMomentWallPublished(cfg);
  const maxUploadsPerGuest = positiveInt(cfg.max_uploads_per_guest);

  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const [lightbox, setLightbox] = useState<Moment | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const lightboxDialogRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxOpenerRef = useRef<HTMLElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const lastMediaRefreshKeyRef = useRef<string | null>(null);
  const wallTotalRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<PublicLoadFailure | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");
  const uploadDialogRef = useRef<HTMLDivElement>(null);
  const uploadCloseRef = useRef<HTMLButtonElement>(null);
  const uploadOpenerRef = useRef<HTMLElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadingRef = useRef(false);
  const uploadTitleId = useId();
  const uploadFileId = useId();
  const uploadNoteId = useId();
  const lightboxTitleId = useId();

  const [invData, setInvData] = useState<InvitationData | null>(null);
  const [urlAccess, setUrlAccess] = useState({
    ready: false,
    isPreview: false,
    invitationToken: "",
    previewToken: "",
    previewCacheKey: "",
    sendCacheKey: false,
    accessToken: "",
  });
  const [liveUploadAccess, setLiveUploadAccess] = useState<{
    ready: boolean;
    allowUploads?: boolean;
    wallPublished?: boolean;
    uploadsRemaining?: number;
  }>({ ready: false });
  const {
    ready: urlAccessReady,
    invitationToken,
    previewToken,
    previewCacheKey,
    sendCacheKey,
    accessToken: urlAccessToken,
  } = urlAccess;
  const eventAccess = usePublicEventAccess({
    eventsUrl: EVENTS_URL,
    identifier: identifier ?? "",
    previewToken,
    previewCacheKey,
    sendCacheKey,
    invitationToken,
    accessToken: urlAccessToken,
    enabled: Boolean(identifier && urlAccessReady),
  });
  const accessToken = eventAccess.accessToken;
  const publicAccessForRequests = useMemo(
    () => ({
      previewToken,
      cacheKey: previewCacheKey,
      sendCacheKey,
      invitationToken,
      accessToken,
    }),
    [accessToken, invitationToken, previewCacheKey, previewToken, sendCacheKey],
  );
  const prettyToken = invData?.prettyToken ?? "";
  const mediaRefreshDelay = useMemo(
    () => getPublicMomentsRefreshDelay(moments),
    [moments],
  );
  const mediaRefreshKey = useMemo(
    () => publicMomentsMediaRefreshKey(moments),
    [moments],
  );
  const effectiveWallPublished =
    liveUploadAccess.wallPublished ?? wallPublished;

  const applyPersonalUploadQuota = useCallback((payload: unknown) => {
    const backendRemaining = readUploadQuota(payload).remaining;
    if (backendRemaining === null) return;

    setLiveUploadAccess((current) => {
      const remaining = reconcileUploadQuotaRemaining(
        current.uploadsRemaining ?? null,
        backendRemaining,
      );
      return {
        ...current,
        ready: true,
        uploadsRemaining: remaining ?? undefined,
      };
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const accessParams = resolvePublicAccessParams(
      publicAccess,
      window.location.search,
    );
    setUrlAccess({
      ready: true,
      isPreview: accessParams.isPreview,
      invitationToken: accessParams.invitationToken,
      previewToken: accessParams.previewToken,
      previewCacheKey: accessParams.cacheKey,
      sendCacheKey: Boolean(accessParams.sendCacheKey),
      accessToken: accessParams.accessToken ?? "",
    });
  }, [
    publicAccess?.accessToken,
    publicAccess?.cacheKey,
    publicAccess?.invitationToken,
    publicAccess?.previewToken,
    publicAccess?.sendCacheKey,
  ]);

  const fetchMoments = useCallback(
    async (pageNum = 1, append = false, refreshFirstPage = false) => {
      if (!urlAccessReady) return;
      if (!eventAccess.ready) return;
      if (eventAccess.passwordRequired) {
        setLoading(false);
        return;
      }
      if (!identifier) {
        setLoading(false);
        return;
      }
      try {
        if (!append && !refreshFirstPage) setLoadError(null);
        const data = normalizePublicMomentsPage(
          await fetchApiData<unknown>(
            buildEventMomentsUrl(EVENTS_URL, identifier, {
              page: pageNum,
              limit: 20,
              ...publicAccessQueryParams(publicAccessForRequests),
              pretty_token: prettyToken,
            }),
            publicAccessFetchInit(publicAccessForRequests),
            "No se pudieron cargar los momentos",
          ),
        );
        setLiveUploadAccess({
          ready: true,
          allowUploads: data.allow_uploads,
          wallPublished: data.moments_wall_published,
          uploadsRemaining: data.uploads_remaining,
        });
        const items = data?.items ?? [];
        const previousTotal = wallTotalRef.current;
        const nextTotal = data.total;
        setMoments((prev) =>
          append
            ? mergePublicMomentsById(prev, items)
            : refreshFirstPage
              ? shouldReplacePublicMomentsOnLiveRefresh(
                  previousTotal,
                  nextTotal,
                  prev,
                  items,
                )
                ? mergePublicMomentsById([], items)
                : mergePublicMomentsById(prev, items, {
                    prependIncoming: true,
                  })
              : mergePublicMomentsById([], items),
        );
        if (typeof nextTotal === "number") wallTotalRef.current = nextTotal;
        if (!refreshFirstPage) {
          setHasMore(data?.has_more ?? false);
          setPage(pageNum);
        }
      } catch (err: unknown) {
        if (append) {
          setLoadMoreError(true);
        } else if (!refreshFirstPage) {
          setLoadError(
            resolvePublicLoadFailure({
              status: isApiFetchError(err) ? err.status : null,
              resource: "moments",
              backendMessage:
                err instanceof Error
                  ? err.message
                  : "No se pudieron cargar los momentos",
            }),
          );
          setMoments([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      identifier,
      EVENTS_URL,
      accessToken,
      eventAccess.ready,
      eventAccess.passwordRequired,
      prettyToken,
      publicAccessForRequests,
      urlAccessReady,
    ],
  );

  useEffect(() => {
    fetchMoments(1, false);
  }, [fetchMoments]);

  const retryMoments = useCallback(() => {
    setLoading(true);
    void fetchMoments(1, false);
  }, [fetchMoments]);

  useEffect(() => {
    if (
      !urlAccessReady ||
      !identifier ||
      mediaRefreshDelay === null ||
      !mediaRefreshKey
    )
      return;

    const refreshMedia = () => {
      lastMediaRefreshKeyRef.current = mediaRefreshKey;
      void fetchMoments(1, false);
    };

    if (mediaRefreshDelay <= 0) {
      if (lastMediaRefreshKeyRef.current === mediaRefreshKey) return;
      refreshMedia();
      return;
    }

    const timer = window.setTimeout(refreshMedia, mediaRefreshDelay);
    return () => window.clearTimeout(timer);
  }, [
    fetchMoments,
    identifier,
    mediaRefreshDelay,
    mediaRefreshKey,
    urlAccessReady,
  ]);

  useEffect(() => {
    if (
      !urlAccessReady ||
      !eventAccess.ready ||
      eventAccess.passwordRequired ||
      effectiveWallPublished !== true ||
      !identifier
    )
      return;

    const refreshLiveMoments = () => {
      if (document.visibilityState !== "visible") return;
      void fetchMoments(1, false, true);
    };

    const interval = window.setInterval(
      refreshLiveMoments,
      PUBLIC_MOMENTS_LIVE_REFRESH_MS,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshLiveMoments();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    effectiveWallPublished,
    eventAccess.passwordRequired,
    eventAccess.ready,
    fetchMoments,
    identifier,
    urlAccessReady,
  ]);

  const isLightboxOpen = Boolean(lightbox);

  useEffect(() => {
    uploadingRef.current = uploading;
  }, [uploading]);

  useEffect(
    () => () => {
      uploadAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isLightboxOpen) return;

    const dialog = lightboxDialogRef.current;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    if (scrollbarGap > 0) {
      const computedPadding = Number.parseFloat(
        window.getComputedStyle(body).paddingRight,
      );
      body.style.paddingRight = `${(Number.isFinite(computedPadding) ? computedPadding : 0) + scrollbarGap}px`;
    }
    body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      lightboxCloseRef.current?.focus({ preventScroll: true });
    });
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setLightbox(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      const opener = lightboxOpenerRef.current;
      lightboxOpenerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [isLightboxOpen]);

  useEffect(() => {
    if (!showUpload) return;

    const dialog = uploadDialogRef.current;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarGap = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    if (scrollbarGap > 0) {
      const computedPadding = Number.parseFloat(
        window.getComputedStyle(body).paddingRight,
      );
      body.style.paddingRight = `${(Number.isFinite(computedPadding) ? computedPadding : 0) + scrollbarGap}px`;
    }
    body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      uploadCloseRef.current?.focus({ preventScroll: true });
    });
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploadingRef.current) {
        event.preventDefault();
        setShowUpload(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      const opener = uploadOpenerRef.current;
      uploadOpenerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [showUpload]);

  // Keyboard nav for lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.target instanceof HTMLVideoElement) return;
      if (e.key === "ArrowRight") {
        const next = moments[lightboxIdx + 1];
        if (next) {
          e.preventDefault();
          setLightbox(next);
          setLightboxIdx((i) => i + 1);
        }
      }
      if (e.key === "ArrowLeft") {
        const prev = moments[lightboxIdx - 1];
        if (prev) {
          e.preventDefault();
          setLightbox(prev);
          setLightboxIdx((i) => i - 1);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, lightboxIdx, moments]);

  // Preload the adjacent moments so lightbox navigation feels instant
  useEffect(() => {
    if (!lightbox) return;
    const preload = (m: Moment | undefined) => {
      if (!m) return;
      const src = resolvePublicMediaUrl(publicMomentContentUrl(m), EVENTS_URL);
      if (!src || isVideoMedia(src, m.content_type)) return;
      const img = new Image();
      img.src = src;
    };
    preload(moments[lightboxIdx - 1]);
    preload(moments[lightboxIdx + 1]);
  }, [lightbox, lightboxIdx, moments, EVENTS_URL]);

  const openLightbox = (m: Moment, idx: number, opener: HTMLElement) => {
    lightboxOpenerRef.current = opener;
    setLightbox(m);
    setLightboxIdx(idx);
  };

  const handleLoadMore = () => {
    setLoadingMore(true);
    setLoadMoreError(false);
    fetchMoments(page + 1, true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return; // ignore small swipes
    if (diff > 0) {
      // swiped left → next
      const next = moments[lightboxIdx + 1];
      if (next) {
        setLightbox(next);
        setLightboxIdx((i) => i + 1);
      }
    } else {
      // swiped right → prev
      const prev = moments[lightboxIdx - 1];
      if (prev) {
        setLightbox(prev);
        setLightboxIdx((i) => i - 1);
      }
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invData?.prettyToken || !identifier || uploadingRef.current) return;
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const descInput = form.elements.namedItem(
      "description",
    ) as HTMLTextAreaElement | null;
    const file = fileInput.files?.[0];
    if (!file) return;
    const fileError = validateUploadFile(file);
    if (fileError) {
      setUploadError(fileError);
      return;
    }
    setUploading(true);
    setUploadError("");
    setUploadProgress(2);
    const uploadController = new AbortController();
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = uploadController;

    try {
      const fileToUpload = await optimizeMomentUploadImage(file, {
        maxDimension: 2560,
        quality: 0.9,
        signal: uploadController.signal,
      });
      const contentType = resolveMomentUploadContentType(fileToUpload);
      setUploadProgress(8);

      const data = await retryUploadApiOnce(
        () =>
          fetchApiData<MomentUploadUrl>(
            buildPersonalMomentUploadUrl(EVENTS_URL, identifier),
            publicAccessFetchInit(publicAccessForRequests, {
              method: "POST",
              signal: uploadController.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pretty_token: invData.prettyToken,
                content_type: contentType,
                filename: fileToUpload.name,
                file_size: fileToUpload.size,
              }),
            }),
            "Error al preparar la subida",
          ),
        800,
        uploadController.signal,
      );
      const presign = requireMomentUploadPresign(data, contentType);

      await uploadToPresignedUrl({
        url: presign.uploadUrl,
        body: fileToUpload,
        contentType: presign.contentType,
        signal: uploadController.signal,
        timeoutMs: 120_000,
        maxAttempts: 3,
        onProgress: (progress) => {
          setUploadProgress(8 + Math.round(progress * 0.82));
        },
      });
      setUploadProgress(94);

      const uploadResponse = await retryUploadApiOnce(
        () =>
          fetchApiData<unknown>(
            buildPersonalMomentConfirmUrl(EVENTS_URL, identifier),
            publicAccessFetchInit(publicAccessForRequests, {
              method: "POST",
              signal: uploadController.signal,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pretty_token: invData.prettyToken,
                object_key: presign.objectKey,
                s3_key: presign.objectKey,
                content_type: presign.contentType,
                description: allowMessages ? (descInput?.value ?? "") : "",
              }),
            }),
            "Error al confirmar la subida",
          ),
        800,
        uploadController.signal,
      );
      const uploadedMoment =
        normalizePublicMomentUploadResponse(uploadResponse);
      applyPersonalUploadQuota(uploadResponse);

      setUploadProgress(100);
      setUploadSuccessMessage(publicMomentUploadSuccessMessage(uploadedMoment));
      setShowUpload(false);
      form.reset();
      // Store a local stub only when the backend says the moment is approved
      // but still waiting for media processing.
      if (identifier && shouldShowProcessingStub(uploadedMoment)) {
        const isVideoUpload = presign.contentType.startsWith("video/");
        addPendingMoment(identifier, isVideoUpload ? "video" : "image");
      }
      fetchMoments(1, false);
      setTimeout(() => setUploadSuccessMessage(""), 5000);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setUploadError("La subida fue cancelada. Puedes intentarlo de nuevo.");
        return;
      }
      if (isApiFetchError(err)) applyPersonalUploadQuota(err.payload);
      setUploadError(
        err instanceof Error ? err.message : "Error al subir el archivo",
      );
    } finally {
      if (uploadAbortControllerRef.current === uploadController) {
        uploadAbortControllerRef.current = null;
      }
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const canUpload =
    liveUploadAccess.ready &&
    canShowPersonalUpload({
      prettyToken,
      identifier,
      allowUploads: liveUploadAccess.allowUploads ?? allowUploads,
      wallPublished: effectiveWallPublished,
      uploadsRemaining: liveUploadAccess.uploadsRemaining,
    });

  if (eventAccess.passwordRequired && identifier) {
    return (
      <PublicEventPasswordGate
        title="Momentos privados"
        description="Ingresa la contrasena del evento para ver y compartir momentos."
        className="min-h-[360px] bg-white"
        standalone={false}
        onVerify={eventAccess.verifyPassword}
      />
    );
  }

  return (
    <section className="py-16 px-4">
      {invitationToken && (
        <InvitationLoader
          token={invitationToken}
          EVENTS_URL={EVENTS_URL}
          publicAccess={publicAccessForRequests}
          onLoaded={setInvData}
        />
      )}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2
            className="text-2xl sm:text-3xl font-bold"
            style={themedHeadingStyle}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2" style={themedMutedStyle}>
              {subtitle}
            </p>
          )}
        </div>

        {/* Success toast */}
        <AnimatePresence>
          {uploadSuccessMessage && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mb-6 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center"
            >
              {uploadSuccessMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload button */}
        {canUpload && (
          <div className="mb-8 text-center">
            <button
              type="button"
              onClick={(event) => {
                uploadOpenerRef.current = event.currentTarget;
                setShowUpload(true);
              }}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-opacity hover:opacity-90"
              style={themedPrimaryButtonStyle}
            >
              <Upload aria-hidden="true" className="size-4" />
              Subir foto o video
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl animate-pulse"
                style={themedSkeletonStyle}
              />
            ))}
          </div>
        ) : loadError ? (
          <PublicEventLoadError
            kind="moments"
            standalone={false}
            title={loadError.title}
            message={loadError.message}
            supportText={loadError.supportText}
            onRetry={loadError.retryable ? retryMoments : undefined}
          />
        ) : moments.length === 0 ? (
          <p className="text-center py-12 text-sm" style={themedMutedStyle}>
            Aún no hay momentos compartidos.
          </p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {moments.map((m, idx) => {
              const contentSrc = resolvePublicMediaUrl(
                publicMomentContentUrl(m),
                EVENTS_URL,
              );
              const src = resolvePublicMediaUrl(
                publicMomentPreviewUrl(m),
                EVENTS_URL,
              );
              const video = isVideoMedia(contentSrc, m.content_type);
              if (video) {
                return (
                  <VideoMomentCard
                    key={m.id}
                    moment={m}
                    EVENTS_URL={EVENTS_URL}
                    onClick={(event) =>
                      openLightbox(m, idx, event.currentTarget)
                    }
                  />
                );
              }
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={(event) => openLightbox(m, idx, event.currentTarget)}
                  className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black relative group"
                >
                  <img
                    src={src}
                    alt={m.description || "Momento del evento"}
                    className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => {
                setLoadMoreError(false);
                handleLoadMore();
              }}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-sm transition-opacity hover:opacity-85 disabled:opacity-50"
              style={themedSecondaryButtonStyle}
            >
              {loadingMore ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  Cargando…
                </>
              ) : (
                "Ver más momentos"
              )}
            </button>
            {loadMoreError && (
              <p role="alert" className="mt-2 text-xs text-red-500">
                Error al cargar más momentos. Intenta de nuevo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            ref={lightboxDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={lightboxTitleId}
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(null)}
          >
            <h2 id={lightboxTitleId} className="sr-only">
              Visor de momentos
            </h2>
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="relative max-w-3xl w-full"
              style={{ touchAction: "none" }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {isVideoMedia(
                resolvePublicMediaUrl(
                  publicMomentContentUrl(lightbox),
                  EVENTS_URL,
                ),
                lightbox.content_type,
              ) ? (
                <LightboxVideo
                  src={resolvePublicMediaUrl(
                    publicMomentContentUrl(lightbox),
                    EVENTS_URL,
                  )}
                  className="w-full max-h-[80vh] rounded-xl"
                />
              ) : (
                <img
                  src={resolvePublicMediaUrl(
                    publicMomentContentUrl(lightbox),
                    EVENTS_URL,
                  )}
                  alt={lightbox.description || "Momento"}
                  draggable={false}
                  className="w-full max-h-[80vh] object-contain rounded-xl"
                />
              )}
              {lightbox.description && (
                <p className="mt-3 text-center text-white/70 text-sm whitespace-pre-wrap break-words">
                  {lightbox.description}
                </p>
              )}
              {/* Accessible live region announcing current position */}
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {lightbox
                  ? `Momento ${lightboxIdx + 1} de ${moments.length}`
                  : ""}
              </span>
              {/* Close */}
              <button
                ref={lightboxCloseRef}
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute top-3 right-3 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                aria-label="Cerrar"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              {/* Prev / Next */}
              {lightboxIdx > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const p = moments[lightboxIdx - 1];
                    setLightbox(p);
                    setLightboxIdx((i) => i - 1);
                  }}
                  className="absolute left-3 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Anterior"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
              )}
              {lightboxIdx < moments.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const n = moments[lightboxIdx + 1];
                    setLightbox(n);
                    setLightboxIdx((i) => i + 1);
                  }}
                  className="absolute right-3 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Siguiente"
                >
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => !uploading && setShowUpload(false)}
          >
            <motion.div
              ref={uploadDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={uploadTitleId}
              aria-busy={uploading}
              tabIndex={-1}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
              style={themedSurfaceStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                ref={uploadCloseRef}
                type="button"
                onClick={() => !uploading && setShowUpload(false)}
                disabled={uploading}
                className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded-full transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/30 disabled:cursor-wait disabled:opacity-40"
                aria-label="Cerrar formulario de subida"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <h3
                id={uploadTitleId}
                className="mb-4 pr-10 text-lg font-semibold"
                style={themedHeadingStyle}
              >
                Subir foto o video
              </h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label
                    htmlFor={uploadFileId}
                    className="block text-sm font-medium mb-1"
                    style={themedBodyStyle}
                  >
                    Archivo{" "}
                    <span aria-hidden="true" className="text-red-500">
                      *
                    </span>
                  </label>
                  <input
                    ref={fileInputRef}
                    id={uploadFileId}
                    name="file"
                    type="file"
                    accept={UPLOAD_FILE_ACCEPT}
                    disabled={uploading}
                    required
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
                    style={themedMutedStyle}
                  />
                  {maxUploadsPerGuest && (
                    <p className="mt-2 text-xs" style={themedMutedStyle}>
                      Puedes subir hasta {maxUploadsPerGuest} archivos en este
                      evento.
                    </p>
                  )}
                </div>
                {allowMessages && (
                  <div>
                    <label
                      htmlFor={uploadNoteId}
                      className="block text-sm font-medium mb-1"
                      style={themedBodyStyle}
                    >
                      Nota (opcional)
                    </label>
                    <textarea
                      id={uploadNoteId}
                      name="description"
                      placeholder="Un momento especial…"
                      disabled={uploading}
                      rows={2}
                      maxLength={300}
                      className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                      style={themedInputStyle}
                    />
                  </div>
                )}
                {uploadError && (
                  <p role="alert" className="text-sm text-red-600">
                    {uploadError}
                  </p>
                )}
                {uploading && uploadProgress > 0 && (
                  <div
                    className="space-y-1"
                    role="progressbar"
                    aria-label="Progreso de subida"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadProgress}
                  >
                    <div
                      className="flex justify-between text-xs"
                      style={themedMutedStyle}
                    >
                      <span>
                        {uploadProgress < 8
                          ? "Optimizando imagen…"
                          : uploadProgress < 94
                            ? "Subiendo archivo…"
                            : uploadProgress < 100
                              ? "Procesando…"
                              : "¡Listo!"}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-full overflow-hidden"
                      style={themedProgressTrackStyle}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          ...themedProgressBarStyle,
                          width: `${uploadProgress}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (uploading) {
                        uploadAbortControllerRef.current?.abort();
                      } else {
                        setShowUpload(false);
                      }
                    }}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
                    style={themedSecondaryButtonStyle}
                  >
                    {uploading ? "Cancelar subida" : "Cancelar"}
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={themedPrimaryButtonStyle}
                  >
                    {uploading ? "Subiendo…" : "Subir"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
