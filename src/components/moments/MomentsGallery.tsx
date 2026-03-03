"use client"

import React, { useState, useEffect, useCallback, useRef, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { getTheme, type MomentsTheme } from "./themes"

// ── Types ──────────────────────────────────────────────────────────────────

interface Moment {
  id: string
  content_url: string
  thumbnail_url?: string
  description?: string
  created_at: string
  processing_status?: string
}

interface MomentsResponse {
  items: Moment[]
  total: number
  page: number
  limit: number
  has_more: boolean
  next_cursor?: string
  published: boolean | number | undefined
  uploads_remaining: number
  uploads_used: number
  moments_wall_published?: boolean
  event_name?: string
  event_type?: string
  event_date?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return ""
  const match = window.location.pathname.match(/\/e\/([^/]+)\/momentos/)
  return match?.[1] ?? ""
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|m4v)(\?|$)/i.test(url)
}

function resolveMediaUrl(m: Moment, EVENTS_URL: string): string {
  const url = m.thumbnail_url || m.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${EVENTS_URL}${url.startsWith("/") ? url.slice(1) : url}`
}

function resolveFullUrl(m: Moment, EVENTS_URL: string): string {
  const url = m.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${EVENTS_URL}${url.startsWith("/") ? url.slice(1) : url}`
}

const PAGE_SIZE = 25          // Scroll load size
const INITIAL_PAGE_SIZE = 125 // First load: larger to capture all videos for VideoHighlights
const MAX_TOTAL = 500
const PROCESSING_POLL_MS = 12_000

// ── Pending-moments helpers (sessionStorage) ─────────────────────────────────
// After a guest uploads a file, the moment enters processing and is hidden from
// the wall API.  We persist a lightweight stub in sessionStorage so the gallery
// can show a "Optimizando…" card until Lambda finishes.

interface PendingMoment {
  /** Synthetic local ID (UUID v4 generated on upload) */
  localId: string
  /** "video" or "image" — used to pick where to render the card */
  mediaType: "video" | "image"
  /** ISO timestamp of upload — so we can expire stale stubs */
  uploadedAt: string
}

function pendingKey(identifier: string) {
  return `pending_moments:${identifier}`
}

function readPending(identifier: string): PendingMoment[] {
  try {
    const raw = sessionStorage.getItem(pendingKey(identifier))
    if (!raw) return []
    const parsed: PendingMoment[] = JSON.parse(raw)
    // Drop stubs older than 15 minutes — Lambda won't take that long
    const cutoff = Date.now() - 15 * 60 * 1000
    return parsed.filter(p => new Date(p.uploadedAt).getTime() > cutoff)
  } catch {
    return []
  }
}

function writePending(identifier: string, items: PendingMoment[]) {
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(pendingKey(identifier))
    } else {
      sessionStorage.setItem(pendingKey(identifier), JSON.stringify(items))
    }
  } catch { /* sessionStorage may be blocked in private mode */ }
}

/** Add one pending stub to sessionStorage for a given event. */
export function addPendingMoment(identifier: string, mediaType: "video" | "image") {
  const existing = readPending(identifier)
  const entry: PendingMoment = {
    localId: crypto.randomUUID(),
    mediaType,
    uploadedAt: new Date().toISOString(),
  }
  writePending(identifier, [...existing, entry])
}


// ── getCardType ──────────────────────────────────────────────────────────────
// Every 10th photo (1-indexed) is a 2×2 featured card in the Instagram grid.
// Exported for unit testing.
export function getCardType(index: number): 'normal' | 'featured' {
  return (index + 1) % 10 === 0 ? 'featured' : 'normal'
}

// ── MomentsGallery ─────────────────────────────────────────────────────────

interface Props {
  EVENTS_URL: string
  previewToken?: string
}

export default function MomentsGallery({ EVENTS_URL: rawEventsUrl, previewToken = '' }: Props) {
  // Normalize: ensure trailing slash so `${EVENTS_URL}api/...` always produces a valid URL.
  const EVENTS_URL = rawEventsUrl.endsWith('/') ? rawEventsUrl : rawEventsUrl + '/'
  const isAdminPreview = previewToken.length > 0
  const [identifier, setIdentifier] = useState("")
  const [moments, setMoments] = useState<Moment[]>([])
  const [reachedEnd, setReachedEnd] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [published, setPublished] = useState<boolean | null>(null)
  const [eventName, setEventName] = useState("")
  const [eventType, setEventType] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [error, setError] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [lightboxOrigin, setLightboxOrigin] = useState<{ x: number; y: number } | null>(null)
  const [videoLightboxIndex, setVideoLightboxIndex] = useState<number | null>(null)
  const [videoLightboxOrigin, setVideoLightboxOrigin] = useState<{ x: number; y: number } | null>(null)
  const [phrases, setPhrases] = useState<string[]>([])
  // Processing-state cards: moments that were just uploaded and are still being
  // optimized by Lambda (not yet returned by the wall API).
  const [pendingMoments, setPendingMoments] = useState<PendingMoment[]>([])

  const sentinelRef = React.useRef<HTMLDivElement>(null)
  // Tracks the API's total moment count so polling can detect new arrivals
  // independently of how many pages have been locally loaded.
  const totalRef = React.useRef<number>(0)

  const MOMENTS_PER_GROUP = 9

  const videoMoments = React.useMemo(
    () => moments.filter(m => isVideo(resolveFullUrl(m, EVENTS_URL))),
    [moments, EVENTS_URL]
  )
  const photoMoments = React.useMemo(
    () => moments.filter(m => !isVideo(resolveFullUrl(m, EVENTS_URL))),
    [moments, EVENTS_URL]
  )

  // Count of pending stubs by media type for rendering processing cards
  const pendingVideoCount = pendingMoments.filter(p => p.mediaType === 'video').length
  const pendingImageCount = pendingMoments.filter(p => p.mediaType === 'image').length

  const groupedItems = React.useMemo(() => {
    const groups: Array<{ moments: Moment[]; phrase: string | null }> = []
    for (let i = 0; i < photoMoments.length; i += MOMENTS_PER_GROUP) {
      const slice = photoMoments.slice(i, i + MOMENTS_PER_GROUP)
      const phraseIdx = Math.floor(i / MOMENTS_PER_GROUP)
      // Only show phrase after group if there are more moments after this group
      const hasMore = i + MOMENTS_PER_GROUP < photoMoments.length
      const phrase = hasMore && phrases.length > 0 ? (phrases[phraseIdx % phrases.length] ?? null) : null
      groups.push({ moments: slice, phrase })
    }
    return groups
  }, [photoMoments, phrases])

  useEffect(() => {
    setIdentifier(getIdentifier())
  }, [])

  const fetchMoments = useCallback(async (id: string, cursor: string | null, append: boolean) => {
    try {
      const tokenParam = previewToken ? `&preview_token=${encodeURIComponent(previewToken)}` : ''
      // cursor=null → first page: use INITIAL_PAGE_SIZE (100) to capture all videos for VideoHighlights
      // cursor=string → subsequent scroll pages: use PAGE_SIZE (25)
      const cursorParam = cursor === null ? '' : cursor
      const limit = cursor === null ? INITIAL_PAGE_SIZE : PAGE_SIZE
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?cursor=${encodeURIComponent(cursorParam)}&limit=${limit}${tokenParam}`
      )
      if (!res.ok) {
        if (res.status === 404) { setError("Evento no encontrado"); return }
        if (res.status === 403) { setError("Token de vista previa inválido o expirado"); return }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      const data: MomentsResponse = json.data ?? json
      const newItems: Moment[] = data.items ?? []

      if (append) {
        setMoments(prev => [...prev, ...newItems].slice(0, MAX_TOTAL))
      } else {
        setMoments(newItems.slice(0, MAX_TOTAL))
      }

      totalRef.current = data.total ?? 0
      setPublished(data.published === true)
      if (data.event_name) setEventName(data.event_name)
      if (data.event_type) setEventType(data.event_type)
      if (data.event_date) setEventDate(data.event_date)

      // Update cursor state
      if (!data.next_cursor) {
        setReachedEnd(true)
        setNextCursor(null)
      } else {
        setReachedEnd(false)
        setNextCursor(data.next_cursor)
      }
    } catch {
      setError("No se pudieron cargar los momentos")
    }
  }, [EVENTS_URL, previewToken])

  const fetchPageSpec = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/page-spec`
      )
      if (!res.ok) return
      const json = await res.json()
      const meta = json.data?.meta ?? {}
      if (meta.pageTitle && !eventName) setEventName(meta.pageTitle)
      if (meta.eventType) setEventType(meta.eventType)
      if (meta.eventDate) setEventDate(meta.eventDate)
    } catch { /* silent */ }
  }, [EVENTS_URL, eventName])

  useEffect(() => {
    if (!identifier) return
    setLoading(true)
    Promise.all([
      fetchMoments(identifier, null, false),
      fetchPageSpec(identifier),
    ]).finally(() => setLoading(false))
  }, [identifier, fetchMoments, fetchPageSpec])

  // Fetch event phrases when eventType is known
  useEffect(() => {
    if (!eventType || !EVENTS_URL) return
    const type = eventType.toUpperCase()
    fetch(`${EVENTS_URL}api/events/phrases?type=${type}&count=15`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { data?: { phrases?: string[] } } | null) => {
        if (data?.data?.phrases?.length) {
          setPhrases(data.data.phrases)
        }
      })
      .catch(() => {
        // Silently fail — gallery works fine without phrases
      })
  }, [eventType, EVENTS_URL])

  // Load pending-moment stubs from sessionStorage when identifier is resolved
  useEffect(() => {
    if (!identifier) return
    const stubs = readPending(identifier)
    setPendingMoments(stubs)
    // Persist cleaned list (expired stubs removed by readPending)
    writePending(identifier, stubs)
  }, [identifier])

  // Poll the wall API every 12 s while there are processing stubs.
  // When the total number of *approved+done* moments grows, we assume at
  // least one pending stub has finished and remove the oldest one.
  // This is intentionally conservative: we don't have the moment's real ID
  // from sessionStorage, so we compare snapshot counts.
  const prevMomentCountRef = React.useRef<number>(0)
  useEffect(() => {
    if (!identifier || pendingMoments.length === 0) return

    // Capture API total (not local items.length) so pagination doesn't skew detection
    prevMomentCountRef.current = totalRef.current

    const poll = setInterval(async () => {
      try {
        const tokenParam = previewToken ? `&preview_token=${encodeURIComponent(previewToken)}` : ''
        const res = await fetch(
          `${EVENTS_URL}api/events/${encodeURIComponent(identifier)}/moments?page=1&limit=${PAGE_SIZE}${tokenParam}`
        )
        if (!res.ok) return
        const json = await res.json()
        const data: MomentsResponse = json.data ?? json
        const freshItems: Moment[] = data.items ?? []
        // Compare total count from API (not items.length) so pagination doesn't skew detection
        const freshTotal = data.total ?? freshItems.length
        const prev = prevMomentCountRef.current

        if (freshTotal > prev) {
          // Merge page-1 results into existing list without losing already-loaded pages
          setMoments(existing => {
            const existingIds = new Set(existing.map(m => m.id))
            const newItems = freshItems.filter(fi => !existingIds.has(fi.id))
            return newItems.length > 0 ? [...newItems, ...existing] : existing
          })
          const gained = freshTotal - prev
          prevMomentCountRef.current = freshTotal
          totalRef.current = freshTotal

          setPendingMoments(stubs => {
            const next = stubs.slice(Math.max(0, gained))
            writePending(identifier, next)
            return next
          })
        }
      } catch { /* silent — polling failure is non-critical */ }
    }, PROCESSING_POLL_MS)

    return () => clearInterval(poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifier, pendingMoments.length, EVENTS_URL, previewToken])

  const loadMore = useCallback(async () => {
    if (loadingMore || reachedEnd || !identifier || nextCursor === null) return
    setLoadingMore(true)
    await fetchMoments(identifier, nextCursor, true)
    setLoadingMore(false)
  }, [loadingMore, reachedEnd, identifier, nextCursor, fetchMoments])

  // Auto-load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reachedEnd && !loadingMore) {
          loadMore()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [reachedEnd, loadingMore, loadMore])

  const theme = getTheme(eventType)

  if (!identifier && typeof window !== "undefined") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-400 text-sm">Enlace invalido.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        {/* Hero skeleton */}
        <div className="relative overflow-hidden bg-gray-50 py-20 sm:py-28 text-center">
          <div className="mx-auto space-y-4 flex flex-col items-center">
            <div className="h-3 w-24 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-10 w-64 sm:w-80 bg-gray-200 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
            <div className="h-3 w-32 bg-gray-100 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
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
                style={{ height: `${[180, 240, 160, 200, 280, 150, 220, 190, 260, 170, 230, 200][i]}px`, animationDelay: `${i * 0.05}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-5 max-w-xs"
        >
          <div className="text-4xl">📷</div>
          <div className="space-y-2">
            <p className="text-gray-700 font-medium text-sm">No pudimos cargar los momentos</p>
            <p className="text-gray-400 text-xs">Verifica tu conexión o intenta de nuevo.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reintentar
          </button>
        </motion.div>
      </div>
    )
  }

  if (published === false && !isAdminPreview) {
    return <ComingSoonScreen eventName={eventName} theme={theme} />
  }

  if (moments.length === 0 && pendingMoments.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${theme.heroLightBg}`}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className={`text-5xl ${theme.headingFont} ${theme.accent}`}>
            {eventName || "Momentos"}
          </div>
          <p className="text-gray-500 text-sm">Aun no hay momentos publicados. Vuelve pronto!</p>
        </motion.div>
      </div>
    )
  }

  return (
    <>
      {isAdminPreview && <AdminPreviewBanner onClose={() => {/* dismisses UI only */}} />}
      <div className={`min-h-screen bg-white ${isAdminPreview ? 'pt-14' : ''}`}>
      <HeroHeader
          eventName={eventName}
          eventDate={eventDate}
          theme={theme}
          photoCount={photoMoments.length}
          videoCount={videoMoments.length}
        />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-0">
        <VideoHighlights
          videoMoments={videoMoments}
          processingVideoCount={pendingVideoCount}
          EVENTS_URL={EVENTS_URL}
          theme={theme}
          onVideoClick={(index, e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            const cx = rect.left + rect.width / 2
            const cy = rect.top + rect.height / 2
            setVideoLightboxOrigin({
              x: cx < window.innerWidth / 2 ? 0 : 100,
              y: cy < window.innerHeight / 2 ? 0 : 100,
            })
            setVideoLightboxIndex(index)
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
            const indexOffset = groupIdx * MOMENTS_PER_GROUP
            return (
              <React.Fragment key={group.moments[0]?.id ?? groupIdx}>
                {/* Photo grid group — Instagram CSS grid */}
                <div
                  className="grid grid-cols-3 gap-0.5"
                  style={{ gridAutoFlow: 'row dense', contentVisibility: 'auto', containIntrinsicSize: 'auto 540px' }}
                >
                  {group.moments.map((moment, i) => {
                    const globalIndex = indexOffset + i
                    return (
                      <PhotoCard
                        key={moment.id}
                        moment={moment}
                        globalIndex={globalIndex}
                        EVENTS_URL={EVENTS_URL}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          const cx = rect.left + rect.width / 2
                          const cy = rect.top + rect.height / 2
                          setLightboxOrigin({
                            x: cx < window.innerWidth / 2 ? 0 : 100,
                            y: cy < window.innerHeight / 2 ? 0 : 100,
                          })
                          setLightboxIndex(globalIndex)
                        }}
                      />
                    )
                  })}
                </div>
                {/* Memory card after this group */}
                {group.phrase && (
                  <div className="px-3 sm:px-4 py-2">
                    <MemoryCard
                      phrase={group.phrase}
                      index={groupIdx}
                      theme={theme}
                    />
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {reachedEnd && moments.length > 0 && (
          <p className="col-span-3 text-center text-white/60 py-8 text-sm">
            ✨ Has visto todos los momentos del evento
          </p>
        )}

        {/* Infinite scroll sentinel — watched by IntersectionObserver */}
        <div ref={sentinelRef} className="h-16 flex items-center justify-center mt-4">
          {loadingMore && (
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
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
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-2xl mb-3"
              aria-hidden="true"
            >
              {theme.microIcon}
            </motion.div>
            <p className="text-sm text-gray-400 tracking-wide">
              Estos son todos los momentos compartidos
            </p>
          </motion.div>
        )}
      </div>

      <ThemeFooter theme={theme} eventName={eventName} />

      <AnimatePresence>
        {lightboxIndex !== null && (
          <GalleryLightbox
            moments={photoMoments}
            index={lightboxIndex}
            EVENTS_URL={EVENTS_URL}
            theme={theme}
            origin={lightboxOrigin}
            onClose={() => { setLightboxIndex(null); setLightboxOrigin(null) }}
            onNext={() => setLightboxIndex(i => i !== null ? Math.min(i + 1, photoMoments.length - 1) : null)}
            onPrev={() => setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {videoLightboxIndex !== null && (
          <VideoLightbox
            moments={videoMoments}
            index={videoLightboxIndex}
            EVENTS_URL={EVENTS_URL}
            origin={videoLightboxOrigin}
            onClose={() => { setVideoLightboxIndex(null); setVideoLightboxOrigin(null) }}
            onNext={() => setVideoLightboxIndex(i => i !== null ? Math.min(i + 1, videoMoments.length - 1) : null)}
            onPrev={() => setVideoLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
          />
        )}
      </AnimatePresence>
    </div>
    </>
  )
}

// ── HeroHeader ──────────────────────────────────────────────────────────────

function HeroHeader({
  eventName,
  eventDate,
  theme,
  photoCount,
  videoCount,
}: {
  eventName: string
  eventDate: string
  theme: ReturnType<typeof getTheme>
  photoCount: number
  videoCount: number
}) {
  const formattedDate = eventDate
    ? new Date(eventDate + 'T12:00:00').toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''

  return (
    <div className={`relative text-center py-10 sm:py-14 px-6 overflow-hidden ${theme.heroLightBg}`}>
      {/* Aurora blob 1 — top-left */}
      <div
        className="animate-blob-1 absolute -top-16 -left-16 w-72 h-72 rounded-full opacity-40 pointer-events-none"
        style={{ background: theme.blobColor1, filter: 'blur(80px)' }}
        aria-hidden="true"
      />
      {/* Aurora blob 2 — bottom-right */}
      <div
        className="animate-blob-2 absolute -bottom-16 -right-16 w-80 h-80 rounded-full opacity-35 pointer-events-none"
        style={{ background: theme.blobColor2, filter: 'blur(80px)' }}
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
        {theme.microIcon}
      </motion.div>
      {/* Subtle theme decoration — right */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 0.35, x: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl pointer-events-none select-none"
        aria-hidden="true"
      >
        {theme.microIcon}
      </motion.div>

      {/* Event name */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 ${theme.headingFont}`}
      >
        {eventName || 'Momentos'}
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
        style={{ transformOrigin: 'center', background: `linear-gradient(to right, transparent, ${theme.blobColor1}80, transparent)` }}
      />

      {/* Stats pill — photo/video count */}
      {(photoCount > 0 || videoCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-4 flex justify-center"
        >
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${theme.accentSoft} ${theme.accent}`}>
            {photoCount > 0 && (
              <span>{photoCount} {photoCount === 1 ? 'foto' : 'fotos'}</span>
            )}
            {photoCount > 0 && videoCount > 0 && (
              <span className="w-1 h-1 rounded-full opacity-40 bg-current inline-block" aria-hidden="true" />
            )}
            {videoCount > 0 && (
              <span>{videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>
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
  )
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
  moment: Moment
  globalIndex: number
  EVENTS_URL: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL)
  const fullUrl = resolveFullUrl(moment, EVENTS_URL)
  const isVideoMoment = isVideo(fullUrl)
  const featured = getCardType(globalIndex) === 'featured'
  const eager = globalIndex < 6

  return (
    <button
      type="button"
      className={`relative overflow-hidden bg-gray-100 cursor-pointer group aspect-square focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${
        featured ? 'col-span-2 row-span-2' : ''
      }`}
      onClick={onClick}
      aria-label={moment.description || 'Ver momento'}
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
        alt={moment.description || 'Momento del evento'}
        loading={eager ? 'eager' : 'lazy'}
        {...(eager ? { fetchPriority: 'high' as const } : {})}
        decoding="async"
        draggable={false}
        className={`w-full h-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-105 ${
          loaded ? 'opacity-100' : 'opacity-0'
        } ${featured ? 'absolute inset-0' : ''}`}
        onLoad={() => setLoaded(true)}
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
            <PlayIcon />
          </div>
        </div>
      )}

      {/* Description — slides up on hover */}
      {moment.description && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200 pointer-events-none">
          <p className="text-white text-xs line-clamp-2">{moment.description}</p>
        </div>
      )}
    </button>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  )
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
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          className="w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full"
          style={{ willChange: 'transform' }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-medium text-gray-400 tracking-wide select-none">
          Optimizando…
        </span>
      </div>
    </div>
  )
}

// ── ProcessingVideoCard ───────────────────────────────────────────────────────
// Masonry-compatible placeholder shown while Lambda optimizes an uploaded video.

function ProcessingVideoCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 280, damping: 24 }}
      className="break-inside-avoid mb-3 relative w-full rounded-xl overflow-hidden bg-zinc-900"
      style={{ aspectRatio: '9/16' }}
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
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full"
          style={{ willChange: 'transform' }}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-zinc-400 tracking-wide select-none">
          Optimizando video…
        </span>
      </div>
    </motion.div>
  )
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
  moment: Moment
  EVENTS_URL: string
  onExpand: (e: React.MouseEvent) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Start playback when ≥30% of the card enters the viewport; pause on exit.
  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {}) // silently handles autoplay-policy blocks
        } else {
          video.pause()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const url = resolveFullUrl(moment, EVENTS_URL)

  return (
    <div
      ref={containerRef}
      className="break-inside-avoid mb-3 relative rounded-xl overflow-hidden bg-zinc-900 cursor-pointer group"
      onClick={onExpand}
    >
      <video
        ref={videoRef}
        src={url}
        muted
        loop
        playsInline
        preload="none"
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-auto block"
        style={{ minHeight: '140px' }}
      />

      {/* Hover overlay + expand hint */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 pointer-events-none" aria-hidden="true" />

      {/* Expand icon — centered, visible on hover */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 scale-90 group-hover:scale-100 transition-transform">
          {/* Fullscreen / expand arrows */}
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </div>
      </div>

      {/* Description overlay */}
      {moment.description && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3">
          <p className="text-white text-xs line-clamp-2">{moment.description}</p>
        </div>
      )}
    </div>
  )
}

// ── VideoLightbox ────────────────────────────────────────────────────────────
// Full-screen video lightbox — mirrors GalleryLightbox but for video moments.
// Prev/next navigation, keyboard (←→ Esc), swipe, expand-from-card animation.

function VideoLightbox({ moments, index, EVENTS_URL, origin, onClose, onNext, onPrev }: {
  moments: Moment[]; index: number; EVENTS_URL: string
  origin: { x: number; y: number } | null
  onClose: () => void; onNext: () => void; onPrev: () => void
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const moment = moments[index]
  const url = resolveFullUrl(moment, EVENTS_URL)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [onClose, onNext, onPrev])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center"
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Cerrar"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Anterior"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Next */}
      {index < moments.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Siguiente"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Video — expands from card position */}
      <motion.div
        key={moment.id}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        style={{ transformOrigin: `${origin?.x ?? 50}% ${origin?.y ?? 50}%` }}
        className="w-full max-w-2xl px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <LightboxVideo src={url} className="w-full max-h-[80vh] rounded-2xl" />
      </motion.div>

      {/* Description */}
      {moment.description && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-md px-6"
        >
          <p className="text-white/90 text-sm text-center bg-black/30 backdrop-blur-md rounded-2xl px-5 py-3 leading-relaxed">
            "{moment.description}"
          </p>
        </motion.div>
      )}

      {/* Counter */}
      {moments.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs font-medium">
          {index + 1} / {moments.length}
        </div>
      )}
    </motion.div>
  )
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
  videoMoments: Moment[]
  processingVideoCount: number
  EVENTS_URL: string
  theme: ReturnType<typeof getTheme>
  onVideoClick: (index: number, e: React.MouseEvent) => void
}) {
  if (videoMoments.length === 0 && processingVideoCount === 0) return null

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <div className={`w-5 h-0.5 rounded-full ${theme.accentSoft}`} />
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${theme.accent}`}>
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
  )
}

// ── MemoryCard ───────────────────────────────────────────────────────────────

function MemoryCard({
  phrase,
  index,
  theme,
}: {
  phrase: string
  index: number
  theme: MomentsTheme
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '0px 0px -50px 0px' }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className="w-full"
    >
      <div
        className={`bg-gradient-to-br ${theme.cardGradient} border ${theme.cardBorder} rounded-[20px] px-6 py-7`}
      >
        {/* Micro icon — animated */}
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-xl mb-4 block text-center"
          aria-hidden="true"
        >
          {theme.microIcon}
        </motion.div>

        {/* Phrase text — CSS typewriter, zero JS re-renders */}
        <p
          className={`text-center text-lg sm:text-xl font-semibold leading-snug ${theme.cardTextColor} font-serif overflow-hidden whitespace-nowrap border-r-2 border-current mx-auto`}
          style={{
            width: 0,
            animation: `typing 1.8s steps(${phrase.length}) forwards, blink-caret 0.8s step-end infinite`,
            maxWidth: '100%',
            minHeight: '2.5rem',
          }}
        >
          {phrase}
        </p>
      </div>
    </motion.div>
  )
}

// ── LightboxVideo — autoplay with iOS fallback ──────────────────────────────
// iOS Safari silently rejects autoPlay unless triggered by a user gesture.
// If play() returns a rejected promise, we show a tap-to-play overlay instead.

const LightboxVideo = memo(function LightboxVideo({ src, className }: { src: string; className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [needsTap, setNeedsTap] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setNeedsTap(false)
    const p = video.play()
    if (p !== undefined) {
      p.catch(() => setNeedsTap(true))
    }
  }, [src])

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className={className}
      />
      {needsTap && (
        <button
          onClick={() => { videoRef.current?.play(); setNeedsTap(false) }}
          className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl"
          aria-label="Reproducir video"
        >
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </button>
      )}
    </div>
  )
})

// ── GalleryLightbox ─────────────────────────────────────────────────────────

function GalleryLightbox({ moments, index, EVENTS_URL, theme, origin, onClose, onNext, onPrev }: {
  moments: Moment[]; index: number; EVENTS_URL: string; theme: MomentsTheme
  origin: { x: number; y: number } | null
  onClose: () => void; onNext: () => void; onPrev: () => void
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const moment = moments[index]
  const url = resolveFullUrl(moment, EVENTS_URL)
  const video = isVideo(url)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") onNext()
      if (e.key === "ArrowLeft") onPrev()
    }
    window.addEventListener("keydown", handler)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handler)
      document.body.style.overflow = ""
    }
  }, [onClose, onNext, onPrev])

  // Preload adjacent images so navigation feels instant
  useEffect(() => {
    const preload = (m: Moment | undefined) => {
      if (!m) return;
      const url = resolveFullUrl(m, EVENTS_URL);
      if (!url || isVideo(url)) return; // videos are too large to preload
      const img = new Image();
      img.src = url;
    };
    preload(moments[index - 1]);
    preload(moments[index + 1]);
  }, [index, moments, EVENTS_URL])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) onNext()
    else onPrev()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-[60] ${theme.lightboxBg} backdrop-blur-sm flex flex-col items-center justify-center`}
      style={{ touchAction: 'none' }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onPrev() }} className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
      )}
      {index < moments.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNext() }} className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      )}

      <motion.div
        key={moment.id}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        style={{ transformOrigin: `${origin?.x ?? 50}% ${origin?.y ?? 50}%` }}
        className="max-w-full max-h-[80vh] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {video ? (
          <LightboxVideo src={url} className="max-h-[80vh] max-w-full rounded-2xl" />
        ) : (
          <img
            src={url}
            alt={moment.description ?? ""}
            draggable={false}
            className="max-h-[80vh] max-w-full rounded-2xl object-contain"
          />
        )}
      </motion.div>

      {moment.description && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-md px-6"
        >
          <p className="text-white/90 text-sm text-center bg-black/30 backdrop-blur-md rounded-2xl px-5 py-3 leading-relaxed">"{moment.description}"</p>
        </motion.div>
      )}

      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-xs font-medium">
        {index + 1} / {moments.length}
      </div>
    </motion.div>
  )
}

// ── ThemeFooter ─────────────────────────────────────────────────────────────

function ThemeFooter({ theme, eventName }: { theme: MomentsTheme; eventName: string }) {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      className={`py-16 text-center ${theme.heroBg} relative overflow-hidden`}
    >
      <Decorations type={theme.decorationType} />
      <div className="relative z-10 space-y-4">
        <p className={`text-xl sm:text-2xl ${theme.headingFont} ${theme.accent}`}>{theme.footerMessage}</p>
        {eventName && <p className="text-sm text-gray-400">{eventName}</p>}
      </div>
    </motion.footer>
  )
}

// ── ComingSoonScreen ────────────────────────────────────────────────────────

function ComingSoonScreen({ eventName, theme }: { eventName: string; theme: MomentsTheme }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${theme.heroLightBg} relative overflow-hidden`}>
      <Decorations type={theme.decorationType} />

      {/* Floating ambient circles */}
      <motion.div
        className="absolute w-72 h-72 rounded-full opacity-[0.06] bg-current pointer-events-none"
        style={{ top: '15%', left: '5%' }}
        animate={{ scale: [1, 1.15, 1], x: [0, 12, 0] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-48 h-48 rounded-full opacity-[0.05] bg-current pointer-events-none"
        style={{ bottom: '10%', right: '8%' }}
        animate={{ scale: [1, 1.2, 1], x: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1 }}
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
            <span className="text-6xl sm:text-7xl select-none">✨</span>
            <motion.span
              className="absolute -top-2 -right-3 text-2xl"
              animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.2, 0.9, 1] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.5 }}
            >📸</motion.span>
          </motion.div>
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
          className="space-y-3"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Próximamente</p>
          <h1 className={`text-3xl sm:text-4xl ${theme.headingFont} ${theme.accent} leading-tight`}>
            {eventName ? `Los momentos de\n${eventName}` : "El muro de momentos"}
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-gray-400 text-sm leading-relaxed max-w-[260px] mx-auto"
        >
          Estamos preparando algo especial. Vuelve pronto para revivir cada instante.
        </motion.p>

        {/* Animated dots loader */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-center gap-2 pt-2"
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className={`w-2 h-2 rounded-full ${theme.accentSoft} opacity-60`}
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.25, ease: "easeInOut" }}
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
  )
}

// ── Decorations ─────────────────────────────────────────────────────────────

function Decorations({ type }: { type: MomentsTheme['decorationType'] }) {
  if (type === 'botanical') {
    return (
      <>
        <svg className="absolute top-0 left-0 w-32 h-32 text-amber-200/30 -translate-x-1/3 -translate-y-1/4" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
        <svg className="absolute bottom-0 right-0 w-40 h-40 text-amber-200/20 translate-x-1/4 translate-y-1/4 rotate-45" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0 C50 30, 20 50, 0 50 C20 50, 50 80, 50 100 C50 80, 80 50, 100 50 C80 50, 50 30, 50 0Z" />
        </svg>
      </>
    )
  }
  if (type === 'confetti') {
    return (
      <>
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: `${10 + (i * 12)}%`,
              top: `${5 + (i % 3) * 30}%`,
              backgroundColor: ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fb923c', '#22d3ee'][i],
            }}
            animate={{ y: [0, -8, 0], opacity: [0.3, 0.6, 0.3] }}
            transition={{ repeat: Infinity, duration: 2 + i * 0.5, delay: i * 0.3, ease: "easeInOut" }}
          />
        ))}
      </>
    )
  }
  if (type === 'sparkles') {
    return (
      <>
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-rose-300/40"
            style={{ left: `${15 + i * 15}%`, top: `${10 + (i % 2) * 60}%` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.4, ease: "easeInOut" }}
          >
            ✦
          </motion.div>
        ))}
      </>
    )
  }
  if (type === 'geometric') {
    return (
      <>
        <div className="absolute top-10 right-10 w-20 h-20 border border-gray-200/30 rotate-45" />
        <div className="absolute bottom-10 left-10 w-16 h-16 border border-gray-200/20 rotate-12" />
      </>
    )
  }
  return null
}

// ── AdminPreviewBanner ────────────────────────────────────────────────────────

function AdminPreviewBanner({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(true)

  const handleClose = () => {
    setVisible(false)
    onClose()
  }

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
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center"
            >
              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </motion.div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">Vista previa de administrador</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                  Solo tú ves esto
                </span>
              </div>
              <p className="hidden sm:block text-xs text-gray-400 truncate">El muro aún no es público — los invitados ven la pantalla de &quot;Próximamente&quot;</p>
            </div>
          </div>

          {/* Right: close */}
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar aviso de vista previa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
