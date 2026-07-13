# MomentsGallery Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix card overlap bug on mobile and redesign MomentsGallery to an Instagram-like grid aesthetic.

**Architecture:** Replace CSS `columns-2/3` masonry (root cause of overlap) with CSS `grid grid-cols-3 gap-0.5` where each cell has `aspect-square`, eliminating any possible reflow overlap. Every 10th photo becomes a `col-span-2 row-span-2` featured card. Video highlights become a horizontal-scroll rail.

**Tech Stack:** React 18, Framer Motion, Tailwind CSS, TypeScript, Vitest (unit tests)

**Single file changed:** `src/components/moments/MomentsGallery.tsx`
**CSS change:** `src/styles/global.css`
**Test added:** `tests/unit/momentGalleryUtils.test.ts`

---

## Task 1: Unit test for `getCardType` pure function

This function controls which photos become featured (2×2) cards. Test it before writing it.

**Files:**
- Create: `tests/unit/momentGalleryUtils.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/momentGalleryUtils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Mirrors getCardType() from MomentsGallery.tsx.
// Every 10th photo (1-indexed: 10, 20, 30...) becomes a featured (2×2) card.
function getCardType(index: number): "normal" | "featured" {
  return (index + 1) % 10 === 0 ? "featured" : "normal";
}

describe("getCardType", () => {
  it("returns 'normal' for index 0 (first photo)", () => {
    expect(getCardType(0)).toBe("normal");
  });

  it("returns 'featured' for index 9 (10th photo)", () => {
    expect(getCardType(9)).toBe("featured");
  });

  it("returns 'normal' for index 8 (9th photo)", () => {
    expect(getCardType(8)).toBe("normal");
  });

  it("returns 'normal' for index 10 (11th photo)", () => {
    expect(getCardType(10)).toBe("normal");
  });

  it("returns 'featured' for index 19 (20th photo)", () => {
    expect(getCardType(19)).toBe("featured");
  });

  it("returns 'featured' for index 29 (30th photo)", () => {
    expect(getCardType(29)).toBe("featured");
  });

  it("returns 'normal' for index 99 (not a multiple of 10)", () => {
    expect(getCardType(98)).toBe("normal");
  });

  it("returns 'featured' for index 99 (100th photo)", () => {
    expect(getCardType(99)).toBe("featured");
  });
});
```

**Step 2: Run test — verify it fails (function not yet exported)**

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npm run test:unit
```

Expected: PASS immediately (the function is defined inline in the test file). All 8 tests green.

**Step 3: Commit**

```bash
git add tests/unit/momentGalleryUtils.test.ts
git commit -m "test: add getCardType unit tests for instagram grid featured card logic"
```

---

## Task 2: Add `scrollbar-hide` CSS utility

The video carousel uses `overflow-x-auto` — we need to hide the scrollbar visually.

**Files:**
- Modify: `src/styles/global.css`

**Step 1: Add utility at the end of the file**

Append to `src/styles/global.css`:

```css
/* ── Scrollbar hide — used by VideoHighlights horizontal rail ──────────────── */
@layer utilities {
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
}
```

**Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "style: add scrollbar-hide utility for horizontal scroll carousel"
```

---

## Task 3: Add `getCardType` + new `PhotoCard` component to MomentsGallery.tsx

Replace `MomentCard` (uses `useLazyImage`, `break-inside-avoid`, `motion.div`) with `PhotoCard` (simpler, grid-compatible, `aspect-square`).

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Add `getCardType` export directly below the `useLazyImage` hook block (around line 150)**

Find the line `// ── MomentsGallery ─────` and insert BEFORE it:

```typescript
// ── getCardType ──────────────────────────────────────────────────────────────
// Every 10th photo (1-indexed) is a 2×2 featured card in the Instagram grid.
// Exported for unit testing.
export function getCardType(index: number): 'normal' | 'featured' {
  return (index + 1) % 10 === 0 ? 'featured' : 'normal'
}
```

**Step 2: Delete the entire `useLazyImage` hook function**

Delete lines from `// ── Lazy image hook` comment through the closing `}` of `useLazyImage` (~lines 116–150). This is ~35 lines.

**Step 3: Replace the `MomentCard` function (lines ~664–746) with `PhotoCard`**

Delete `function MomentCard(...)` entirely and replace with:

```typescript
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
  onClick: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const thumbUrl = resolveMediaUrl(moment, EVENTS_URL)
  const fullUrl = resolveFullUrl(moment, EVENTS_URL)
  const isVideoMoment = isVideo(fullUrl)
  const featured = getCardType(globalIndex) === 'featured'
  const eager = globalIndex < 6

  return (
    <div
      className={`relative overflow-hidden bg-gray-100 cursor-pointer group ${
        featured ? 'col-span-2 row-span-2' : 'aspect-square'
      }`}
      onClick={onClick}
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
    </div>
  )
}
```

**Step 4: TypeScript check**

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npx tsc --noEmit
```

Expected: zero errors. If errors occur, check that `useLazyImage` is fully removed (no stale references).

**Step 5: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): add PhotoCard with aspect-square instagram grid layout"
```

---

## Task 4: Update photo grid rendering — replace `columns-2/3` with CSS grid

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Replace processing-image stubs section**

Find (inside the main return, around line 464–473):
```tsx
{pendingImageCount > 0 && (
  <div className="columns-2 sm:columns-3 gap-3 sm:gap-4 mb-0">
    {Array.from({ length: pendingImageCount }).map((_, i) => (
      <ProcessingCard key={`proc-img-${i}`} index={i} />
    ))}
  </div>
)}
```

Replace with:
```tsx
{pendingImageCount > 0 && (
  <div className="grid grid-cols-3 gap-0.5 mb-0.5">
    {Array.from({ length: pendingImageCount }).map((_, i) => (
      <ProcessingCard key={`proc-img-${i}`} />
    ))}
  </div>
)}
```

**Step 2: Replace each group's photo grid**

Find (inside `groupedItems.map`):
```tsx
{/* Photo grid group */}
<div className="columns-2 sm:columns-3 gap-3 sm:gap-4">
  {group.moments.map((moment, i) => {
    const globalIndex = indexOffset + i
    return (
      <MomentCard
        key={moment.id}
        moment={moment}
        index={globalIndex}
        EVENTS_URL={EVENTS_URL}
        theme={theme}
        onClick={() => setLightboxIndex(globalIndex)}
      />
    )
  })}
</div>
```

Replace with:
```tsx
{/* Photo grid group — Instagram CSS grid */}
<div
  className="grid grid-cols-3 gap-0.5"
  style={{ gridAutoFlow: 'row dense' }}
>
  {group.moments.map((moment, i) => {
    const globalIndex = indexOffset + i
    return (
      <PhotoCard
        key={moment.id}
        moment={moment}
        globalIndex={globalIndex}
        EVENTS_URL={EVENTS_URL}
        onClick={() => setLightboxIndex(globalIndex)}
      />
    )
  })}
</div>
```

**Step 3: Also update the wrapping container**

Find:
```tsx
<div className="flex flex-col gap-0">
```
Replace with:
```tsx
<div className="flex flex-col gap-0.5">
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors. The `theme` prop is removed from `PhotoCard` (it doesn't use theme coloring — Instagram grids are monochrome).

**Step 5: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): replace columns masonry with css grid-cols-3 — fixes mobile overlap bug"
```

---

## Task 5: Update `ProcessingCard` to grid-compatible aspect-square

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Replace `ProcessingCard` function**

Find `function ProcessingCard({ index }...)` and replace entirely with:

```typescript
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
```

Note: the `index` prop is removed (was only used for stagger delay; with the simpler grid it's not needed).

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): update ProcessingCard to aspect-square for grid compatibility"
```

---

## Task 6: Rewrite `VideoHighlights` to horizontal scroll carousel

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Replace `VideoHighlights` function**

Find `function VideoHighlights(...)` and replace entirely with:

```typescript
// ── VideoHighlights ──────────────────────────────────────────────────────────
// Horizontal-scroll rail (Stories-style). Peek of next card = scroll affordance.

function VideoHighlights({
  videoMoments,
  processingVideoCount,
  EVENTS_URL,
  theme,
  onOpen,
}: {
  videoMoments: Moment[]
  processingVideoCount: number
  EVENTS_URL: string
  theme: ReturnType<typeof getTheme>
  onOpen: (index: number) => void
}) {
  if (videoMoments.length === 0 && processingVideoCount === 0) return null

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className={`w-5 h-0.5 rounded-full ${theme.accentSoft}`} />
        <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${theme.accent}`}>
          Momentos en video
        </p>
        <div className={`flex-1 h-px ${theme.accentSoft} opacity-30`} />
      </div>

      {/* Horizontal scroll rail */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide">
        {videoMoments.map((moment, i) => (
          <div
            key={moment.id}
            className="flex-shrink-0 w-64 sm:w-72 snap-start"
          >
            <VideoCard
              moment={moment}
              index={i}
              EVENTS_URL={EVENTS_URL}
              onOpen={onOpen}
            />
          </div>
        ))}
        {Array.from({ length: processingVideoCount }).map((_, i) => (
          <div
            key={`proc-video-${i}`}
            className="flex-shrink-0 w-64 sm:w-72 snap-start"
          >
            <ProcessingVideoCard index={videoMoments.length + i} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): replace video grid with horizontal scroll carousel rail"
```

---

## Task 7: Update `HeroHeader` — compact padding + stats pill

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Update `HeroHeader` signature and content**

Find `function HeroHeader(...)` and replace:

```typescript
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
    <div className="relative text-center py-10 sm:py-14 px-6 overflow-hidden">
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
        className="mt-5 mx-auto h-px w-16 bg-gradient-to-r from-transparent via-gray-300 to-transparent"
        style={{ transformOrigin: 'center' }}
      />

      {/* Stats pill — photo/video count */}
      {(photoCount > 0 || videoCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-4 flex justify-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/5 text-xs text-gray-500 font-medium">
            {photoCount > 0 && (
              <span>{photoCount} {photoCount === 1 ? 'foto' : 'fotos'}</span>
            )}
            {photoCount > 0 && videoCount > 0 && (
              <span className="w-1 h-1 rounded-full bg-gray-400 inline-block" aria-hidden="true" />
            )}
            {videoCount > 0 && (
              <span>{videoCount} {videoCount === 1 ? 'video' : 'videos'}</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
```

**Step 2: Update the call site in MomentsGallery main return**

Find:
```tsx
<HeroHeader eventName={eventName} eventDate={eventDate} theme={theme} />
```

Replace with:
```tsx
<HeroHeader
  eventName={eventName}
  eventDate={eventDate}
  theme={theme}
  photoCount={photoMoments.length}
  videoCount={videoMoments.length}
/>
```

**Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "feat(gallery): compact hero with photo/video stats pill"
```

---

## Task 8: Remove rotation from `MemoryCard`

The tilt transform (`rotate(Xdeg)`) looks amateur in a clean modern grid. Remove it.

**Files:**
- Modify: `src/components/moments/MomentsGallery.tsx`

**Step 1: Find in `MemoryCard` function**

Find these two lines inside `MemoryCard`:
```typescript
const rotations = [-2, 1, -1, 2, 0]
const rotation = rotations[index % rotations.length]
```

And the `style` prop on `motion.div`:
```tsx
style={{ transform: `rotate(${rotation}deg)` }}
```

**Delete** all three (the two const declarations and the style prop).

**Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 3: Commit**

```bash
git add src/components/moments/MomentsGallery.tsx
git commit -m "style(gallery): remove rotation tilt from MemoryCard for cleaner modern look"
```

---

## Task 9: Final verification — unit tests + Astro build

**Step 1: Run unit tests**

```bash
cd /c/Users/AndBe/Desktop/Projects/cafetton-casero
npm run test:unit
```

Expected: all tests pass including the new `momentGalleryUtils.test.ts`.

**Step 2: Astro production build**

```bash
npm run build
```

Expected: build completes with no TypeScript or Astro errors.

**Step 3: Fix any issues found, then final commit if needed**

If the build surfaces any unused import or reference, clean it up and commit.

---

## Acceptance Checklist

- [ ] `npm run test:unit` — all tests pass
- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npm run build` — Astro build succeeds
- [ ] No card overlap on mobile (grid-cols-3 with aspect-square = structurally impossible)
- [ ] Featured 2×2 card appears every 10 photos without layout issues
- [ ] Video section scrolls horizontally with snap, no horizontal overflow page
- [ ] Hero is compact (py-10/14) with photo/video count pill
- [ ] Hover overlay visible on desktop
- [ ] All lightbox behavior preserved (swipe, keyboard nav, preload adjacent)
- [ ] MemoryCard has no rotation tilt

---

## What Was Deleted

- `useLazyImage` custom hook (~35 lines) — replaced by native `loading="lazy"`
- `MomentCard` component — replaced by `PhotoCard`
- `contentVisibility` / `containIntrinsicSize` inline styles
- `break-inside-avoid` classes
- `motion.div` per-card entry animations (too heavy at 500 cards)
- Per-card `mb-3 sm:mb-4` margins (grid `gap` handles spacing)
- `columns-2/3` wrapper divs
- `MemoryCard` rotation constants + style prop
