# Code Index — Public Frontend (cafetton-casero)

> One-read saves 5,000+ tokens of file searching. Read this before exploring source.
> Last updated: 2026-02-23

---

## Pages (`src/pages/`) — Astro routes

| Route URL | File | Notes |
|-----------|------|-------|
| `/e/[identifier]` | `src/pages/e/[identifier]/index.astro` | Main event page (dynamic, engine-driven) |
| `/e/[identifier]/momentos` | `src/pages/e/[identifier]/momentos.astro` | Standalone moments/wall page |
| `/rsvp/[identifier]` | `src/pages/rsvp/[identifier].astro` | RSVP landing page |
| `/events/upload` | `src/pages/events/upload.astro` | Generic upload shell for legacy/query URLs |
| `/events/[identifier]/upload` | `src/pages/events/[identifier]/upload.astro` | Upload page with OG meta — `prerender: false` (SSR for OG tags) |
| `/evento` | `src/pages/evento.astro` | Demo/template event page |
| `/graduacion-izapa` | `src/pages/graduacion-izapa.astro` | Hardcoded graduation event page |
| `/AndresIvanna/Confirmacion` | `src/pages/AndresIvanna/Confirmacion.astro` | Hardcoded wedding RSVP page |

**Cloudflare routing:** dynamic public routes are served by Astro SSR through the Cloudflare Pages worker. `public/_redirects` intentionally has no `/events/*/upload` rewrite; the friendly upload URL is handled by `src/pages/events/[identifier]/upload.astro`.

---

## Engine (`src/components/engine/`) — core rendering

| File | Purpose |
|------|---------|
| `registry.ts` | Maps section type strings → `{ loader, hydration }`. Add new sections here. |
| `types.ts` | All TypeScript interfaces: `SectionComponentProps`, per-section configs, `PageSpec`, `SectionSpec`, `PageMeta` |
| `EventPage.tsx` | Top-level orchestrator: fetches `PageSpec` from backend, renders all sections |
| `SectionRenderer.tsx` | Renders one section from registry; applies correct Astro `client:` directive |
| `SectionErrorBoundary.tsx` | Class component error boundary per section; logs in dev, renders `null` on error |

### Section Registry (current entries)

| Section type string | Component | Hydration |
|--------------------|-----------|-----------|
| `CountdownHeader` | `sections/CountdownHeader.tsx` | `immediate` |
| `GraduationHero` | `sections/GraduationHero.tsx` | `immediate` |
| `RSVPConfirmation` | `sections/RSVPConfirmation.tsx` | `immediate` |
| `EventVenue` | `sections/EventVenue.tsx` | `visible` |
| `Reception` | `sections/Reception.tsx` | `visible` |
| `GraduatesList` | `sections/GraduatesList.tsx` | `visible` |
| `PhotoGrid` | `sections/PhotoGrid.tsx` | `visible` |
| `Agenda` | `sections/AgendaSection.tsx` | `visible` |
| `MomentWall` | `sections/MomentWall.tsx` | `visible` |

**Hydration rules:**
- `immediate` → `client:only="react"` — above-fold, interactive immediately
- `visible` → `client:visible` — below-fold, hydrates when entering viewport

---

## Sections (`src/components/sections/`) — feature components

| File | Purpose | Config type |
|------|---------|-------------|
| `CountdownHeader.tsx` | Live countdown + event heading | `CountdownHeaderConfig` |
| `GraduationHero.tsx` | Hero banner for graduation events | `GraduationHeroConfig` |
| `RSVPConfirmation.tsx` | RSVP form + confirmation screen | `RSVPConfirmationConfig` (empty) |
| `AgendaSection.tsx` | Event schedule/timeline | `AgendaConfig` |
| `EventVenue.tsx` | Venue info + Google Maps embed | `EventVenueConfig` |
| `Reception.tsx` | Reception venue + map | `ReceptionConfig` |
| `GraduatesList.tsx` | Fetches attendees from API: `GET /api/events/section/:id/attendees` | `GraduatesListConfig` |
| `PhotoGrid.tsx` | Photo gallery grid | `PhotoGridConfig` (empty) |
| `MomentWall.tsx` | Guest photo/video wall with upload | `MomentWallConfig` |

**Every section receives these standard props** (`SectionComponentProps`):
```typescript
sectionId: string     // UUID — used as the section's backend ID
config: Record<string, unknown>  // Narrowed to the specific config type internally
EVENTS_URL: string    // Backend API base URL
```

---

## Root Components (`src/components/`)

| File | Purpose |
|------|---------|
| `SharedUploadPage.tsx` | Standalone upload page — multi-file (max 10), images + videos, quota check, progress tracking. Reads identifier from `window.location.pathname`. |
| `CountdownTimer.tsx` | Days/hours/minutes/seconds countdown display |
| `ImageWithLoader.tsx` | `<img>` with skeleton placeholder + lazy loading |
| `InvitationDataLoader.tsx` | Fetches invitation data by token, passes to child |
| `MusicWidget.tsx` | Floating music player widget (autoplay with user gesture) |
| `ResourcesBySectionSingle.tsx` | Fetches S3 resources for a single section; caches in `sessionStorage` using presigned URL TTL |
| `RSVPConfirmationCard.tsx` | Visual RSVP confirmation card (confirmed/declined states) |
| `ShareWidget.tsx` | Native share / clipboard copy widget |

**`SharedUploadPage.tsx` constants:**
- Max files: 10
- Max image: 25 MB
- Max video: 200 MB
- Reads identifier: `window.location.pathname.match(/\/events\/([^/]+)\/upload/)`

---

## Common (`src/components/common/`)

| File | Purpose |
|------|---------|
| `Footer.tsx` | Site footer |
| `Toast.tsx` | Toast notification component (wraps Sonner) |

---

## Moments (`src/components/moments/`)

| File | Purpose |
|------|---------|
| `MomentsGallery.tsx` | Full-page gallery shell: live data, paginated photo grid and video highlights |
| `MomentsGalleryLightbox.tsx` | Interaction-only async photo/video viewer with focus trap, keyboard/swipe navigation and media recovery |
| `themes/index.ts` | Gallery theme definitions |

---

## Hooks

| File | Purpose |
|------|---------|
| `src/components/hooks/useImageOrientation.tsx` | Detects landscape/portrait for image layout |
| `src/hooks/useToast.ts` | Toast helper hook |

---

## Lib (`src/lib/`)

| File | Purpose |
|------|---------|
| `utils.ts` | `cn(...classes)` — `clsx` + `tailwind-merge` |
| `og.ts` | `buildOgImageUrl(params)` — constructs OG image URL via dashboard `/api/og`; `fetchEventOgData(url, identifier)` |

---

## Utils (`src/utils/`)

| File | Purpose |
|------|---------|
| `getDateInTimeZone.tsx` | Converts a UTC date string to a given IANA timezone |

---

## Layouts (`src/layouts/`)

| File | Purpose |
|------|---------|
| `template.astro` | Base layout: HTML shell, fonts, OG meta tags, global CSS |

---

## Tests (`tests/`) — Playwright E2E

| File | Covers |
|------|--------|
| `graduation-page.spec.ts` | `/graduacion-izapa` — 22 tests (load, sections, attendees, gallery) |
| `wedding-rsvp.spec.ts` | `/AndresIvanna/Confirmacion` — 23 tests (RSVP confirm/decline/cancel) |
| `moments-wall.spec.ts` | MomentWall section — upload, pagination, lightbox |
| `event-access.spec.ts` | Access control: date gates, password gate, view tracking |
| `helpers/mocks.ts` | `mockGraduationResources`, `mockWeddingResources`, `installApiGuard`, `API_BASE` |
| `helpers/storage.ts` | `installStorageClearScript` — race-free `sessionStorage` clear via `addInitScript` |
| `fixtures/api-data.ts` | `SECTION_IDS`, `TEST_TOKENS`, presigned URL factory, `makeSectionResponse` |

**Section UUIDs** (from `fixtures/api-data.ts`):
```typescript
graduation: {
  s1: '76a8d7d9-...'  // GraduationHero
  s2: '78acb1bb-...'  // EventVenue (church)
  s3: 'dc87ac12-...'  // Reception (hotel)
  s4: 'af03cf82-...'  // GraduatesList + banner
  s5: '61202ab3-...'  // PhotoGrid
}
wedding: {
  s1: '8c1600fd-...'  // RSVPConfirmation
}
```

**Test commands:**
```bash
npm run test:e2e              # headless, mobile + desktop
npm run test:e2e:headed       # with browser visible
npm run test:e2e:ui           # Playwright interactive UI
npx playwright test --grep "test name"
npx playwright test tests/graduation-page.spec.ts
```

---

## Config Files

| File | Purpose |
|------|---------|
| `astro.config.mjs` | `output: 'server'`; Cloudflare SSR adapter; React integration; Tailwind |
| `tailwind.config.cjs` | Tailwind v3.4 config (uses `.cjs`, not `.ts`) |
| `playwright.config.ts` | E2E config; `webServer` auto-starts dev server |
| `tsconfig.json` | TypeScript config |
| `public/_redirects` | Static fallback redirects only; SSR routes should not be rewritten |

---

## Environment Variables

| Variable | Used in | Purpose |
|----------|---------|---------|
| `PUBLIC_EVENTS_URL` | Astro pages, React components | Backend API base URL |
| `PUBLIC_DASHBOARD_URL` | `src/lib/og.ts` | Dashboard URL for OG image generation |

Accessed in Astro: `import.meta.env.PUBLIC_EVENTS_URL`
Passed to React islands as props (never accessed directly in client components).

---

## Adding a New Section (quick reference)

1. Create `src/components/sections/YourSection.tsx`
2. Add config type to `src/components/engine/types.ts`
3. Register in `src/components/engine/registry.ts`:
   ```typescript
   YourSection: {
     loader: () => import('../sections/YourSection'),
     hydration: 'visible',  // or 'immediate'
   }
   ```
4. If the section needs a public URL, add an Astro route or reuse an existing helper; avoid `_redirects` for SSR routes
5. Add UUID to `tests/fixtures/api-data.ts` if the section has test coverage
