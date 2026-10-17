# Styling & Design System

## Philosophy

**Mobile-first. Always.** Design for 375px, then scale up. Every component must be usable and beautiful on phone before considering desktop.

UX/UI standards: elegant, emotional, event-focused. Animations should feel organic — never mechanical. Typography drives the aesthetic.

---

## Color Palette

### Brand Colors (hard-coded Tailwind extensions)
```
gold:   #C7A44C   → primary accent, borders, highlights (Tailwind: text-gold, border-gold, bg-gold)
coffee: #8B5D3D   → headings, warm tones (Tailwind: text-coffee)
dark:   #07293A   → body text (definido en template.astro body style, NO en Tailwind)
blue:   #007BC4   → countdown, nombres graduados par (Tailwind: text-[#007BC4])
navy:   #1B1464   → nombres graduados impar (Tailwind: text-[#1B1464])
```

### Semantic CSS Variables (HSL — light/dark modes)
Defined in `src/styles/global.css`. Use via Tailwind utilities:
```
bg-background / text-foreground
bg-card / text-card-foreground
bg-primary / text-primary-foreground
bg-muted / text-muted-foreground
text-gold / border-gold   ← brand accent
text-coffee               ← warm headings
border-border / bg-input / ring-ring
```

Dark mode: toggled via `.dark` class on `<html>`.

---

## Typography

### Font Families (Tailwind classes)
| Class | Font | Use Case |
|---|---|---|
| `font-astralaga` | Astralaga SemiBold | Display headings, hero text, CTAs |
| `font-bigilla` | Bigilla | Decorative event titles |
| `font-aloevera` | Aloevera Regular | Body text, UI labels, paragraphs |
| `font-aloeveraLight` | Aloevera Light | Subtle captions, secondary info |
| `font-quicksand` | Quicksand | Labels, countdown units, utility text |

### Font Loading
Fonts are served from `/public/fonts/` (local). Declared in `src/styles/global.css` with `@font-face`. No external font CDN — zero extra network requests.

### Typography Scale (Event Pages)
```
Display/Hero:     text-4xl–text-5xl  font-astralaga or font-bigilla
Section headings: text-3xl           font-astralaga
Guest name:       text-4xl           font-astralaga
Body / labels:    text-xl–text-2xl   font-aloevera
Caption:          text-sm–text-base  font-quicksand
```

---

## Animations

### CSS Keyframe Animations (global.css)
```css
.animate-breathe        /* scale 1→1.1, opacity 0.3→0.7, 2s infinite — decorative elements */
.animate-breathe-slow   /* scale+rotate 3s infinite — background ornaments */
```

### Framer Motion Patterns

**Patrón universal skeleton ↔ datos** (usado en TODOS los SectionWrappers):
```tsx
<AnimatePresence mode="wait">
  {data ? (
    <motion.section key="loaded"
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.6 }}>
      <Content />
    </motion.section>
  ) : (
    <motion.div key="skeleton"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <Skeleton />
    </motion.div>
  )}
</AnimatePresence>
```

**Entrance estándar** (headers, footer, cards):
```tsx
initial={{ opacity: 0, y: 20 }}   // o y: -20 para header
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.8, ease: "easeOut" }}
```

**Stagger de lista** (Section4 — nombres graduados):
```tsx
<motion.ul initial="hidden" animate="visible"
  variants={{ visible: { transition: { staggerChildren: 0.44 } } }}>
  <motion.li variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
    transition={{ duration: 3 }}>
```

**Stagger de grid de imágenes** (Section5):
```tsx
<motion.div initial="hidden" animate="visible"
  variants={{ visible: { transition: { staggerChildren: 0.1 } } }}>
  <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
    transition={{ duration: 0.4 }}>
```

**Pulso flotante** (MusicWidget cuando reproduce):
```tsx
<motion.div className="absolute inset-0 rounded-full bg-pink-400/30 blur-md"
  initial={{ scale: 1, opacity: 0.4 }} animate={{ scale: 1.5, opacity: 0 }}
  transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }} />
```

### Scroll-triggered Hydration
Use `client:visible` on off-screen sections. Astro hydrates when element enters viewport — pairs naturally with Framer Motion entrance animations.

### Image Loading Transition
`ImageWithLoader` fades images in with `transition-opacity duration-500`. Always use this component instead of raw `<img>` tags when displaying S3 resources.

---

## Layout System

### Max Widths (event pages)
```
max-w-screen-md lg:max-w-[1024px] mx-auto px-4
```
All event page content is centered with horizontal padding. Never full-bleed text.

### Section Spacing
`space-y-20` between sections in event pages. Breathing room is intentional — these are emotional, not informational, UIs.

### Responsive Image Containers (wedding confirmation)
```
w-40 md:w-52 lg:w-60 xl:w-64
```
Images grow progressively on larger screens.

---

## Component Styling Conventions

### Buttons (event pages — not shadcn)
Event-specific buttons bypass shadcn and use direct Tailwind for brand fidelity:
```tsx
// Primary CTA
"bg-gold text-dark text-3xl px-12 py-3 rounded-full font-astralaga disabled:opacity-50"

// Toggle option (selected state)
selected: "bg-gold text-dark"
default:  "bg-white text-dark"

// Shared wrapper
"px-6 py-3 rounded-2xl font-aloevera border-2 border-dashed border-gold"
```

### Borders
Dashed gold borders are the signature style element:
```
border-2 border-dashed border-gold rounded-xl   (cards, info boxes)
border-2 border-dashed border-gold rounded-full  (pill badges, question boxes)
```

### Floating UI (MusicWidget)
```
fixed bottom-5 left-5 z-50
bg-white/70 backdrop-blur-md border border-white/20 rounded-full shadow-xl
```

### Glass morphism pattern
```
bg-white/70 backdrop-blur-md border border-white/20
```
Use for overlays, floating controls, and modals.

---

## UX Principles

1. **States are always visible.** Loading → skeleton/pulse. Error → message. Empty → contextual feedback. Never blank screens.
2. **Confirmations are immediate.** After RSVP, show success message + contextual image. No page reload unless necessary.
3. **Cancellation is accessible.** After confirming, always show a cancel link. No dead ends.
4. **Audio is opt-in.** Music starts on first user interaction (click or scroll), never on page load.
5. **Touch targets ≥ 44px.** Buttons in event pages use `px-6 py-3` minimum.
6. **Smooth scroll.** `html { scroll-behavior: smooth }` is global.

---

## Dark Mode

Toggle via `.dark` class on `<html>`. All semantic CSS variables automatically switch. Brand colors (`gold`, `coffee`, `dark`) are not dark-mode-aware — they're fixed by design for event pages.

`DarkModeToggle.tsx` handles the toggle button.

---

## shadcn/ui Components

Located in `src/components/ui/`. Currently: `button.tsx`, `input.tsx`, `label.tsx`.

Config in `components.json`:
- Style: `new-york`
- Base color: `neutral`
- CSS variables: enabled
- Path aliases: `@/components`, `@/lib/utils`, `@/components/ui`

Use `cn()` from `src/lib/utils.ts` for all conditional class merging:
```ts
import { cn } from "@/lib/utils";
cn("base-class", condition && "conditional-class", className)
```

## Visual base (EV-31): color, motion, modern CSS

Source: `src/styles/visual-base.css` (imported by `global.css`) and `src/lib/visual/*`; components in `src/components/visual/`. Design: motion-system #32.

- **Theme**: `resolveVisualTheme(pageTheme.colors, { eventType })` returns seeds (`--v-seed-base|ink|accent`) from the event palette, or Velada (dark) / Sobremesa (warm) when there is none. Ink is corrected to keep AA (4.5:1). Other colors derive in CSS with `color-mix(in oklch, ...)` inside `@supports`. Wrap content in `<VisualRoot colors eventType>`.
- **Event kinds** (`eventKinds.ts`): boda, quince, cumpleanos, otro define background recipe (`.v-bg`), typography and motion character (`--v-kind-tempo`, `--v-kind-ease`). They never fix colors.
- **Cover**: `<FullBleedCover src focalPoint>` fills the screen with a legibility scrim; no image (or a load error) renders the generated `.v-bg`.
- **Ambient color**: `<AmbientBackdrop dominantColor>` cross-fades two layers by opacity (360 ms).
- **Motion tokens**: `--v-dur-*` and `--v-ease-*`, mirrored in `motion.ts` (a test keeps them identical). Only transform and opacity may animate or transition; filter and clip-path may be set statically but never animated (a unit test fails otherwise). Every animation and transition uses a `--v-ease-*` token, never a literal timing keyword (also tested). The browser budget (no long frames over 50 ms during the scroll/fade run, CLS < 0.1) is checked by `tests/visual-budget.spec.ts` in the Playwright projects `budget-chromium` (4x CPU throttle as mid-range) and `budget-webkit`; each budget has a negative control that must fail it. Run with `npx playwright test --project=budget-chromium --project=budget-webkit` (WebKit needs `npx playwright install webkit`).
- **Techniques**: every entry in `MOTION_TECHNIQUES` has `fallback`, `still` and `reduced` (90 ms fade or cut). The reduced-motion block is last in `visual-base.css`; conserve mode (`html[data-eventi-performance="conserve"]`, set in `template.astro`) removes drift, Ken Burns, 3D and blur.
- **Masonry**: `<Masonry>` uses `display: grid-lanes` when supported, else flex columns assigned shortest-column in arrival order from `intrinsic_width/height`; tiles reserve their aspect ratio.
- **View transitions**: `runViewTransition(el, update)` sets the name on tap and removes it after. **Scroll-driven**: `.v-scroll-in` / `.v-scroll-line` under `@supports (animation-timeline: view())`; `observeScrollReveal()` is the IntersectionObserver fallback.
