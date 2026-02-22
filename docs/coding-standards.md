# Coding Standards

## TypeScript

- **Strict mode** is on. No `any` unless unavoidable — use `unknown` + type narrowing instead.
- Prefer `interface` for component props and data shapes; `type` for unions and aliases.
- Export types alongside their components: `export type { InvitationData }` or `export interface`.
- Never use non-null assertion (`!`) on data from API responses — always null-check.
- Catch blocks: type as `unknown`, not `any`. Use `err instanceof Error ? err.message : String(err)`.

```ts
// Good
interface Props { EVENTS_URL: string; onLoaded: (data: InvitationData) => void }

// Avoid
const data: any = await res.json();
```

---

## React Patterns

### Component structure order
```tsx
// 1. "use client" directive (if needed for Astro)
// 2. Imports
// 3. Interfaces / types
// 4. Default export function
//   a. State declarations
//   b. Refs
//   c. useEffect hooks
//   d. Event handlers
//   e. Derived values
//   f. Return JSX
```

### State management
- Local `useState` + `useEffect` — no global state library needed yet.
- Lift state to the nearest common ancestor (`SectionWrapper` owns all state for its section).
- Headless components (`InvitationDataLoader`, `ResourcesBySectionSingle`) communicate via callbacks (`onLoaded`, `onError`).

### useEffect rules
- Always clean up: return cleanup function for timers, event listeners.
- Declare ALL dependencies in the dependency array.
- Never use `useEffect` to derive state — compute it during render or use `useMemo`.

```tsx
// Good — cleanup
useEffect(() => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}, [dependency]);
```

### Conditional rendering
- Prefer early returns in JSX for clarity over deeply nested ternaries.
- Always handle: loading state, error state, empty state, and data state.

```tsx
if (!invData && !invError) return <SkeletonSection1 />;
if (invError) return <p className="font-aloevera text-red-600">{invError}</p>;
return <MainContent data={invData} />;
```

---

## Astro Conventions

- All interactive React components must have a `client:` directive (`client:only="react"` or `client:visible`).
- Pass server-side env vars as props: `EVENTS_URL={import.meta.env.PUBLIC_EVENTS_URL}`.
- Astro pages are thin orchestrators — no business logic in `.astro` files.
- Use `<TemplateLayout title="...">` for all event pages.
- `export const prerender = false;` required on any API route.

---

## Fetch & API Calls

- Always pass `Authorization: "1"` header (use `getAuthHeaders()` from `src/utils/auth.ts`).
- Check `res.ok` before accessing response data.
- Parse error message from `json.message` before falling back to generic message.
- Never fetch in render — always inside `useEffect`.

```tsx
const res = await fetch(`${EVENTS_URL}api/...`, {
  headers: { Authorization: "1" },
});
if (!res.ok) throw new Error(json.message || "Error de red");
```

---

## Styling (code-level)

- Use `cn()` from `src/lib/utils.ts` for conditional classes — never string interpolation with ternaries for Tailwind.
- Never inline `style={{}}` objects when a Tailwind utility exists.
- Responsive: always write mobile class first, then `md:` / `lg:` / `xl:`.
- Keep className strings clean: sort by: layout → display → spacing → typography → color → interaction → animation.

```tsx
// Good
className={cn(
  "flex flex-col items-center",
  "px-6 py-3 rounded-2xl",
  "font-aloevera text-xl",
  "border-2 border-dashed border-gold",
  isSelected && "bg-gold text-dark"
)}

// Avoid — hard to read and causes Tailwind purge issues
className={`px-6 ${isSelected ? 'bg-gold' : 'bg-white'} py-3`}
```

---

## Animation Standards

- Entrance animations: `initial={{ opacity: 0, y: 20 }}` → `animate={{ opacity: 1, y: 0 }}`.
- Duration: 0.4–0.8s for entrances, 0.2–0.3s for micro-interactions.
- Always use `AnimatePresence` when conditionally mounting/unmounting animated elements.
- Floating/ambient elements: use CSS `animate-breathe` or `animate-breathe-slow` (already defined in global.css).
- Interactive elements (buttons): `hover:scale-105 active:scale-95` via Tailwind.

---

## File & Naming Conventions

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase `.tsx` | `Section1Wrapper.tsx` |
| Astro pages | PascalCase `.astro` | `Confirmacion.astro` |
| Hooks | camelCase `use` prefix | `useImageOrientation.tsx` |
| Utils | camelCase | `getDateInTimeZone.tsx` |
| Types/interfaces | PascalCase | `InvitationData`, `Section` |

---

## Import Aliases

- `@/components/...` → `src/components/`
- `@/lib/...` → `src/lib/`
- Relative paths are fine within the same template family.

---

## Performance Rules

1. **Images**: always use `<ImageWithLoader>` — never raw `<img>` for S3 resources.
2. **Lazy sections**: use `client:visible` for everything below the fold.
3. **No `useEffect` with empty deps for one-time fetches** on components that might re-render — use a `loaded` state guard (see `ResourcesBySectionSingle` pattern).
4. **Font display**: fonts are loaded via `@font-face` in CSS — no `font-display: swap` currently set. Add if FOUT becomes an issue.
5. **Cache first**: check `sessionStorage` before fetching resources (pattern already in `ResourcesBySectionSingle`).

---

## Deuda técnica conocida

| Archivo | Problema | Contexto | Acción |
|---|---|---|---|
| `utils/auth.ts` | `Authorization: "1"` — backend no lo requiere en rutas públicas | **Activo** | Se puede eliminar sin efecto |
| `InvitationDataLoader` | Sin prop `onError` en la interfaz oficial | ✅ Resuelto | `onError?: (message: string) => void` agregado |
| `Section4Wrapper` | `nameList` de 14 graduados hardcodeada en el componente | **Activo** | Mover a API o config externa |
| API endpoint | Frontend llama `byToken` (lowercase b), backend define `ByToken` (Go case-sensitive) | **Activo** | Validar — ver `docs/backend.md` issue #1 |
| `LoginForm.tsx` | Logo placeholder Tailwind CSS + link `/register` inexistente | Admin inactivo | Irrelevante scope actual |
| `AppLayout.tsx` | Sidebar/navbar vacíos, placeholder "Sidebar aquí" | Admin inactivo | Irrelevante scope actual |
| `api/auth/login.ts` | Credenciales hardcoded demo | Admin inactivo | Irrelevante scope actual |
| `BaseLayout.astro` | Título "Catalyst" placeholder | Admin inactivo | Irrelevante scope actual |

## Documentation Updates

Actualiza el `docs/*.md` correspondiente en cada cambio. Ver tabla en `CLAUDE.md`.
