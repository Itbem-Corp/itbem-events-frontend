# Moments Wall Visual Polish — Design Document

**Date:** 2026-03-03
**File:** `src/components/moments/MomentsGallery.tsx`, `src/components/moments/themes/index.ts`, `src/styles/global.css`
**Route:** `/e/[identifier]/momentos`
**Goal:** Apply the existing theme system to the live hero, add aurora blob animations, and make the lightbox expand from the tapped card position.

---

## Problem Statement

Three visual improvements:
1. `theme.heroBg` was defined in the theme system but never applied to the main gallery flow — the hero always renders on `bg-white`.
2. No ambient animated background in the hero — the page feels static.
3. The lightbox opens with a generic center-scale animation instead of expanding from where the user tapped.

---

## Design

### 1. HeroHeader — Theme Gradient + Aurora Blobs

**New field in `MomentsTheme`:** `heroLightBg` (always light, safe for dark `text-gray-900` text). `heroBg` is preserved for the coming-soon screen (graduation uses dark navy).

Apply `theme.heroLightBg` to the `HeroHeader` container.

Add **2 blob divs** inside HeroHeader:
- Absolutely positioned, `pointer-events-none aria-hidden`
- `filter: blur(80px)`, `opacity: 0.4 / 0.35`
- Colors from new theme fields `blobColor1` / `blobColor2`
- Pure CSS `@keyframes blob-float-1` / `blob-float-2` (20s / 25s, ease-in-out infinite)
- Only `transform` animated → GPU compositor layer, zero layout thrashing
- `will-change: transform` to hoist to own compositing layer
- Sizes: `280×280` and `320×320` (rem, not px, so they scale with root font)

Add bottom-fade overlay at end of hero: `h-16 bg-gradient-to-b from-transparent to-white` so the colored hero blends into the white grid.

**Performance budget:** 2 blobs × 1 animation each = 2 compositor animations. Chrome DevTools verified this pattern causes zero main-thread work.

### 2. Lightbox — Expand From Card

**Click origin tracking:**
When a `PhotoCard` is clicked, capture the card's bounding rect and determine which quadrant it's in:
- `originX = card center < 50vw ? 0 : 100` (% of element)
- `originY = card center < 50vh ? 0 : 100` (% of element)

Store in `lightboxOrigin: { x: number; y: number } | null` state in `MomentsGallery`. Reset to `null` on close.

**In `GalleryLightbox`:**
The outer overlay `motion.div` keeps its simple `opacity` fade (backdrop needs to cover instantly).
The inner `motion.div key={moment.id}` gets `transformOrigin` and updated animation:

```
initial: { scale: 0.6, opacity: 0 }
animate: { scale: 1, opacity: 1 }
exit:    { scale: 0.6, opacity: 0 }
transition: { type: 'spring', damping: 28, stiffness: 350 }
style: { transformOrigin: `${origin?.x ?? 50}% ${origin?.y ?? 50}%` }
```

`scale: 0.6` (not 0) means the image starts visibly small and grows — avoids the flash of extremely-tiny element while still feeling like it "comes from the card area".

Navigation between photos in the lightbox keeps the current spring scale animation — not a shared-element transition (intentional, avoids the layout-conflict issues of `layoutId` with `object-cover` → `object-contain` aspect ratio changes).

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/moments/themes/index.ts` | Add `heroLightBg`, `blobColor1`, `blobColor2` to interface + all themes |
| `src/components/moments/MomentsGallery.tsx` | HeroHeader blobs, lightboxOrigin state, lightbox transform-origin |
| `src/styles/global.css` | Add `@keyframes blob-float-1`, `blob-float-2`, `.animate-blob-1`, `.animate-blob-2` |

---

## Performance Constraints

- No new JS imports, no new npm packages
- Blobs: pure CSS keyframes, GPU-only (transform + opacity)
- Lightbox: existing Framer Motion spring, just updated params
- No scroll-driven animations (too expensive for 500-photo walls)
- `will-change: transform` scoped only to blob elements
