# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Ecosystem

This project is part of a three-project system. **Every feature or change must be evaluated for cross-project impact.**

| Project | Stack | Local Path | Purpose |
|---------|-------|-----------|---------|
| **Backend** (Go) | Go + Echo + PostgreSQL + Redis | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | API, business logic, auth (Cognito), S3 uploads, event management |
| **Dashboard** | Next.js 15 + TypeScript | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | Admin UI: manage events, approve moments, analytics, guest lists, QR codes |
| **Public Frontend** (this project) | Astro 5 + React islands | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | Guest-facing: event pages, photo/video wall, RSVP, QR upload flow |

Never implement a feature in isolation. Trace the full data flow: Backend → Dashboard and/or Public Frontend.

---

## Superpowers Plugin

This project uses the **Claude Code Superpowers plugin**. Before any action, check if a relevant skill applies — invoke it via the `Skill` tool **before doing anything else**. Even a 1% chance of relevance means you must invoke it.

| When... | Use skill |
|---------|-----------|
| Starting a new feature, component, or behavior | `superpowers:brainstorming` |
| About to write implementation code | `superpowers:test-driven-development` |
| Debugging a bug, test failure, or unexpected behavior | `superpowers:systematic-debugging` |
| Planning a multi-step task | `superpowers:writing-plans` |
| Executing a written plan | `superpowers:executing-plans` |
| 2+ independent tasks that can run in parallel | `superpowers:dispatching-parallel-agents` |
| About to claim work is done or tests pass | `superpowers:verification-before-completion` |
| Completing a feature branch | `superpowers:finishing-a-development-branch` |
| Received code review feedback | `superpowers:receiving-code-review` |
| Completed a task, want a review | `superpowers:requesting-code-review` |

**Rule:** Skills define HOW to approach tasks. Never skip them to save time — they prevent rework.

---

## Context7 MCP — Library Documentation

**Use Context7 MCP whenever you need docs for any library. Never web-search for library APIs.**

```bash
mcp__context7__resolve-library-id libraryName:"astro"
mcp__context7__get-library-docs libraryId:"/withastro/astro" topic:"islands" tokens:5000
```

Common IDs: Astro 5 `/withastro/astro` · Framer Motion `/framer/motion` · Tailwind `/tailwindlabs/tailwindcss` · React 19 `/facebook/react` · Sonner `/emilkowalski/sonner` · Lucide `/lucide-icons/lucide`

Context7 ≈ 1,000 tokens. Web search ≈ 15,000+ tokens.

---

## Documentation-First Workflow

**Always read `docs/` before exploring source code.**

| Looking for… | Read first |
|--------------|-----------|
| Section component or template pattern | `docs/templates.md` |
| API endpoint, response shape | `docs/api.md` |
| Architecture, island hydration | `docs/architecture.md` |
| Styling, animations, design system | `docs/styling.md` |
| Backend contracts, public endpoints | `docs/backend.md` |
| Cross-project contracts | `docs/frontend-dashboard.md` |
| All files with exact paths + section registry | `docs/CODE_INDEX.md` |
| Coding conventions | `docs/coding-standards.md` |
| Available agents | `docs/agents.md` |
| Sprint state, active tasks | `docs/orchestrator-memory.md` |
| Interrupted session | `docs/session-state.md` |

**After any code change: update the relevant `docs/` file before finishing.**

---

## Definition of Done

A task is **not complete** until ALL of the following pass:

### Every task
- [ ] `npm run build` — production build succeeds (no SSR APIs, static output only)
- [ ] Affected E2E tests pass: `npx playwright test <spec.ts>`
- [ ] Relevant `docs/` file updated

### API integration
- [ ] Backend contract validated (see `docs/backend.md`)
- [ ] 429 rate-limit state handled in UI
- [ ] Loading skeleton and error state present
- [ ] sessionStorage caching applied for S3 resource endpoints

### New section
- [ ] Registered in `src/components/engine/registry.ts`
- [ ] Config type added to `src/components/engine/types.ts`
- [ ] Hydration strategy correct (`immediate` vs `visible`)
- [ ] Cloudflare `_redirects` updated if new URL pattern

### Cross-project feature
- [ ] Backend health-checked before frontend push
- [ ] `/task release-coordinator` run before pushing to `main`

### Session interrupted mid-task
Write current state to `docs/session-state.md`. Check it at session start. Clear when done.

---

## Project Overview

Astro 5 static site (Cloudflare Pages) — guest-facing event experience. React islands architecture: countdown timers, RSVP, MomentWall (photo/video wall). Framer Motion, Tailwind CSS, Sonner toasts, Lucide icons.

## Development Commands

```bash
npm run dev       # http://localhost:4321
npm run build     # static output
npm run preview
npm run test:e2e  # Playwright E2E
```

## Architecture

- **Static only** — `output: 'static'` in `astro.config.mjs`. No SSR, no `Astro.request`, no server middleware.
- **Section registry** — sections registered in `src/components/engine/registry.ts` with `loader` + hydration (`'immediate'` = `client:only="react"`, `'visible'` = `client:visible`).
- **Standard section props:** `{ sectionId: string; config: SectionConfig; EVENTS_URL: string }`
- **New section:** component → `types.ts` → `registry.ts`. See `docs/CODE_INDEX.md` for step-by-step.

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/components/engine/registry.ts` | Maps section types to loaders + hydration modes |
| `src/components/engine/types.ts` | TypeScript interfaces for all section configs |
| `src/components/engine/EventPage.tsx` | Top-level orchestrator; fetches sections, renders them |
| `src/components/sections/MomentWall.tsx` | Photo/video wall with pagination, lightbox, 429 handling |
| `src/components/SharedUploadPage.tsx` | QR upload flow; reads identifier from `window.location.pathname` |
| `public/_redirects` | Cloudflare rewrite rules |

## Critical Gotchas

- **Cloudflare rewrites** — new `/events/*/X` URL patterns need a `_redirects` rule (e.g., `/events/*/upload /events/upload 200`). Extract path params client-side, not server-side.
- **Env vars** — use `PUBLIC_` prefix (`PUBLIC_EVENTS_URL`). Add to `.env` locally AND Cloudflare Pages environment settings. Access via `import.meta.env.PUBLIC_YOUR_VAR`.
- **GitHub MCP** — `owner: "Itbem-Corp"`, `repo: "itbem-events-frontend"`.
- **Deployment** — push to `main` → Cloudflare Pages auto-builds (~2–3 min). Production API: `https://api.eventiapp.com.mx`.
