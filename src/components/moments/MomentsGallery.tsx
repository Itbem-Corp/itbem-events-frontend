"use client";

import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Camera,
  Gem,
  GraduationCap,
  Images,
  Leaf,
  LoaderCircle,
  PartyPopper,
  Play,
  Quote,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { getTheme, type MomentsTheme } from "./themes";
import PublicEventPasswordGate from "../common/PublicEventPasswordGate";
import { PublicEventLoadError } from "../common/PublicEventLoadError";
import { usePublicEventAccess } from "../../hooks/usePublicEventAccess";
import { normalizeEventsUrl } from "../../lib/eventsUrl";
import { buildEventMomentsUrl, buildEventPhrasesUrl } from "../../lib/apiUrls";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  resolvePublicAccessParams,
  type PublicAccessFetchParams,
} from "../../lib/publicPreview";
import { fetchApiData, isApiFetchError } from "../../lib/apiFetch";
import {
  normalizeEventPhraseType,
  type EventPhrasesResponse,
} from "../../lib/eventPhrases";
import { extractPathIdentifier } from "../../lib/pathIdentifier";
import { formatPublicEventDate } from "../../lib/eventDate";
import { isVideoMedia, resolvePublicMediaUrl } from "../../lib/mediaUrl";
import {
  getPublicMomentsRefreshDelay,
  mergePublicMomentsById,
  normalizePublicMomentsPage,
  PUBLIC_MOMENTS_LIVE_REFRESH_MS,
  publicMomentContentUrl,
  publicMomentMediaSrcSet,
  publicMomentsMediaRefreshKey,
  publicMomentPreviewUrl,
  shouldReplacePublicMomentsOnLiveRefresh,
  type PublicMoment as Moment,
} from "../../lib/publicMoments";
import {
  resolvePublicLoadFailure,
  type PublicLoadFailure,
} from "../../lib/publicLoadFailure";
import { installPublicRum, recordPublicRumMetric } from "../../lib/publicRum";
import {
  getCardType,
  readPending,
  writePending,
  type PendingMoment,
} from "../../lib/momentGalleryState";

const loadMomentsGalleryLightbox = () => import("./MomentsGalleryLightbox");
const AsyncMomentsGalleryLightbox = lazy(() =>
  loadMomentsGalleryLightbox().then(({ MomentsGalleryLightbox }) => ({
    default: MomentsGalleryLightbox,
  })),
);

function preloadMomentsGalleryLightbox() {
  void loadMomentsGalleryLightbox();
}

const THEME_MICRO_ICONS: Record<MomentsTheme["microIcon"], LucideIcon> = {
  leaf: Leaf,
  graduation: GraduationCap,
  party: PartyPopper,
  gem: Gem,
  sparkles: Sparkles,
};

// ── Types ──────────────────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return "";
  return extractPathIdentifier(
    window.location.pathname,
    /\/e\/([^/]+)\/momentos/,
  );
}

function resolveMediaUrl(m: Moment, EVENTS_URL: string): string {
  return resolvePublicMediaUrl(publicMomentPreviewUrl(m), EVENTS_URL);
}

function resolveFullUrl(m: Moment, EVENTS_URL: string): string {
  return resolvePublicMediaUrl(publicMomentContentUrl(m), EVENTS_URL);
}

const PAGE_SIZE = 25; // Scroll load size
const INITIAL_PAGE_SIZE = 40; // Fast first paint; the remaining moments stream in as the guest scrolls.
const MAX_TOTAL = 500;
const PROCESSING_POLL_MS = 12_000;

// ── MomentsGallery ─────────────────────────────────────────────────────────

interface Props {
  EVENTS_URL: string;
  previewToken?: string;
  publicAccess?: PublicAccessFetchParams;
}

export default function MomentsGallery({
  EVENTS_URL: rawEventsUrl,
  previewToken = "",
  publicAccess,
}: Props) {
  const EVENTS_URL = normalizeEventsUrl(rawEventsUrl);
  const accessParams =
    typeof window === "undefined"
      ? {
          isPreview: false,
          previewToken: "",
          cacheKey: "",
          sendCacheKey: false,
          invitationToken: "",
          accessToken: "",
        }
      : resolvePublicAccessParams(
          {
            ...publicAccess,
            previewToken: previewToken || publicAccess?.previewToken,
          },
          window.location.search,
        );
  const effectivePreviewToken = accessParams.previewToken;
  const isAdminPreview = effectivePreviewToken.length > 0;
  const previewCacheKey = accessParams.cacheKey;
  const sendCacheKey = Boolean(accessParams.sendCacheKey);
  const invitationToken = accessParams.invitationToken;
  const [identifier, setIdentifier] = useState("");
  const eventAccess = usePublicEventAccess({
    eventsUrl: EVENTS_URL,
    identifier,
    previewToken: effectivePreviewToken,
    previewCacheKey,
    sendCacheKey,
    invitationToken,
    accessToken: accessParams.accessToken,
    enabled: Boolean(identifier),
  });
  const accessToken = eventAccess.accessToken;
  const requestAccess = React.useMemo(
    () => ({
      previewToken: effectivePreviewToken,
      cacheKey: previewCacheKey,
      sendCacheKey,
      invitationToken,
      accessToken,
    }),
    [
      accessToken,
      effectivePreviewToken,
      invitationToken,
      previewCacheKey,
      sendCacheKey,
    ],
  );
  const [moments, setMoments] = useState<Moment[]>([]);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [published, setPublished] = useState<boolean | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTimezone, setEventTimezone] = useState("");
  const [error, setError] = useState<PublicLoadFailure | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxOrigin, setLightboxOrigin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [videoLightboxIndex, setVideoLightboxIndex] = useState<number | null>(
    null,
  );
  const [videoLightboxOrigin, setVideoLightboxOrigin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const lightboxSessionRef = useRef<{
    opener: HTMLElement;
    overflow: string;
    paddingRight: string;
  } | null>(null);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [pendingMoments, setPendingMoments] = useState<PendingMoment[]>([]);

  const sentinelRef = React.useRef<HTMLDivElement>(null);
  const totalRef = React.useRef<number>(0);
  const momentsRef = React.useRef<Moment[]>([]);
  const lastMediaRefreshKeyRef = useRef<string | null>(null);

  useEffect(() => {
    momentsRef.current = moments;
  }, [moments]);

  const MOMENTS_PER_GROUP = 9;

  const videoMoments = React.useMemo(
    () =>
      moments.filter((moment) =>
        isVideoMedia(resolveFullUrl(moment, EVENTS_URL), moment.content_type),
      ),
    [moments, EVENTS_URL],
  );
  const photoMoments = React.useMemo(
    () =>
      moments.filter(
        (moment) =>
          !isVideoMedia(
            resolveFullUrl(moment, EVENTS_URL),
            moment.content_type,
          ),
      ),
    [moments, EVENTS_URL],
  );
  const mediaRefreshDelay = React.useMemo(
    () => getPublicMomentsRefreshDelay(moments),
    [moments],
  );
  const mediaRefreshKey = React.useMemo(
    () => publicMomentsMediaRefreshKey(moments),
    [moments],
  );

  const pendingVideoCount = pendingMoments.filter(
    (pending) => pending.mediaType === "video",
  ).length;
  const pendingImageCount = pendingMoments.filter(
    (pending) => pending.mediaType === "image",
  ).length;

  const groupedItems = React.useMemo(() => {
    const groups: Array<{ moments: Moment[]; phrase: string | null }> = [];
    for (
      let index = 0;
      index < photoMoments.length;
      index += MOMENTS_PER_GROUP
    ) {
      const slice = photoMoments.slice(index, index + MOMENTS_PER_GROUP);
      const phraseIndex = Math.floor(index / MOMENTS_PER_GROUP);
      const hasMore = index + MOMENTS_PER_GROUP < photoMoments.length;
      const phrase =
        hasMore && phrases.length > 0
          ? (phrases[phraseIndex % phrases.length] ?? null)
          : null;
      groups.push({ moments: slice, phrase });
    }
    return groups;
  }, [photoMoments, phrases]);

  const beginLightboxSession = useCallback((opener: HTMLElement) => {
    if (lightboxSessionRef.current) return;

    const body = document.body;
    lightboxSessionRef.current = {
      opener,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };

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
  }, []);

  const finishLightboxSession = useCallback(() => {
    const session = lightboxSessionRef.current;
    if (!session) return;

    lightboxSessionRef.current = null;
    document.body.style.overflow = session.overflow;
    document.body.style.paddingRight = session.paddingRight;
    window.requestAnimationFrame(() => {
      if (session.opener.isConnected) {
        session.opener.focus({ preventScroll: true });
      }
    });
  }, []);

  useEffect(
    () => () => {
      finishLightboxSession();
    },
    [finishLightboxSession],
  );

  useEffect(() => {
    setIdentifier(getIdentifier());
  }, []);

  useEffect(() => {
    if (!identifier) return;
    return installPublicRum({ eventsUrl: EVENTS_URL, identifier, route: "moments", access: requestAccess });
  }, [EVENTS_URL, identifier, requestAccess]);

  const fetchMoments = useCallback(
    async (id: string, cursor: string | null, append: boolean) => {
      if (!append) setError(null);
      try {
        // cursor=null → first page: use a bounded initial payload for a fast, stable first paint.
        // cursor=string → subsequent scroll pages: use PAGE_SIZE (25)
        const cursorParam = cursor === null ? "" : cursor;
        const limit = cursor === null ? INITIAL_PAGE_SIZE : PAGE_SIZE;
        const data = normalizePublicMomentsPage(
          await fetchApiData<unknown>(
            buildEventMomentsUrl(EVENTS_URL, id, {
              cursor: cursorParam,
              limit,
              ...publicAccessQueryParams(requestAccess),
            }),
            publicAccessFetchInit(requestAccess),
            "No se pudieron cargar los momentos",
          ),
        );
        const newItems: Moment[] = data.items ?? [];
        const mergedMoments = append
          ? mergePublicMomentsById(momentsRef.current, newItems, {
              limit: MAX_TOTAL,
            })
          : mergePublicMomentsById([], newItems, { limit: MAX_TOTAL });

        momentsRef.current = mergedMoments;
        setMoments(mergedMoments);

        totalRef.current = data.total ?? 0;
        setPublished(data.moments_wall_published === true);
        if (data.event_name) setEventName(data.event_name);
        if (data.event_type) setEventType(data.event_type);
        if (data.event_date_time || data.event_date) {
          setEventDate(data.event_date_time ?? data.event_date ?? "");
        }
        if (data.timezone) setEventTimezone(data.timezone);

        // Update cursor state
        if (mergedMoments.length >= MAX_TOTAL || !data.next_cursor) {
          setReachedEnd(true);
          setNextCursor(null);
        } else {
          setReachedEnd(false);
          setNextCursor(data.next_cursor);
        }
        return true;
      } catch (err) {
        if (!append) {
          setError(
            resolvePublicLoadFailure({
              status: isApiFetchError(err) ? err.status : null,
              resource: "moments",
              backendMessage:
                err instanceof Error
                  ? err.message
                  : "No se pudieron cargar los momentos",
            }),
          );
        }
        return false;
      }
    },
    [
      EVENTS_URL,
      accessToken,
      effectivePreviewToken,
      invitationToken,
      isAdminPreview,
      previewCacheKey,
      requestAccess,
    ],
  );

  const retryMoments = useCallback(() => {
    if (!identifier) return;
    setLoading(true);
    void fetchMoments(identifier, null, false).finally(() => setLoading(false));
  }, [fetchMoments, identifier]);

  const refreshLatestMoments = useCallback(async () => {
    if (!identifier) return;

    try {
      const data = normalizePublicMomentsPage(
        await fetchApiData<unknown>(
          buildEventMomentsUrl(EVENTS_URL, identifier, {
            page: 1,
            limit: PAGE_SIZE,
            ...publicAccessQueryParams(requestAccess),
          }),
          publicAccessFetchInit(requestAccess),
        ),
      );
      const freshItems: Moment[] = data.items ?? [];
      const previousTotal = totalRef.current;
      const nextTotal = data.total;
      const shouldReplace = shouldReplacePublicMomentsOnLiveRefresh(
        previousTotal,
        nextTotal,
        momentsRef.current,
        freshItems,
      );

      setMoments((existing) =>
        shouldReplace
          ? mergePublicMomentsById([], freshItems, { limit: MAX_TOTAL })
          : mergePublicMomentsById(existing, freshItems, {
              prependIncoming: true,
              limit: MAX_TOTAL,
            }),
      );
      totalRef.current =
        nextTotal ?? Math.max(previousTotal, freshItems.length);
      setPublished(data.moments_wall_published === true);
      if (data.event_name) setEventName(data.event_name);
      if (data.event_type) setEventType(data.event_type);
      if (data.event_date_time || data.event_date) {
        setEventDate(data.event_date_time ?? data.event_date ?? "");
      }
      if (data.timezone) setEventTimezone(data.timezone);
      if (shouldReplace) {
        if (data.next_cursor) {
          setReachedEnd(false);
          setNextCursor(data.next_cursor);
        } else if ((data.total ?? freshItems.length) <= freshItems.length) {
          setReachedEnd(true);
          setNextCursor(null);
        }
      }
    } catch {
      /* Live refresh is best-effort; the normal loader owns visible errors. */
    }
  }, [
    EVENTS_URL,
    accessToken,
    effectivePreviewToken,
    identifier,
    invitationToken,
    previewCacheKey,
    requestAccess,
  ]);

  useEffect(() => {
    const pageSpec = eventAccess.pageSpec;
    if (!pageSpec) return;
    const meta = pageSpec.meta ?? {};
    if (meta.pageTitle && !eventName) setEventName(meta.pageTitle);
    if (meta.eventType) setEventType(meta.eventType);
    const metaDate = meta.eventDateTime ?? meta.eventDate;
    if (metaDate) setEventDate(metaDate);
    if (meta.timezone) setEventTimezone(meta.timezone);
  }, [eventAccess.pageSpec, eventName]);

  useEffect(() => {
    if (!identifier) return;
    if (!eventAccess.ready) return;
    if (eventAccess.passwordRequired) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMoments(identifier, null, false).finally(() => setLoading(false));
  }, [
    identifier,
    eventAccess.ready,
    eventAccess.passwordRequired,
    fetchMoments,
  ]);

  useEffect(() => {
    if (!identifier || mediaRefreshDelay === null || !mediaRefreshKey) return;

    const refreshMedia = () => {
      lastMediaRefreshKeyRef.current = mediaRefreshKey;
      void refreshLatestMoments();
    };

    if (mediaRefreshDelay <= 0) {
      if (lastMediaRefreshKeyRef.current === mediaRefreshKey) return;
      refreshMedia();
      return;
    }

    const timer = window.setTimeout(refreshMedia, mediaRefreshDelay);
    return () => window.clearTimeout(timer);
  }, [identifier, mediaRefreshDelay, mediaRefreshKey, refreshLatestMoments]);

  useEffect(() => {
    if (
      !identifier ||
      published !== true ||
      !eventAccess.ready ||
      eventAccess.passwordRequired ||
      pendingMoments.length > 0
    )
      return;

    const refreshLiveMoments = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLatestMoments();
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
    eventAccess.passwordRequired,
    eventAccess.ready,
    identifier,
    pendingMoments.length,
    published,
    refreshLatestMoments,
  ]);

  // Fetch event phrases when eventType is known
  useEffect(() => {
    if (!eventType || !EVENTS_URL) return;
    const type = normalizeEventPhraseType(eventType);
    fetchApiData<EventPhrasesResponse | null>(
      buildEventPhrasesUrl(EVENTS_URL, type, 15),
    )
      .then((data) => {
        if (data?.phrases?.length) {
          setPhrases(data.phrases);
        }
      })
      .catch(() => {
        // Silently fail — gallery works fine without phrases
      });
  }, [eventType, EVENTS_URL]);

  // Load pending-moment stubs from sessionStorage when identifier is resolved
  useEffect(() => {
    if (!identifier) return;
    const stubs = readPending(identifier);
    setPendingMoments(stubs);
    // Persist cleaned list (expired stubs removed by readPending)
    writePending(identifier, stubs);
  }, [identifier]);

  // Poll the wall API every 12 s while there are processing stubs.
  // When the total number of *approved+done* moments grows, we assume at
  // least one pending stub has finished and remove the oldest one.
  // This is intentionally conservative: we don't have the moment's real ID
  // from sessionStorage, so we compare snapshot counts.
  const prevMomentCountRef = React.useRef<number>(0);
  useEffect(() => {
    if (!identifier || pendingMoments.length === 0) return;

    // Capture API total (not local items.length) so pagination doesn't skew detection
    prevMomentCountRef.current = totalRef.current;

    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const data = normalizePublicMomentsPage(
          await fetchApiData<unknown>(
            buildEventMomentsUrl(EVENTS_URL, identifier, {
              page: 1,
              limit: PAGE_SIZE,
              ...publicAccessQueryParams(requestAccess),
            }),
            publicAccessFetchInit(requestAccess),
          ),
        );
        const freshItems: Moment[] = data.items ?? [];
        // Compare total count from API (not items.length) so pagination doesn't skew detection
        const freshTotal = data.total ?? freshItems.length;
        const prev = prevMomentCountRef.current;

        if (freshTotal > prev) {
          // Merge page-1 results into existing list without losing already-loaded pages
          setMoments((existing) =>
            mergePublicMomentsById(existing, freshItems, {
              prependIncoming: true,
              limit: MAX_TOTAL,
            }),
          );
          const gained = freshTotal - prev;
          prevMomentCountRef.current = freshTotal;
          totalRef.current = freshTotal;

          setPendingMoments((stubs) => {
            const next = stubs.slice(Math.max(0, gained));
            writePending(identifier, next);
            return next;
          });
        }
      } catch {
        /* silent — polling failure is non-critical */
      }
    }, PROCESSING_POLL_MS);

    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    identifier,
    pendingMoments.length,
    EVENTS_URL,
    accessToken,
    isAdminPreview,
    previewCacheKey,
    effectivePreviewToken,
    invitationToken,
    requestAccess,
  ]);

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd || !identifier || nextCursor === null) return;
    if (momentsRef.current.length >= MAX_TOTAL) {
      setReachedEnd(true);
      setNextCursor(null);
      return;
    }
    setLoadMoreError(false);
    setLoadingMore(true);
    const loaded = await fetchMoments(identifier, nextCursor, true);
    setLoadingMore(false);
    if (!loaded) setLoadMoreError(true);
  }, [loadingMore, reachedEnd, identifier, nextCursor, fetchMoments]);

  // Auto-load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          !reachedEnd &&
          !loadingMore &&
          !loadMoreError
        ) {
          loadMore();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reachedEnd, loadingMore, loadMoreError, loadMore]);

  const theme = getTheme(eventType);

  if (!identifier && typeof window !== "undefined") {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen flex items-center justify-center bg-white">
          <p className="text-gray-400 text-sm">Enlace invalido.</p>
        </div>
      </MotionConfig>
    );
  }

  if (eventAccess.passwordRequired && identifier) {
    return (
      <MotionConfig reducedMotion="user">
        <PublicEventPasswordGate
          title="Galeria privada"
          description="Ingresa la contrasena del evento para ver los momentos."
          onVerify={eventAccess.verifyPassword}
        />
      </MotionConfig>
    );
  }

  if (loading) {
    return (
      <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-white">
          {/* Hero skeleton */}
          <div className="relative overflow-hidden bg-gray-50 py-20 sm:py-28 text-center">
            <div className="mx-auto space-y-4 flex flex-col items-center">
              <div className="h-3 w-24 bg-gray-200 rounded-full animate-pulse" />
              <div
                className="h-10 w-64 sm:w-80 bg-gray-200 rounded-full animate-pulse"
                style={{ animationDelay: "0.1s" }}
              />
              <div
                className="h-3 w-32 bg-gray-100 rounded-full animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
              className="mt-10 mx-auto w-7 h-7 border-2 border-gray-200 border-t-gray-400 rounded-full"
            />
          </div>
          {/* Grid skeleton */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="break-inside-avoid mb-3 sm:mb-4 rounded-2xl bg-gray-100 animate-pulse"
                  style={{
                    height: `${[180, 240, 160, 200, 280, 150, 220, 190, 260, 170, 230, 200][i]}px`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </MotionConfig>
    );
  }

  if (error) {
    return (
      <MotionConfig reducedMotion="user">
        <PublicEventLoadError
          kind="moments"
          title={error.title}
          message={error.message}
          supportText={error.supportText}
          onRetry={error.retryable ? retryMoments : undefined}
        />
      </MotionConfig>
    );
  }

  if (published === false && !isAdminPreview) {
    return (
      <MotionConfig reducedMotion="user">
        <ComingSoonScreen eventName={eventName} theme={theme} />
      </MotionConfig>
    );
  }

  if (moments.length === 0 && pendingMoments.length === 0) {
    return (
      <MotionConfig reducedMotion="user">
        <div
          className={`min-h-screen flex items-center justify-center px-6 ${theme.heroLightBg}`}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4"
          >
            <div className={`text-5xl ${theme.headingFont} ${theme.accent}`}>
              {eventName || "Momentos"}
            </div>
            <p className="text-gray-500 text-sm">
              Aun no hay momentos publicados. Vuelve pronto!
            </p>
          </motion.div>
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <>
        {isAdminPreview && (
          <AdminPreviewBanner
            onClose={() => {
              /* dismisses UI only */
            }}
          />
        )}
        <div
          className={`min-h-screen bg-white ${isAdminPreview ? "pt-14" : ""}`}
        >
          <HeroHeader
            eventName={eventName}
            eventDate={eventDate}
            eventTimezone={eventTimezone}
            theme={theme}
            photoCount={photoMoments.length}
            videoCount={videoMoments.length}
          />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 overflow-hidden">
            <VideoHighlights
              videoMoments={videoMoments}
              processingVideoCount={pendingVideoCount}
              EVENTS_URL={EVENTS_URL}
              theme={theme}
              onVideoClick={(index, e) => {
                beginLightboxSession(e.currentTarget);
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                setVideoLightboxOrigin({
                  x: cx < window.innerWidth / 2 ? 0 : 100,
                  y: cy < window.innerHeight / 2 ? 0 : 100,
                });
                setVideoLightboxIndex(index);
              }}
            />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col gap-0.5">
              {/* Processing image stubs — shown at the top of the photo grid */}
              {pendingImageCount > 0 && (
                <div className="grid grid-cols-3 gap-0.5 mb-0.5">
                  {Array.from({ length: pendingImageCount }).map((_, i) => (
                    <ProcessingCard key={`proc-img-${i}`} />
                  ))}
                </div>
              )}
              {groupedItems.map((group, groupIdx) => {
                const indexOffset = groupIdx * MOMENTS_PER_GROUP;
                return (
                  <React.Fragment key={group.moments[0]?.id ?? groupIdx}>
                    {/* Photo grid group — Instagram CSS grid */}
                    <div
                      className="grid grid-cols-3 gap-0.5"
                      style={{
                        gridAutoFlow: "row dense",
                        contentVisibility: "auto",
                        containIntrinsicSize: "auto 540px",
                      }}
                    >
                      {group.moments.map((moment, i) => {
                        const globalIndex = indexOffset + i;
                        return (
                          <PhotoCard
                            key={moment.id}
                            moment={moment}
                            globalIndex={globalIndex}
                            EVENTS_URL={EVENTS_URL}
                            onClick={(e) => {
                              beginLightboxSession(e.currentTarget);
                              const rect = (
                                e.currentTarget as HTMLButtonElement
                              ).getBoundingClientRect();
                              const cx = rect.left + rect.width / 2;
                              const cy = rect.top + rect.height / 2;
                              setLightboxOrigin({
                                x: cx < window.innerWidth / 2 ? 0 : 100,
                                y: cy < window.innerHeight / 2 ? 0 : 100,
                              });
                              setLightboxIndex(globalIndex);
                            }}
                          />
                        );
                      })}
                    </div>
                    {/* Memory card after this group */}
                    {group.phrase && (
                      <div className="px-3 sm:px-4 py-2">
                        <MemoryCard phrase={group.phrase} theme={theme} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Infinite scroll sentinel — watched by IntersectionObserver */}
            <div
              ref={sentinelRef}
              className="h-16 flex items-center justify-center mt-4"
            >
              {loadMoreError && (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className="min-h-11 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/35"
                >
                  Reintentar carga
                </button>
              )}
              {loadingMore && (
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                      className="w-2 h-2 rounded-full bg-gray-400"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* End card — shown when all moments loaded or page cap reached */}
            {reachedEnd && moments.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="py-12 text-center"
              >
                <span
                  className={`mx-auto mb-3 flex size-10 items-center justify-center rounded-2xl ${theme.accentSoft} ${theme.accent}`}
                  aria-hidden="true"
                >
                  <Images className="size-4" strokeWidth={1.8} />
                </span>
                <p className="text-sm font-medium tracking-wide text-gray-500">
                  Estos son todos los momentos compartidos
                </p>
              </motion.div>
            )}
          </div>

          <ThemeFooter theme={theme} eventName={eventName} />

          <Suspense
            fallback={
              lightboxIndex !== null || videoLightboxIndex !== null ? (
                <LightboxLoadingFallback
                  kind={lightboxIndex !== null ? "photo" : "video"}
                  onClose={() => {
                    setLightboxIndex(null);
                    setLightboxOrigin(null);
                    setVideoLightboxIndex(null);
                    setVideoLightboxOrigin(null);
                    window.requestAnimationFrame(finishLightboxSession);
                  }}
                />
              ) : null
            }
          >
            <AnimatePresence mode="wait" onExitComplete={finishLightboxSession}>
              {lightboxIndex !== null ? (
                <AsyncMomentsGalleryLightbox
                  key="photo-lightbox"
                  kind="photo"
                  moments={photoMoments}
                  index={lightboxIndex}
                  eventsUrl={EVENTS_URL}
                  theme={theme}
                  origin={lightboxOrigin}
                  onClose={() => {
                    setLightboxIndex(null);
                    setLightboxOrigin(null);
                  }}
                  onNext={() =>
                    setLightboxIndex((current) =>
                      current !== null
                        ? Math.min(current + 1, photoMoments.length - 1)
                        : null,
                    )
                  }
                  onPrev={() =>
                    setLightboxIndex((current) =>
                      current !== null ? Math.max(current - 1, 0) : null,
                    )
                  }
                />
              ) : videoLightboxIndex !== null ? (
                <AsyncMomentsGalleryLightbox
                  key="video-lightbox"
                  kind="video"
                  moments={videoMoments}
                  index={videoLightboxIndex}
                  eventsUrl={EVENTS_URL}
                  theme={theme}
                  origin={videoLightboxOrigin}
                  onClose={() => {
                    setVideoLightboxIndex(null);
                    setVideoLightboxOrigin(null);
                  }}
                  onNext={() =>
                    setVideoLightboxIndex((current) =>
                      current !== null
                        ? Math.min(current + 1, videoMoments.length - 1)
                        : null,
                    )
                  }
                  onPrev={() =>
                    setVideoLightboxIndex((current) =>
                      current !== null ? Math.max(current - 1, 0) : null,
                    )
                  }
                />
              ) : null}
            </AnimatePresence>
          </Suspense>
        </div>
      </>
    </MotionConfig>
  );
}

// ── HeroHeader ──────────────────────────────────────────────────────────────

function LightboxLoadingFallback({
  kind,
  onClose,
}: {
  kind: "photo" | "video";
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const kindLabel = kind === "photo" ? "foto" : "video";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Abriendo visor de ${kindLabel}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 px-6 text-white backdrop-blur-sm"
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label={`Cerrar visor de ${kindLabel}`}
      >
        <X className="size-6" aria-hidden="true" />
      </button>
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 text-sm"
      >
        <LoaderCircle
          className="size-5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Abriendo momento…
      </p>
    </div>
  );
}

function HeroHeader({
  eventName,
  eventDate,
  eventTimezone,
  theme,
  photoCount,
  videoCount,
}: {
  eventName: string;
  eventDate: string;
  eventTimezone: string;
  theme: ReturnType<typeof getTheme>;
  photoCount: number;
  videoCount: number;
}) {
  const formattedDate = formatPublicEventDate(eventDate, eventTimezone);
  const ThemeMicroIcon = THEME_MICRO_ICONS[theme.microIcon];

  return (
    <div
      className={`relative text-center py-10 sm:py-14 px-6 overflow-hidden ${theme.heroLightBg}`}
    >
      {/* Aurora blob 1 — top-left */}
      <div
        className="animate-blob-1 absolute -top-16 -left-16 w-72 h-72 rounded-full opacity-40 pointer-events-none"
        style={{ background: theme.blobColor1, filter: "blur(80px)" }}
        aria-hidden="true"
      />
      {/* Aurora blob 2 — bottom-right */}
      <div
        className="animate-blob-2 absolute -bottom-16 -right-16 w-80 h-80 rounded-full opacity-35 pointer-events-none"
        style={{ background: theme.blobColor2, filter: "blur(80px)" }}
        aria-hidden="true"
      />
      {/* Subtle theme decoration — left */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 0.35, x: 0 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl pointer-events-none select-none"
        aria-hidden="true"
      >
        <ThemeMicroIcon className="size-9" strokeWidth={1.5} />
      </motion.div>
      {/* Subtle theme decoration — right */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 0.35, x: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl pointer-events-none select-none"
        aria-hidden="true"
      >
        <ThemeMicroIcon className="size-9" strokeWidth={1.5} />
      </motion.div>

      {/* Event name */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 ${theme.headingFont}`}
      >
        {eventName || "Momentos"}
      </motion.h1>

      {/* Event date */}
      {formattedDate && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="mt-2 text-sm text-gray-400 tracking-wide"
        >
          {formattedDate}
        </motion.p>
      )}

      {/* Decorative expanding line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 mx-auto h-px w-16"
        style={{
          transformOrigin: "center",
          background: `linear-gradient(to right, transparent, ${theme.blobColor1}80, transparent)`,
        }}
      />

      {/* Stats pill — photo/video count */}
      {(photoCount > 0 || videoCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-4 flex justify-center"
        >
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${theme.accentSoft} ${theme.accent}`}
          >
            {photoCount > 0 && (
              <span>
                {photoCount} {photoCount === 1 ? "foto" : "fotos"}
              </span>
            )}
            {photoCount > 0 && videoCount > 0 && (
              <span
                className="w-1 h-1 rounded-full opacity-40 bg-current inline-block"
                aria-hidden="true"
              />
            )}
            {videoCount > 0 && (
              <span>
                {videoCount} {videoCount === 1 ? "video" : "videos"}
              </span>
            )}
          </div>
        </motion.div>
      )}
      {/* Fade hero gradient into white grid */}
      <div
        className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-white pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

// ── PhotoCard ────────────────────────────────────────────────────────────────
// Instagram-grid card. Normal: aspect-square 1×1. Featured (every 10th): 2×2.
// Uses native loading="lazy" — no custom lazy hook needed (grid reserves space).

function PhotoCard({
  moment,
  globalIndex,
  EVENTS_URL,
  onClick,
}: {
  moment: Moment;
  globalIndex: number;
  EVENTS_URL: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL);
  const fullUrl = resolveFullUrl(moment, EVENTS_URL);
  const isVideoMoment = isVideoMedia(fullUrl, moment.content_type);
  const featured = getCardType(globalIndex) === "featured";
  const eager = globalIndex < 6;
  const srcSet = publicMomentMediaSrcSet(moment, (url) =>
    resolvePublicMediaUrl(url, EVENTS_URL),
  );

  return (
    <button
      type="button"
      className={`relative overflow-hidden bg-gray-100 cursor-pointer group aspect-square focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
        featured ? "col-span-2 row-span-2" : ""
      }`}
      onClick={onClick}
      onPointerEnter={preloadMomentsGalleryLightbox}
      onFocus={preloadMomentsGalleryLightbox}
      aria-label={
        moment.description
          ? `Abrir foto: ${moment.description}`
          : "Abrir foto del evento"
      }
    >
      {/* Shimmer — visible until image loads */}
      {!loaded && (
        <div
          className="absolute inset-0 bg-gray-100 animate-pulse"
          aria-hidden="true"
        />
      )}

      <img
        src={thumbUrl}
        srcSet={srcSet}
        sizes={featured ? "(max-width: 767px) 66vw, 560px" : "(max-width: 767px) 33vw, 280px"}
        alt={moment.description || "Momento del evento"}
        loading={eager ? "eager" : "lazy"}
        {...(eager ? { fetchPriority: "high" as const } : {})}
        decoding="async"
        draggable={false}
        className={`w-full h-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-105 ${
          loaded ? "opacity-100" : "opacity-0"
        } ${featured ? "absolute inset-0" : ""}`}
        onLoad={() => {
          setLoaded(true);
          if (globalIndex === 0) recordPublicRumMetric("photo_visible_ms", performance.now());
        }}
      />

      {/* Desktop hover overlay */}
      <div
        className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        aria-hidden="true"
      />

      {/* Video play badge */}
      {isVideoMoment && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <Play
              className="ml-0.5 size-5 text-white"
              fill="currentColor"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Description — slides up on hover */}
      {moment.description && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200 pointer-events-none">
          <p className="text-white text-xs line-clamp-2">
            {moment.description}
          </p>
        </div>
      )}
    </button>
  );
}

// ── ProcessingCard ────────────────────────────────────────────────────────────
// Grid-compatible: uses aspect-square so it integrates seamlessly with PhotoCard cells.

function ProcessingCard() {
  return (
    <div className="aspect-square relative overflow-hidden bg-gray-100">
      <div
        className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 bg-[length:200%_100%] animate-shimmer"
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full"
          style={{ willChange: "transform" }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-medium text-gray-400 tracking-wide select-none">
          Optimizando…
        </span>
      </div>
    </div>
  );
}

// ── ProcessingVideoCard ───────────────────────────────────────────────────────
// Masonry-compatible placeholder shown while Lambda optimizes an uploaded video.

function ProcessingVideoCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.07,
        type: "spring",
        stiffness: 280,
        damping: 24,
      }}
      className="break-inside-avoid mb-3 relative w-full rounded-xl overflow-hidden bg-zinc-900"
      style={{ aspectRatio: "9/16" }}
    >
      {/* Dark gradient placeholder */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900" />
      {/* Shimmer sweep */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent bg-[length:200%_100%] animate-shimmer"
        aria-hidden="true"
      />
      {/* Centered spinner + label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full"
          style={{ willChange: "transform" }}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-zinc-400 tracking-wide select-none">
          Optimizando video…
        </span>
      </div>
    </motion.div>
  );
}

// ── VideoCard ─────────────────────────────────────────────────────────────────
// Pinterest-style inline video card.
// • Autoplays muted when ≥30% visible in viewport (IntersectionObserver).
// • Pauses automatically when scrolled out of view.
// • Click toggles mute so the user can hear audio without leaving the grid.

function VideoCard({
  moment,
  EVENTS_URL,
  onExpand,
}: {
  moment: Moment;
  EVENTS_URL: string;
  onExpand: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const url = resolveFullUrl(moment, EVENTS_URL);

  return (
    <button
      type="button"
      className="break-inside-avoid mb-3 relative w-full overflow-hidden rounded-xl border-0 bg-zinc-900 p-0 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
      onClick={onExpand}
      onPointerEnter={preloadMomentsGalleryLightbox}
      onFocus={preloadMomentsGalleryLightbox}
      aria-label={
        moment.description
          ? `Abrir video: ${moment.description}`
          : "Abrir video del evento"
      }
    >
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        tabIndex={-1}
        aria-hidden="true"
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-auto block"
        style={{ minHeight: "140px" }}
      />

      {/* Hover overlay + expand hint */}
      <div
        className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 pointer-events-none"
        aria-hidden="true"
      />

      {/* Expand icon — centered, visible on hover */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center opacity-90 group-hover:opacity-100 transition-opacity duration-200 scale-95 group-hover:scale-100 transition-transform">
          <Play
            className="size-5 translate-x-px text-white"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Description overlay */}
      {moment.description && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3">
          <p className="text-white text-xs line-clamp-2">
            {moment.description}
          </p>
        </div>
      )}
    </button>
  );
}

// ── VideoHighlights ──────────────────────────────────────────────────────────
// Pinterest-style masonry grid of inline-playing videos.

function VideoHighlights({
  videoMoments,
  processingVideoCount,
  EVENTS_URL,
  theme,
  onVideoClick,
}: {
  videoMoments: Moment[];
  processingVideoCount: number;
  EVENTS_URL: string;
  theme: ReturnType<typeof getTheme>;
  onVideoClick: (index: number, e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  if (videoMoments.length === 0 && processingVideoCount === 0) return null;

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className={`w-5 h-0.5 rounded-full ${theme.accentSoft}`} />
        <p
          className={`text-xs font-semibold uppercase tracking-[0.2em] ${theme.accent}`}
        >
          Momentos en video
        </p>
        <div className={`flex-1 h-px ${theme.accentSoft} opacity-30`} />
      </div>

      {/* Pinterest masonry — columns let each video keep its natural aspect ratio */}
      <div className="columns-2 sm:columns-3 gap-3">
        {videoMoments.map((moment, i) => (
          <VideoCard
            key={moment.id}
            moment={moment}
            EVENTS_URL={EVENTS_URL}
            onExpand={(e) => onVideoClick(i, e)}
          />
        ))}
        {Array.from({ length: processingVideoCount }).map((_, i) => (
          <ProcessingVideoCard key={`proc-video-${i}`} index={i} />
        ))}
      </div>
    </div>
  );
}

// ── MemoryCard ───────────────────────────────────────────────────────────────

function MemoryCard({
  phrase,
  theme,
}: {
  phrase: string;
  theme: MomentsTheme;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "0px 0px -50px 0px" }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className="w-full"
    >
      <div
        className={`bg-gradient-to-br ${theme.cardGradient} border ${theme.cardBorder} rounded-[20px] px-6 py-7`}
      >
        <div
          className={`mx-auto mb-4 flex size-9 items-center justify-center rounded-2xl ${theme.accentSoft} ${theme.accent}`}
          aria-hidden="true"
        >
          <Quote className="size-4" strokeWidth={1.8} />
        </div>

        <p
          className={`mx-auto max-w-2xl text-pretty text-center font-serif text-lg font-semibold leading-relaxed sm:text-xl ${theme.cardTextColor}`}
        >
          {phrase}
        </p>
      </div>
    </motion.div>
  );
}

// ── ThemeFooter ─────────────────────────────────────────────────────────────

function ThemeFooter({
  theme,
  eventName,
}: {
  theme: MomentsTheme;
  eventName: string;
}) {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`py-16 text-center ${theme.heroBg} relative overflow-hidden`}
    >
      <Decorations type={theme.decorationType} />
      <div className="relative z-10 space-y-4">
        <p
          className={`text-xl sm:text-2xl ${theme.headingFont} ${theme.accent}`}
        >
          {theme.footerMessage}
        </p>
        {eventName && <p className="text-sm text-gray-400">{eventName}</p>}
      </div>
    </motion.footer>
  );
}

// ── ComingSoonScreen ────────────────────────────────────────────────────────

function ComingSoonScreen({
  eventName,
  theme,
}: {
  eventName: string;
  theme: MomentsTheme;
}) {
  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center px-6 ${theme.heroLightBg} relative overflow-hidden`}
    >
      <Decorations type={theme.decorationType} />

      {/* Floating ambient circles */}
      <motion.div
        className="absolute w-72 h-72 rounded-full opacity-[0.06] bg-current pointer-events-none"
        style={{ top: "15%", left: "5%" }}
        animate={{ scale: [1, 1.15, 1], x: [0, 12, 0] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-48 h-48 rounded-full opacity-[0.05] bg-current pointer-events-none"
        style={{ bottom: "10%", right: "8%" }}
        animate={{ scale: [1, 1.2, 1], x: [0, -10, 0] }}
        transition={{
          repeat: Infinity,
          duration: 6,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      <div className="relative z-10 text-center max-w-sm mx-auto space-y-8">
        {/* Animated icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="flex justify-center"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
            className="relative"
          >
            <span className="flex size-20 items-center justify-center rounded-[1.75rem] border border-white/70 bg-white/75 text-amber-600 shadow-[0_18px_48px_rgba(120,53,15,0.12)] backdrop-blur-xl sm:size-24">
              <Sparkles
                className="size-9 sm:size-11"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
            <motion.span
              className="absolute -top-2 -right-3 text-2xl"
              animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.2, 0.9, 1] }}
              transition={{
                repeat: Infinity,
                duration: 4,
                ease: "easeInOut",
                delay: 0.5,
              }}
            >
              <Camera
                className="size-7 text-amber-700"
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </motion.span>
          </motion.div>
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.2,
            type: "spring",
            stiffness: 200,
            damping: 20,
          }}
          className="space-y-3"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
            Próximamente
          </p>
          <h1
            className={`text-3xl sm:text-4xl ${theme.headingFont} ${theme.accent} leading-tight`}
          >
            {eventName
              ? `Los momentos de\n${eventName}`
              : "El muro de momentos"}
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-400 text-sm leading-relaxed max-w-[260px] mx-auto"
        >
          Estamos preparando algo especial. Vuelve pronto para revivir cada
          instante.
        </motion.p>

        {/* Animated dots loader */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-center gap-2 pt-2"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`w-2 h-2 rounded-full ${theme.accentSoft} opacity-60`}
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                delay: i * 0.25,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>

        {/* Subtle divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="mx-auto w-12 h-px bg-gray-300/50"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="text-[11px] text-gray-300 tracking-wide"
        >
          Eventiapp · Galería de momentos
        </motion.p>
      </div>
    </div>
  );
}

// ── Decorations ─────────────────────────────────────────────────────────────

function Decorations({ type }: { type: MomentsTheme["decorationType"] }) {
  if (type === "botanical") {
    return (
      <>
        <svg
          className="absolute top-0 left-0 w-32 h-32 text-amber-200/30 -translate-x-1/3 -translate-y-1/4"
          viewBox="0 0 100 100"
          fill="currentColor"
        >
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
        <svg
          className="absolute bottom-0 right-0 w-40 h-40 text-amber-200/20 translate-x-1/4 translate-y-1/4 rotate-45"
          viewBox="0 0 100 100"
          fill="currentColor"
        >
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
      </>
    );
  }
  if (type === "confetti") {
    return (
      <>
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${10 + i * 12}%`,
              top: `${5 + (i % 3) * 30}%`,
              backgroundColor: [
                "#818cf8",
                "#34d399",
                "#fbbf24",
                "#f472b6",
                "#60a5fa",
                "#a78bfa",
                "#fb923c",
                "#22d3ee",
              ][i],
            }}
            animate={{ y: [0, -8, 0], opacity: [0.3, 0.6, 0.3] }}
            transition={{
              repeat: Infinity,
              duration: 2 + i * 0.5,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        ))}
      </>
    );
  }
  if (type === "sparkles") {
    return (
      <>
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-rose-300/40"
            style={{ left: `${15 + i * 15}%`, top: `${10 + (i % 2) * 60}%` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
            transition={{
              repeat: Infinity,
              duration: 2,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          >
            ✦
          </motion.div>
        ))}
      </>
    );
  }
  if (type === "geometric") {
    return (
      <>
        <div className="absolute top-10 right-10 w-20 h-20 border border-gray-200/30 rotate-45" />
        <div className="absolute bottom-10 left-10 w-16 h-16 border border-gray-200/20 rotate-12" />
      </>
    );
  }
  return null;
}

// ── AdminPreviewBanner ────────────────────────────────────────────────────────

function AdminPreviewBanner({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(true);

  const handleClose = () => {
    setVisible(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 sm:px-6 h-14 bg-gray-950/95 backdrop-blur-md border-b border-white/10 shadow-2xl shadow-black/40"
        >
          {/* Left: label */}
          <div className="flex items-center gap-3 min-w-0">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{
                repeat: Infinity,
                duration: 2.5,
                ease: "easeInOut",
              }}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center"
            >
              <svg
                className="w-3.5 h-3.5 text-violet-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </motion.div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  Vista previa de administrador
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                  Solo tú ves esto
                </span>
              </div>
              <p className="hidden sm:block text-xs text-gray-400 truncate">
                El muro aún no es público — los invitados ven la pantalla de
                &quot;Próximamente&quot;
              </p>
            </div>
          </div>

          {/* Right: close */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar aviso de vista previa"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
