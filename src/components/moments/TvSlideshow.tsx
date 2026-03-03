"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { QRCodeSVG } from "qrcode.react"

// ── Types ────────────────────────────────────────────────────────────────────

interface Slide {
  id: string
  content_url: string
  thumbnail_url?: string
  description?: string
  created_at: string
  order?: number
}

interface Props {
  EVENTS_URL: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getIdentifier(): string {
  if (typeof window === "undefined") return ""
  const match = window.location.pathname.match(/\/e\/([^/]+)\/tv/)
  return match?.[1] ?? ""
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(url)
}

function resolveUrl(slide: Slide, base: string): string {
  const url = slide.content_url
  if (!url) return ""
  if (url.startsWith("http")) return url
  return `${base}${url.startsWith("/") ? url.slice(1) : url}`
}

// Random Ken-Burns params: scale + translate in random directions, seeded per ID
function kenBurns(id: string) {
  // deterministic pseudo-random from id so it doesn't change on re-render
  const h = id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffffff, 0)
  const dx = ((h & 0xff) / 255 - 0.5) * 5
  const dy = (((h >> 8) & 0xff) / 255 - 0.5) * 5
  const scaleEnd = 1.06 + (((h >> 16) & 0xff) / 255) * 0.06
  return { dx, dy, scaleEnd }
}

const PHOTO_DURATION = 6000   // ms per photo slide
const VIDEO_MAX_MS   = 30000  // cap for very long videos
const POLL_INTERVAL  = 30000  // re-fetch for new moments

// ── Component ────────────────────────────────────────────────────────────────

export default function TvSlideshow({ EVENTS_URL }: Props) {
  const [identifier, setIdentifier] = useState("")
  const [slides, setSlides] = useState<Slide[]>([])
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showQR, setShowQR] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [eventName, setEventName] = useState("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoCapRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Init ──
  useEffect(() => { setIdentifier(getIdentifier()) }, [])

  // ── Fetch ──
  const fetchSlides = useCallback(async (id: string, isInitial: boolean) => {
    try {
      const res = await fetch(
        `${EVENTS_URL}api/events/${encodeURIComponent(id)}/moments?page=1&limit=500`
      )
      if (!res.ok) return
      const json = await res.json()
      const data = json.data ?? json
      const items: Slide[] = (data.items ?? [])
      if (data.event_name && isInitial) setEventName(data.event_name)

      setSlides((prev) => {
        if (isInitial) return items
        const newIds = new Set(items.map((s: Slide) => s.id))
        const prevIds = new Set(prev.map((s) => s.id))
        const added = items.filter((s: Slide) => !prevIds.has(s.id)).length
        if (added > 0) setNewCount((n) => n + added)
        // Merge new items at end; preserve current index position
        const merged = [
          ...prev.filter((s) => newIds.has(s.id)),
          ...items.filter((s: Slide) => !prevIds.has(s.id)),
        ]
        if (merged.length > 0) {
          setIndex((i) => Math.min(i, merged.length - 1))
        }
        return merged
      })
    } catch { /* silent */ }
  }, [EVENTS_URL])

  useEffect(() => {
    if (!identifier) return
    fetchSlides(identifier, true)
    const poll = setInterval(() => fetchSlides(identifier, false), POLL_INTERVAL)
    return () => clearInterval(poll)
  }, [identifier, fetchSlides])

  // ── Navigation ──
  const advance = useCallback(() => {
    setIndex((i) => (slides.length > 0 ? (i + 1) % slides.length : 0))
    setNewCount(0)
  }, [slides.length])

  const goBack = useCallback(() => {
    setIndex((i) => (slides.length > 0 ? (i - 1 + slides.length) % slides.length : 0))
  }, [slides.length])

  // ── Auto-advance timer (photos only) ──
  const currentSlide = slides[index]
  const currentUrl = currentSlide ? resolveUrl(currentSlide, EVENTS_URL) : ""
  const currentIsVideo = !!currentUrl && isVideo(currentUrl)

  useEffect(() => {
    if (paused || currentIsVideo || slides.length === 0) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(advance, PHOTO_DURATION)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (videoCapRef.current) clearTimeout(videoCapRef.current)
    }
  }, [index, paused, currentIsVideo, slides.length, advance])

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // ── Pause toggle ──
  const togglePause = useCallback(() => setPaused((p) => !p), [])

  // ── Keyboard ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); togglePause() }
      if (e.key === "ArrowRight") { e.preventDefault(); advance() }
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack() }
      if (e.key === "f" || e.key === "F") toggleFullscreen()
      if (e.key === "Escape") setPaused(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [advance, goBack, toggleFullscreen, togglePause])

  // ── QR auto-hide after 10s idle ──
  const resetQrTimer = useCallback(() => {
    setShowQR(true)
    if (qrHideRef.current) clearTimeout(qrHideRef.current)
    qrHideRef.current = setTimeout(() => setShowQR(false), 10000)
  }, [])

  useEffect(() => {
    resetQrTimer()
    window.addEventListener("mousemove", resetQrTimer)
    window.addEventListener("touchstart", resetQrTimer)
    return () => {
      window.removeEventListener("mousemove", resetQrTimer)
      window.removeEventListener("touchstart", resetQrTimer)
    }
  }, [resetQrTimer])

  // ── Click zones (left half = back, right half = next) ──
  const handleClick = useCallback((e: React.MouseEvent) => {
    const x = e.clientX / window.innerWidth
    if (x < 0.5) goBack(); else advance()
  }, [advance, goBack])

  // ── Upload URL ──
  const uploadUrl = useMemo(() => {
    if (typeof window === "undefined" || !identifier) return ""
    return `${window.location.origin}/e/${identifier}`
  }, [identifier])

  // ── Ken-Burns params for current slide (stable per slide id) ──
  const kb = useMemo(() => currentSlide ? kenBurns(currentSlide.id) : null, [currentSlide?.id])

  // ── Empty state ──
  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-8">
        <p className="text-white/40 text-lg tracking-wide animate-pulse">Esperando momentos…</p>
        {uploadUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG value={uploadUrl} size={160} />
            </div>
            <p className="text-white/50 text-sm">Escanea para compartir momentos</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden select-none"
      onClick={handleClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* ── Slides ── */}
      <AnimatePresence mode="sync">
        <motion.div
          key={currentSlide?.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {currentIsVideo ? (
            <video
              key={currentUrl}
              src={currentUrl}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-contain"
              onEnded={advance}
              onError={advance}
              ref={(el) => {
                if (el) {
                  // Clear any previous cap timer
                  if (videoCapRef.current) clearTimeout(videoCapRef.current)
                  const cap = () => {
                    if (el.duration > VIDEO_MAX_MS / 1000) {
                      videoCapRef.current = setTimeout(advance, VIDEO_MAX_MS)
                    }
                  }
                  el.addEventListener("loadedmetadata", cap, { once: true })
                } else {
                  // Element removed — clear cap timer
                  if (videoCapRef.current) clearTimeout(videoCapRef.current)
                }
              }}
            />
          ) : (
            kb && (
              <motion.img
                key={currentUrl}
                src={currentUrl}
                alt={currentSlide?.description ?? ""}
                className="absolute inset-0 w-full h-full object-contain"
                initial={{ scale: 1, x: "0%", y: "0%" }}
                animate={{ scale: kb.scaleEnd, x: `${kb.dx}%`, y: `${kb.dy}%` }}
                transition={{ duration: PHOTO_DURATION / 1000, ease: "linear" }}
                draggable={false}
              />
            )
          )}

          {/* Dark gradient for captions */}
          {currentSlide?.description && (
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Caption ── */}
      <AnimatePresence>
        {currentSlide?.description && (
          <motion.div
            key={`caption-${currentSlide.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="absolute bottom-10 inset-x-0 flex justify-center px-8 pointer-events-none"
          >
            <p className="text-white text-lg sm:text-xl font-medium text-center max-w-2xl leading-relaxed drop-shadow-2xl">
              &ldquo;{currentSlide.description}&rdquo;
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Progress bar ── */}
      {!currentIsVideo && (
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/10 pointer-events-none">
          <motion.div
            key={`${currentSlide?.id}-${paused}`}
            className="h-full bg-white/60 origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: paused ? undefined : 1 }}
            transition={{ duration: PHOTO_DURATION / 1000, ease: "linear" }}
          />
        </div>
      )}

      {/* ── Top bar (event name + controls) ── */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-between p-5 pointer-events-none">
        <div className="flex flex-col gap-1">
          {eventName && (
            <p className="text-white/50 text-sm font-medium tracking-wide drop-shadow">{eventName}</p>
          )}
          {paused && (
            <span className="text-white/40 text-xs tracking-widest uppercase">Pausado</span>
          )}
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          {newCount > 0 && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {newCount} nuevo{newCount !== 1 ? "s" : ""}
            </motion.div>
          )}
          {/* Play / Pause toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePause() }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
            title={paused ? "Reanudar (Space)" : "Pausar (Space)"}
            aria-label={paused ? "Reanudar" : "Pausar"}
          >
            {paused ? (
              /* Play icon */
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            ) : (
              /* Pause icon */
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
            title={isFullscreen ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
          >
            {isFullscreen ? (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M9 15H4.5M9 15v4.5M15 15v4.5M15 15h4.5" />
              </svg>
            ) : (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Slide counter (bottom-right) ── */}
      <div className="absolute bottom-4 right-5 text-white/30 text-xs tabular-nums font-mono pointer-events-none">
        {index + 1} / {slides.length}
      </div>

      {/* ── QR (bottom-left, auto-hides) ── */}
      <AnimatePresence>
        {showQR && uploadUrl && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-5 left-5 flex items-end gap-3 pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-sm p-2.5 rounded-xl shadow-2xl shadow-black/40">
              <QRCodeSVG value={uploadUrl} size={104} />
            </div>
            <p className="text-white/50 text-xs mb-1 leading-tight max-w-[120px]">
              Comparte tus momentos
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
