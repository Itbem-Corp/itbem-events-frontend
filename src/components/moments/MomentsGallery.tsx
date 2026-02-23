"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  published: number
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

const PAGE_SIZE = 30

// ── MomentsGallery ─────────────────────────────────────────────────────────

interface Props {
  EVENTS_URL: string
}

export default function MomentsGallery({ EVENTS_URL }: Props) {
  const [identifier, setIdentifier] = useState("")
  const [moments, setMoments] = useState<Moment[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [published, setPublished] = useState<boolean | null>(null)
  const [eventName, setEventName] = useState("")
  const [eventType, setEventType] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [error, setError] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    setIdentifier(getIdentifier())
  }, [])

  const fetchMoments = useCallback(async (id: string, pageNum: number, append: boolean) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=${pageNum}&limit=${PAGE_SIZE}`
      )
      if (!res.ok) {
        if (res.status === 404) { setError("Evento no encontrado"); return }
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      const data: MomentsResponse = json.data ?? json

      setMoments(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
      setHasMore(data.has_more ?? false)
      setPublished(data.moments_wall_published ?? true)

      if (data.event_name) setEventName(data.event_name)
      if (data.event_type) setEventType(data.event_type)
      if (data.event_date) setEventDate(data.event_date)
    } catch {
      setError("No se pudieron cargar los momentos")
    }
  }, [EVENTS_URL])

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
      fetchMoments(identifier, 1, false),
      fetchPageSpec(identifier),
    ]).finally(() => setLoading(false))
  }, [identifier, fetchMoments, fetchPageSpec])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !identifier) return
    const nextPage = page + 1
    setLoadingMore(true)
    await fetchMoments(identifier, nextPage, true)
    setPage(nextPage)
    setLoadingMore(false)
  }, [loadingMore, hasMore, identifier, page, fetchMoments])

  const theme = getTheme(eventType)

  const photos = moments.filter(m => !isVideo(resolveFullUrl(m, EVENTS_URL)))
  const videos = moments.filter(m => isVideo(resolveFullUrl(m, EVENTS_URL)))
  const comments = moments.filter(m => m.description?.trim())

  if (!identifier && typeof window !== "undefined") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-400 text-sm">Enlace invalido.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center space-y-3">
          <p className="text-gray-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (published === false) {
    return <ComingSoonScreen eventName={eventName} theme={theme} />
  }

  if (moments.length === 0) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${theme.heroBg}`}>
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
    <div className="min-h-screen bg-white">
      <HeroHeader eventName={eventName} eventDate={eventDate} theme={theme} />

      <StatsBar
        photoCount={photos.length}
        videoCount={videos.length}
        commentCount={comments.length}
        theme={theme}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-4">
          {moments.map((m, i) => (
            <MomentCard
              key={m.id}
              moment={m}
              index={i}
              EVENTS_URL={EVENTS_URL}
              theme={theme}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-10">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className={`px-8 py-3 rounded-full text-sm font-medium transition-all ${theme.accentSoft} ${theme.accent} hover:opacity-80 disabled:opacity-50`}
            >
              {loadingMore ? "Cargando..." : "Cargar mas momentos"}
            </button>
          </div>
        )}
      </div>

      {comments.length >= 3 && (
        <CommentsMarquee comments={comments.map(m => m.description!)} theme={theme} />
      )}

      <ThemeFooter theme={theme} eventName={eventName} />

      <AnimatePresence>
        {lightboxIndex !== null && (
          <GalleryLightbox
            moments={moments}
            index={lightboxIndex}
            EVENTS_URL={EVENTS_URL}
            theme={theme}
            onClose={() => setLightboxIndex(null)}
            onNext={() => setLightboxIndex(i => i !== null ? Math.min(i + 1, moments.length - 1) : null)}
            onPrev={() => setLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── HeroHeader ──────────────────────────────────────────────────────────────

function HeroHeader({ eventName, eventDate, theme }: {
  eventName: string; eventDate: string; theme: MomentsTheme
}) {
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString("es-MX", { dateStyle: "long" })
    : ""

  return (
    <div className={`relative overflow-hidden ${theme.heroBg}`}>
      <Decorations type={theme.decorationType} />
      <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-24 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-sm uppercase tracking-[0.2em] text-gray-400 mb-4"
        >
          Los momentos de
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
          className={`text-4xl sm:text-5xl lg:text-6xl ${theme.headingFont} ${theme.accent} leading-tight`}
        >
          {eventName || "Nuestros Momentos"}
        </motion.h1>
        {formattedDate && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 text-sm text-gray-400"
          >
            {formattedDate}
          </motion.p>
        )}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 mx-auto w-16 h-px bg-gray-300/50"
        />
      </div>
    </div>
  )
}

// ── StatsBar ────────────────────────────────────────────────────────────────

function StatsBar({ photoCount, videoCount, commentCount, theme }: {
  photoCount: number; videoCount: number; commentCount: number; theme: MomentsTheme
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="flex items-center justify-center gap-6 sm:gap-10 py-6 border-b border-gray-100"
    >
      <StatItem icon="📸" count={photoCount} label={photoCount === 1 ? "foto" : "fotos"} delay={0.7} />
      {videoCount > 0 && <StatItem icon="🎬" count={videoCount} label={videoCount === 1 ? "video" : "videos"} delay={0.85} />}
      {commentCount > 0 && <StatItem icon="💬" count={commentCount} label={commentCount === 1 ? "mensaje" : "mensajes"} delay={1.0} />}
    </motion.div>
  )
}

function StatItem({ icon, count, label, delay }: { icon: string; count: number; label: string; delay: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg">{icon}</span>
      <AnimatedCounter value={count} delay={delay} />
      <span className="text-sm text-gray-400">{label}</span>
    </div>
  )
}

function AnimatedCounter({ value, delay }: { value: number; delay: number }) {
  const [display, setDisplay] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const timer = setTimeout(() => {
      const duration = 800
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(eased * value))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay * 1000)
    return () => clearTimeout(timer)
  }, [value, delay])

  return <span className="text-lg font-bold text-gray-800 tabular-nums">{display}</span>
}

// ── MomentCard ──────────────────────────────────────────────────────────────

function MomentCard({ moment, index, EVENTS_URL, theme, onClick }: {
  moment: Moment; index: number; EVENTS_URL: string; theme: MomentsTheme; onClick: () => void
}) {
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL)
  const fullUrl = resolveFullUrl(moment, EVENTS_URL)
  const video = isVideo(fullUrl)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 1.2), type: "spring", stiffness: 300, damping: 25 }}
      className="break-inside-avoid mb-3 sm:mb-4 group cursor-pointer"
      onClick={onClick}
    >
      <div className="relative rounded-2xl overflow-hidden bg-gray-100">
        {video ? (
          <div className="relative aspect-video">
            {moment.thumbnail_url ? (
              <img src={thumbUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <PlayIcon />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/60 transition-colors">
                <PlayIcon />
              </div>
            </div>
          </div>
        ) : (
          <img src={thumbUrl} alt={moment.description ?? ""} className="w-full transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
        )}

        {moment.description && (
          <div className={`absolute inset-0 ${theme.cardOverlay} opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4`}>
            <p className="text-white text-sm leading-relaxed line-clamp-3 font-light">"{moment.description}"</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  )
}

// ── GalleryLightbox ─────────────────────────────────────────────────────────

function GalleryLightbox({ moments, index, EVENTS_URL, theme, onClose, onNext, onPrev }: {
  moments: Moment[]; index: number; EVENTS_URL: string; theme: MomentsTheme
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
      className={`fixed inset-0 z-50 ${theme.lightboxBg} backdrop-blur-sm flex flex-col items-center justify-center`}
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
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="max-w-full max-h-[80vh] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {video ? (
          <video src={url} controls autoPlay playsInline className="max-h-[80vh] max-w-full rounded-2xl" />
        ) : (
          <img src={url} alt={moment.description ?? ""} className="max-h-[80vh] max-w-full rounded-2xl object-contain" />
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

// ── CommentsMarquee ─────────────────────────────────────────────────────────

function CommentsMarquee({ comments, theme }: { comments: string[]; theme: MomentsTheme }) {
  const doubled = [...comments, ...comments]

  return (
    <div className="overflow-hidden py-10 border-t border-gray-100">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-gray-300 mb-6">Mensajes de los invitados</p>
      <div className="relative">
        <div className="flex gap-8 animate-marquee whitespace-nowrap" style={{ animationDuration: `${comments.length * 4}s` }}>
          {doubled.map((c, i) => (
            <span key={i} className={`inline-block text-lg ${theme.headingFont} text-gray-300 italic`}>"{c}"</span>
          ))}
        </div>
      </div>
    </div>
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
    <div className={`min-h-screen flex items-center justify-center px-6 ${theme.heroBg} relative overflow-hidden`}>
      <Decorations type={theme.decorationType} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 text-center space-y-6">
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="text-5xl">✨</motion.div>
        <h1 className={`text-3xl sm:text-4xl ${theme.headingFont} ${theme.accent}`}>Proximamente</h1>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">
          El muro de momentos de <span className="font-medium text-gray-600">{eventName || "este evento"}</span> se esta preparando.
        </p>
      </motion.div>
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
