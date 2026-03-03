# Video Pinterest Masonry + Autoplay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the horizontal video carousel with a Pinterest-style masonry grid where videos autoplay muted inline and clicking toggles audio.

**Architecture:** Rewrite `VideoCard` to use `<video autoPlay muted loop playsInline>` with an `IntersectionObserver` that starts/stops playback based on viewport visibility. `VideoHighlights` switches from horizontal flex-scroll to CSS `columns-2 sm:columns-3` masonry. Clicking a card toggles `video.muted`. The video lightbox is removed — videos are watched inline.

**Tech Stack:** React 18, Framer Motion, Tailwind CSS, TypeScript, IntersectionObserver API

**Single file changed:** `src/components/moments/MomentsGallery.tsx`

---

## Task 1: Rewrite `VideoCard` — inline video with IntersectionObserver + mute toggle

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

Find `function VideoCard(...)` and **replace the entire function** with:

```typescript
// ── VideoCard ─────────────────────────────────────────────────────────────────
// Pinterest-style inline video card.
// • Autoplays muted when ≥30% visible in viewport (IntersectionObserver).
// • Pauses automatically when scrolled out of view.
// • Click toggles mute so the user can hear audio without leaving the grid.

function VideoCard({
  moment,
  EVENTS_URL,
}: {
  moment: Moment
  EVENTS_URL: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [muted, setMuted] = useState(true)

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

  const handleClick = () => {
    const video = videoRef.current
    if (!video) return
    const next = !muted
    video.muted = next
    setMuted(next)
    // If autoplay was blocked by the browser, start on first tap
    if (video.paused) {
      video.play().catch(() => {})
    }
  }

  return (
    <div
      ref={containerRef}
      className="break-inside-avoid mb-3 relative rounded-xl overflow-hidden bg-zinc-900 cursor-pointer group"
      onClick={handleClick}
    >
      <video
        ref={videoRef}
        src={url}
        muted
        loop
        playsInline
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-auto block"
        style={{ minHeight: '140px' }}
      />

      {/* Mute/unmute indicator — always faintly visible, full on hover */}
      <div className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm opacity-60 group-hover:opacity-100 transition-opacity duration-200">
        {muted ? (
          // Speaker crossed (muted) — tap to hear
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
          </svg>
        ) : (
          // Speaker with waves (unmuted) — tap to mute
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zm4.28 1.16a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06zm-1.72 3.53a.75.75 0 011.06 0 5.25 5.25 0 010 7.424.75.75 0 11-1.06-1.06 3.75 3.75 0 000-5.304.75.75 0 010-1.06z" />
          </svg>
        )}
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
```

**TypeScript check:**
```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```
Only pre-existing `astro.config.mjs` errors acceptable. Zero new errors.

**Commit:**
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): VideoCard inline autoplay muted + mute toggle on click"
```

---

## Task 2: Rewrite `VideoHighlights` — Pinterest masonry, remove `onOpen`

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

Find `function VideoHighlights(...)` and **replace the entire function** with:

```typescript
// ── VideoHighlights ──────────────────────────────────────────────────────────
// Pinterest-style masonry grid of inline-playing videos.
// onOpen removed — videos are watched directly in the grid.

function VideoHighlights({
  videoMoments,
  processingVideoCount,
  EVENTS_URL,
  theme,
}: {
  videoMoments: Moment[]
  processingVideoCount: number
  EVENTS_URL: string
  theme: ReturnType<typeof getTheme>
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
        {videoMoments.map((moment) => (
          <VideoCard
            key={moment.id}
            moment={moment}
            EVENTS_URL={EVENTS_URL}
          />
        ))}
        {Array.from({ length: processingVideoCount }).map((_, i) => (
          <ProcessingVideoCard key={`proc-video-${i}`} index={i} />
        ))}
      </div>
    </div>
  )
}
```

**TypeScript check:**
```bash
npx tsc --noEmit
```

**Commit:**
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): VideoHighlights pinterest masonry replacing horizontal carousel"
```

---

## Task 3: Update `ProcessingVideoCard` for masonry layout

The processing stub card needs `break-inside-avoid mb-3` to work in the CSS columns masonry (same pattern as `VideoCard`).

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

Find `function ProcessingVideoCard({ index }: { index: number })` and **replace the entire function** with:

```typescript
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
```

Note: Changed `aspectRatio: '16/9'` → `'9/16'` (portrait) so processing stubs look like portrait videos which is the most common upload format on mobile. Adjust if preferred.

**TypeScript check:**
```bash
npx tsc --noEmit
```

**Commit:**
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): ProcessingVideoCard masonry-compatible with portrait aspect"
```

---

## Task 4: Clean up MomentsGallery — remove video lightbox + dead imports

Since `VideoCard` no longer triggers a lightbox, remove the related state and JSX from `MomentsGallery`.

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

### Step A: Remove `useVideoThumbnail` import

Find at the top of the file:
```typescript
import { useVideoThumbnail } from '../../hooks/useVideoThumbnail'
```
**Delete this line.** (The new `VideoCard` doesn't extract thumbnails — it shows the actual video.)

### Step B: Remove `videoLightboxIndex` state

Find in `MomentsGallery`:
```typescript
const [videoLightboxIndex, setVideoLightboxIndex] = useState<number | null>(null)
```
**Delete this line.**

### Step C: Remove `onOpen` from `VideoHighlights` call site

Find:
```tsx
<VideoHighlights
  videoMoments={videoMoments}
  processingVideoCount={pendingVideoCount}
  EVENTS_URL={EVENTS_URL}
  theme={theme}
  onOpen={(i) => setVideoLightboxIndex(i)}
/>
```

Replace with:
```tsx
<VideoHighlights
  videoMoments={videoMoments}
  processingVideoCount={pendingVideoCount}
  EVENTS_URL={EVENTS_URL}
  theme={theme}
/>
```

### Step D: Remove the video `GalleryLightbox` block

Find and **delete** this entire `AnimatePresence` block (the one for videos, not photos):
```tsx
<AnimatePresence>
  {videoLightboxIndex !== null && (
    <GalleryLightbox
      moments={videoMoments}
      index={videoLightboxIndex}
      EVENTS_URL={EVENTS_URL}
      theme={theme}
      onClose={() => setVideoLightboxIndex(null)}
      onNext={() => setVideoLightboxIndex(i => i !== null ? Math.min(i + 1, videoMoments.length - 1) : null)}
      onPrev={() => setVideoLightboxIndex(i => i !== null ? Math.max(i - 1, 0) : null)}
    />
  )}
</AnimatePresence>
```

### Step E: TypeScript check
```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```
Zero new errors. If `useVideoThumbnail` still referenced somewhere in the file, find and remove those usages too.

### Step F: Commit
```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "refactor(gallery): remove video lightbox + dead useVideoThumbnail import"
```

---

## Task 5: Final verification — unit tests + Astro build

**Step 1: Unit tests**
```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npm run test:unit
```
Expected: all 62 tests pass. (No new tests for this feature — React component with DOM APIs, not testable in node vitest environment.)

**Step 2: Astro production build**
```bash
npm run build
```
Expected: build succeeds, no errors.

**Step 3: Commit docs (plan files) if build passes**
```bash
git add docs/plans/2026-03-03-video-pinterest-autoplay.md
git commit -m "docs: add video pinterest autoplay implementation plan"
```

---

## Acceptance Checklist

- [ ] Videos display in 2-column masonry on mobile, 3-column on desktop
- [ ] Each video autoplays muted when scrolled into view (≥30% visible)
- [ ] Each video pauses when scrolled out of view
- [ ] Clicking a video card toggles mute on/off
- [ ] Mute/unmute icon always faintly visible (opacity-60), full on hover
- [ ] No video lightbox (removed)
- [ ] Processing stubs display correctly in masonry with `break-inside-avoid`
- [ ] `npx tsc --noEmit` — zero new TypeScript errors
- [ ] `npm run build` — Astro build succeeds
- [ ] `npm run test:unit` — 62/62 pass

---

## What Was Deleted

- `useVideoThumbnail` import from `MomentsGallery.tsx`
- `videoLightboxIndex` useState
- `onOpen` prop on `VideoHighlights`
- Video `GalleryLightbox` `AnimatePresence` block
- Horizontal flex-scroll carousel in `VideoHighlights`
- Thumbnail-based `VideoCard` (replaced with inline video element)
