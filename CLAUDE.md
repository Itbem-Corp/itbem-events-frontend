# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cafetton Casero is a static Astro 5 site deployed on Cloudflare Pages. It serves as the public-facing guest event experience: attendees land on a personalized event page to view sections such as countdown timers, RSVPs, and a photo/video wall (MomentWall). The site uses React islands architecture — Astro renders the outer shell statically, while interactive components hydrate on the client. Core dependencies include Framer Motion for animations, Tailwind CSS for styling, Lucide React for icons, and Sonner for toast notifications.

## Development Commands

```bash
# Install dependencies
npm install

# Start local dev server (http://localhost:4321)
npm run dev

# Build for production (output: static)
npm run build

# Preview the production build locally
npm run preview

# Run Playwright E2E tests
npm run test:e2e
```

## Architecture

### Component Types

| Type | Location | Description |
|------|----------|-------------|
| Astro pages | `src/pages/` | Static page shells; import and render React islands |
| Section components | `src/components/sections/` | Individual event page sections (RSVPConfirmation, CountdownHeader, MomentWall, etc.) |
| Engine components | `src/components/engine/` | Core rendering infrastructure (EventPage, SectionRenderer, registry, types) |
| Standalone pages | `src/components/SharedUploadPage.tsx` | Self-contained React component for the QR upload flow |

### Section System

All event pages are driven by a **section registry** pattern:

1. Each section is a React component registered in `src/components/engine/registry.ts`.
2. The registry entry defines a `loader` (dynamic import) and a `hydration` strategy.
3. `SectionRenderer` reads the registry and renders each section with the appropriate Astro `client:` directive.
4. `EventPage` orchestrates the full page layout, iterating over a list of section configs fetched from the backend.

Every section component receives the following standard props:

```typescript
{
  sectionId: string;    // Unique ID for this section instance
  config: SectionConfig; // Section-specific configuration from the backend
  EVENTS_URL: string;  // Backend API base URL
}
```

### Hydration Strategy

Two hydration modes are supported (defined per section in `registry.ts`):

- `'immediate'` — Uses `client:only="react"`. Hydrates as soon as the page loads. Use for above-the-fold interactive sections (e.g., CountdownHeader, RSVPConfirmation).
- `'visible'` — Uses `client:visible`. Hydrates when the section enters the viewport. Use for below-the-fold sections (e.g., MomentWall) to reduce initial JS load.

### Output Mode

The site uses `output: 'static'` in `astro.config.mjs`. There is no server-side rendering. All dynamic content (event data, moments, RSVP state) is fetched client-side from the Go backend.

## Adding a New Section

1. **Create the component** in `src/components/sections/YourSection.tsx`:
   ```tsx
   interface YourSectionConfig {
     // Define your config shape here
   }

   interface Props {
     sectionId: string;
     config: YourSectionConfig;
     EVENTS_URL: string;
   }

   export default function YourSection({ sectionId, config, EVENTS_URL }: Props) {
     // Fetch data using EVENTS_URL, render UI
   }
   ```

2. **Add the config type** in `src/components/engine/types.ts`:
   ```typescript
   export interface YourSectionConfig {
     // mirror the fields from step 1
   }
   ```

3. **Register the section** in `src/components/engine/registry.ts`:
   ```typescript
   your_section: {
     loader: () => import('../sections/YourSection'),
     hydration: 'visible', // or 'immediate'
   },
   ```

4. The section will now render automatically whenever the backend returns a section config with `type: 'your_section'`.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/components/engine/registry.ts` | Maps section type strings to dynamic imports and hydration modes |
| `src/components/engine/types.ts` | TypeScript interfaces for all section config shapes |
| `src/components/engine/SectionRenderer.tsx` | Renders a single section using the registry |
| `src/components/engine/EventPage.tsx` | Top-level event page orchestrator; fetches section list and renders them |
| `src/components/sections/MomentWall.tsx` | Photo/video wall with pagination, lightbox, upload counter, and 429 handling |
| `src/components/sections/CountdownHeader.tsx` | Live countdown to event date |
| `src/components/sections/RSVPConfirmation.tsx` | Guest RSVP form and confirmation screen |
| `src/components/SharedUploadPage.tsx` | Standalone upload page (QR code scan flow); reads identifier from URL path |
| `src/pages/events/upload.astro` | Astro shell for the upload page, served at `/events/upload` |
| `public/_redirects` | Cloudflare Pages rewrite rules |
| `playwright.config.ts` | E2E test configuration |
| `tests/` | Playwright E2E test files |

## API Integration

The backend URL is provided via the `PUBLIC_EVENTS_URL` environment variable.

```bash
# .env (local development)
PUBLIC_EVENTS_URL=http://localhost:8080
```

In Astro pages, pass it down to React components:
```astro
---
const EVENTS_URL = import.meta.env.PUBLIC_EVENTS_URL;
---
<EventPage EVENTS_URL={EVENTS_URL} ... />
```

### MomentWall API Contract

The `/moments` endpoint returns a paginated response:
```typescript
{
  items: Moment[];
  total: number;
  has_more: boolean;
  uploads_remaining: number;
}
```

- `uploads_remaining`: used to display the upload counter to guests.
- 429 responses indicate the upload limit has been reached and are handled with a dedicated "limit reached" UI state.

### SharedUploadPage API Contract

The upload page performs two requests:
1. **Quota check** (`GET /events/{identifier}/upload-quota`) — fetches per-IP limit status before showing the upload form.
2. **File upload** (`POST /events/{identifier}/moments`) — multipart form upload with progress tracking.

The `identifier` is read directly from `window.location.pathname` (the component does not accept it as a prop).

## Important Notes

### Cloudflare Pages Routing

`public/_redirects` contains:
```
/events/*/upload /events/upload 200
```

This is a **rewrite** (status 200, not a redirect). Any URL matching `/events/{anything}/upload` is served by the single `/events/upload` Astro page. The actual event identifier is extracted at runtime from `window.location.pathname` inside `SharedUploadPage.tsx`.

Do not add new Astro pages under `/events/*/` for paths that follow this pattern — add rewrite rules to `_redirects` instead and read the path parameters client-side.

### Static Output Limitations

- No server-side rendering. Avoid Astro SSR APIs (`Astro.request`, server endpoints, middleware) — they will not work with `output: 'static'`.
- Environment variables prefixed with `PUBLIC_` are inlined at build time. Secret values must never use the `PUBLIC_` prefix.
- All routing after the initial page load is handled by the Cloudflare Pages `_redirects` file and client-side JavaScript.

### Adding Environment Variables

1. Add the variable to your local `.env` file with the `PUBLIC_` prefix.
2. Add it to the Cloudflare Pages project environment settings.
3. Access it in Astro files via `import.meta.env.PUBLIC_YOUR_VAR` and pass it as a prop to React components that need it.
