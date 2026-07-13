# MomentsGallery Redesign — Design Document

**Date:** 2026-03-03
**File:** `src/components/moments/MomentsGallery.tsx`
**Route:** `/e/[identifier]/momentos`
**Goal:** Fix card overlap bug on mobile + modernize UX/UI to Instagram-like aesthetic

---

## Problem Statement

Two issues reported:
1. **Bug:** Cards overlap vertically on mobile in the masonry layout.
2. **UX:** The gallery needs a more modern, app-native feel.

### Root Cause of Bug

The CSS `columns-2 sm:columns-3` layout depends on the browser knowing each card's rendered height before column-breaking. The `useLazyImage` hook defers image loading — cards start with only `minHeight: 160px` and expand when the image loads, causing the browser to reflow and misplace subsequent cards. On mobile this manifests as cards overlapping.

---

## Design Decision

**Approach: Instagram Grid** — CSS `grid grid-cols-3 gap-0.5` with `aspect-square` cells.

Rationale:
- Grid CSS cells never overlap by definition — eliminates the bug permanently.
- `aspect-square` reserves the exact space before image loads — zero reflow.
- Aligns with the requested "App Nativa / Instagram-like" aesthetic.
- Removes `useLazyImage` custom hook (~60 lines) in favor of native `loading="lazy"`.

---

## Component Architecture

No new files needed. All changes are within `MomentsGallery.tsx`.

---

## Section-by-Section Design

### 1. Photo Grid — Instagram Grid

**Old:** `div.columns-2.sm:columns-3.gap-3.sm:gap-4` with `motion.div.break-inside-avoid.mb-3`

**New:**
```
div.grid.grid-cols-3.gap-0.5
  └─ div[col-span-1 row-span-1 | col-span-2 row-span-2]  ← per card
       └─ div.aspect-square.overflow-hidden.bg-gray-100   ← reserved space
            ├─ shimmer (absolute, shown while !loaded)
            └─ img.w-full.h-full.object-cover             ← fills cell
```

**Featured card logic:**
- Every `(index + 1) % 10 === 0` → `col-span-2 row-span-2`
- Grid uses `grid-flow: row dense` so adjacent cells auto-fill the gap
- For featured cards, the container does NOT use `aspect-square` (the 2×2 grid area defines its size)

**Hover state (desktop):**
- `group` on the outer div
- Overlay: `absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200`
- Description (if present): `absolute bottom-0 inset-x-0 px-2 pb-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200`

**Image loading:**
- Replace `useLazyImage` hook with native `loading="lazy"` on `<img>`
- First 6 images: `loading="eager" fetchPriority="high"`
- `opacity-0` → `opacity-100` transition on `onLoad` via local `loaded` state per card

**Processing stubs (pending moments):**
- Same grid placement, `aspect-square bg-gray-100 animate-pulse` with spinner overlay

### 2. Video Highlights — Horizontal Scroll Rail

**Old:** `div.grid.grid-cols-1.sm:grid-cols-2.gap-4`

**New:** Horizontal scroll carousel:
```
div.flex.gap-3.overflow-x-auto.snap-x.snap-mandatory.pb-3.scrollbar-hide.-mx-4.px-4
  └─ div.flex-shrink-0.w-64.sm:w-72.snap-start   ← per VideoCard
       └─ VideoCard (unchanged component)
```

- Peek of next card provides natural scroll affordance
- `scrollbar-hide` utility (already in Tailwind config or add to global.css)
- VideoCard `aspectRatio: 16/9` preserved (unchanged)

### 3. Hero Header — Compact + Stats Pill

**Changes to `HeroHeader`:**
- Padding: `py-10 sm:py-14` (was `py-16 sm:py-24`)
- Add stats pill after the decorative line:
  ```
  pill: "X fotos · Y videos"
  className: "mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full
              bg-black/5 text-xs text-gray-500 font-medium"
  ```
- `photoCount` and `videoCount` props passed from parent (computed from `photoMoments` and `videoMoments` lengths)
- All existing animations and microIcon decorations preserved

### 4. Memory Cards

**Change:** Remove `style={{ transform: \`rotate(${rotation}deg)\` }}` — the tilt effect looks unpolished in a modern grid context.

Everything else unchanged: gradient background, typewriter animation, phrase cycling.

### 5. No Changes

These components remain **identical**:
- `GalleryLightbox` — already excellent, with swipe, keyboard, preload adjacent
- `LightboxVideo` — iOS autoplay fallback working correctly
- `ComingSoonScreen` — unchanged
- `ThemeFooter` — unchanged
- `themes/index.ts` — unchanged
- `HeroHeader` background/typography/animations — structural change only (padding + stats pill)
- All API fetching, pagination, pending-moment polling — unchanged

---

## CSS Additions (global.css)

Add `scrollbar-hide` utility if not already present:
```css
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

---

## What Gets Deleted

- `useLazyImage` hook function (~35 lines)
- `contentVisibility` and `containIntrinsicSize` inline styles on cards
- `break-inside-avoid` classes
- `columns-2/3` wrapper divs
- `motion.div` per-card entry animations (replaced with CSS `opacity` transition — lighter)
- The per-card `mb-3 sm:mb-4` margin (grid `gap` handles spacing)
- `groupedItems` + `MOMENTS_PER_GROUP` grouping logic (still needed for MemoryCards)

---

## Acceptance Criteria

- [ ] No card overlap on mobile (2-column equivalent via 3-col grid)
- [ ] Featured (2×2) card appears every 10 photos without layout issues
- [ ] Video section scrolls horizontally with snap, no layout jump
- [ ] Hero is visually compact with photo/video count
- [ ] Hover overlay visible on desktop
- [ ] All existing lightbox, keyboard nav, swipe, preload behavior preserved
- [ ] TypeScript compiles with zero errors (`npx tsc --noEmit`)
