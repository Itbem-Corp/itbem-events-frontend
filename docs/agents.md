# Specialized Agents

This file defines the purpose and workflow for specialized Claude Code agents used in this project. Reference these when starting a session focused on a specific domain.

---

## Subagentes reales (`/task <nombre>`)

Estos están en `.claude/agents/` y se pueden invocar directamente con `/task`:

| Agent | Use when |
|---|---|
| `/task feature-planner` | Antes de empezar cualquier feature — genera plan cross-project para los 3 proyectos |
| `/task agent-improver` | Audita todos los agentes de los 3 proyectos, detecta paths rotos y endpoints stale |
| `/task backend-integrator` | Valida contratos backend: rutas, response shapes, UUIDs de secciones |
| `/task release-coordinator` | Antes de hacer deploy de un feature que toca más de un proyecto |
| `/task orchestrator` | Al inicio de cualquier sesión multi-proyecto — lee memoria, retoma o inicia sprint |

---

## Token Cache Rule

**Read docs/ before source files.** Docs are shorter, more stable, and more likely to be cached.
Never re-read a file already in context — pass content forward to subagents instead.
The orchestrator enforces this on every dispatch: it sends already-read content to subagents rather than instructing them to re-read.

---

## Agent: `template-builder`

**Purpose:** Create a complete new event template from scratch.

**Pre-session reads:**
1. `docs/templates.md` — full template pattern
2. `docs/api.md` — section IDs, resource structure
3. `docs/styling.md` — design system, fonts, animations

**Workflow:**
1. Identify event type (`graduations` / `weddings` / new type)
2. Determine number of sections needed
3. For each section: create `SectionNWrapper.tsx` + `SelectionNImages.tsx` + `SkeletonSectionN.tsx`
4. Create the Astro page under `src/pages/`
5. Register section UUIDs in `docs/api.md`
6. Follow all UX principles from `docs/styling.md` (mobile-first, states, animations)

---

## Agent: `ui-enhancer`

**Purpose:** Improve visual design, add animations, refine UX on existing components.

**Pre-session reads:**
1. `docs/styling.md` — complete design system
2. `docs/coding-standards.md` — animation standards, class conventions

**Workflow:**
1. Read the target component file(s) first
2. Identify: missing states (loading/error/empty), missing animations, non-mobile-first layout
3. Apply Framer Motion entrances where appropriate
4. Ensure touch targets ≥ 44px
5. Verify glassmorphism / dashed gold border consistency
6. Test mental model: phone → tablet → desktop

---

## Agent: `api-integrator`

**Purpose:** Add new API endpoints, modify data fetching, update types.

**Pre-session reads:**
1. `docs/api.md` — all endpoints, response shapes, caching strategy
2. `docs/architecture.md` — data flow diagram

**Workflow:**
1. Define the new endpoint in `docs/api.md` first
2. Add/update TypeScript interfaces
3. Implement in the appropriate component (headless loader pattern if reusable)
4. Add sessionStorage caching if the endpoint returns S3 resources
5. Update `docs/api.md` with actual response shape

---

## Agent: `event-page-creator`

**Purpose:** Create a new event page end-to-end (new event for a client).

**Pre-session reads:**
1. `docs/architecture.md` — island pattern, page structure
2. `docs/templates.md` — which template family to use
3. `docs/api.md` — EVENTS_URL usage, section UUID registration

**Workflow:**
1. Identify: event type, client name, sections needed, section UUIDs
2. Create `src/pages/{ClientName}/` directory
3. Create the Astro page using `<TemplateLayout>`
4. Mount existing template sections with `client:only` / `client:visible`
5. If existing template fits → reuse it
6. If new layout needed → create new template family
7. Hardcode `sectionId` UUIDs in wrappers, document them in `docs/api.md`
8. Test RSVP flow end to end (confirm → decline → cancel)

---

## Agent: `bug-fixer`

**Purpose:** Diagnose and fix bugs in components or API integration.

**Pre-session reads:**
1. `docs/architecture.md` — data flow (trace where the bug originates)
2. `docs/api.md` — expected vs actual API behavior

**Workflow:**
1. Read the error message / reproduction steps
2. Trace the data flow: page → island → loader → API → state → render
3. Read the specific component file(s) involved
4. Fix the root cause — never suppress errors with try/catch without logging
5. Ensure loading/error states are handled correctly after fix
6. Update docs if bug revealed a documentation gap

---

## Agent: `backend-integrator`

**Purpose:** Conectar con el proyecto backend para validar contratos de API, response shapes, UUIDs de secciones, o cualquier dato que el frontend necesite confirmar contra la fuente de verdad del servidor.

**Activación:** El usuario provee el path del backend con un mensaje como:
- `"valida X con el backend en {path}"`
- `"el backend está en {path}, confirma si el endpoint Y existe"`
- `"revisa en el back qué campos devuelve Z"`

**Pre-session reads:**
1. `docs/backend.md` — protocolo de integración y notas conocidas
2. `docs/api.md` — shape actual documentada (para comparar)

**Workflow:**
1. Leer `{BACKEND_PATH}/CLAUDE.md` del proyecto backend
2. Según la tarea, leer el doc relevante del backend (rutas, controladores, modelos)
3. Localizar el archivo específico que define el endpoint o dato a validar
4. Comparar contra lo documentado en `docs/api.md` de este frontend
5. Reportar: ✅ alineado / ⚠️ diferencia encontrada / ❌ no existe
6. Si hay diferencia, sugerir el cambio concreto en frontend O en `docs/api.md`
7. Actualizar `docs/backend.md` con lo aprendido (path, notas, discrepancias)

**Qué valida:**
- Rutas exactas de endpoints (método, URL, params)
- Response shape real vs documentada en `docs/api.md`
- Valores posibles de campos enum (`rsvp_status`, `status`, etc.)
- Si UUIDs de secciones existen y a qué evento pertenecen
- Si `Authorization: "1"` sigue siendo válido o cambió
- Estructura de presigned URLs (params `X-Amz-Date`, `X-Amz-Expires`)

**Output esperado:**
```
BACKEND CHECK: POST /api/invitations/rsvp
─────────────────────────────────────────
Campo `status`:
  Frontend envía:  "confirmed" | "declined"
  Backend espera:  "confirmed" | "declined" | "pending"   ← ⚠️ valor adicional

Campo `method`:
  Frontend envía:  "web"
  Backend acepta:  "web" | "whatsapp" | "phone"   ← info extra, sin impacto

Campo `guest_count`:
  ✅ Alineado — number, requerido cuando status=confirmed

Acción sugerida: ninguna. Docs alineados.
```

---

## Agent: `qa-agent`

**Purpose:** Mantener la suite de tests E2E en `tests/`. Crear un archivo de spec por página/flujo, ejecutarlos con `npx playwright test`, y garantizar que todos pasen antes de dar por terminado cualquier cambio.

**Regla central:**
- Nuevo flujo o feature → crear `tests/<nombre-descriptivo>.spec.ts`
- Flujo o sección modificada → actualizar el spec existente correspondiente
- Nunca dejar un cambio de código sin ejecutar los tests afectados

**Estructura de tests:**
```
tests/
  fixtures/
    api-data.ts          SECTION_IDS, makeSectionResponse, makeInvitationResponse, RSVP_SUCCESS
  helpers/
    mocks.ts             mockGraduationResources, mockWeddingResources, mockInvitation, mockRsvpPost, installApiGuard
    storage.ts           installStorageClearScript (addInitScript — race-free cache clearing)
  graduation-page.spec.ts    /graduacion-izapa — 22 tests
  wedding-rsvp.spec.ts       /AndresIvanna/Confirmacion — 23 tests
```

**Comandos:**
```bash
npm run test:e2e              # headless, mobile + desktop
npm run test:e2e:headed       # con browser visible
npm run test:e2e:ui           # UI interactivo de Playwright
npx playwright test --grep "nombre del test"   # test individual
```

**Pre-condición:** Dev server se levanta automáticamente via `webServer` en `playwright.config.ts`. No requiere `npm run dev` manual.

**Workflow — cambio de código:**
```
1. Identificar qué spec(s) cubre el flujo modificado
2. Actualizar los assertions necesarios en ese spec
3. Si es un flujo completamente nuevo → crear nuevo .spec.ts
4. Ejecutar: npx playwright test <archivo>.spec.ts
5. Verificar que todos los tests pasen (0 failed)
6. Si alguno falla → diagnosticar y corregir antes de continuar
```

**Workflow — nuevo flujo o página:**
```
1. Identificar: ¿qué sección/componente/API involucra?
2. Agregar los section UUIDs a tests/fixtures/api-data.ts si son nuevos
3. Agregar los route mocks necesarios en tests/helpers/mocks.ts
4. Crear tests/<nueva-pagina>.spec.ts siguiendo el patrón:
   - beforeEach: installStorageClearScript + mockResources + installApiGuard + goto
   - Grupos: carga, flujo principal, estados edge, responsive
5. Ejecutar y verificar que todos pasen
```

**Patrones críticos:**
- `installApiGuard(page)` SIEMPRE al final de los mocks (catch-all 500, FIFO)
- `page.addInitScript()` para limpiar cache (no `page.evaluate()` — tiene race condition)
- `client:visible` sections requieren `scrollToFraction` + `waitForTimeout(600)` antes de assertions
- URLs de mock son absolutas: `https://api.eventiapp.com.mx/api/...`
- presigned URLs en fixtures deben tener `X-Amz-Date` y `X-Amz-Expires` para que el TTL parser funcione

**Checks UX que incluir en todo spec:**
- Skeleton desaparece cuando llegan datos (`.animate-pulse` no visible tras carga)
- Elementos clave no se salen del viewport (`boundingBox` + `viewportSize`)
- Estados de error muestran mensaje visible (no crash silencioso)
- Botones tienen texto correcto en estado de carga ("Enviando...", disabled)

**Herramientas MCP Playwright (para verificación visual ad-hoc, sin crear spec):**
```
browser_navigate(url)           → Abrir página
browser_resize(width, height)   → Cambiar viewport
browser_take_screenshot()       → Captura visual
browser_snapshot()              → Árbol accesibilidad
browser_click(selector)         → Interacción
browser_wait_for(selector)      → Esperar elemento
browser_console_messages()      → Ver errores JS
browser_evaluate(script)        → Ejecutar JS en la página
```

**Viewports estándar:**
| Nombre | Resolución | Uso |
|---|---|---|
| Mobile | 375 × 812 | Target primario — siempre verificar primero |
| Tablet | 768 × 1024 | Breakpoint `md:` |
| Desktop | 1280 × 800 | Breakpoint `lg:` |

---

## Agent: `performance-auditor`

**Purpose:** Identify and fix performance bottlenecks.

**Pre-session reads:**
1. `docs/architecture.md` — Critters, island hydration, caching strategy

**Key checks:**
- Are off-screen sections using `client:visible`?
- Are section resources being cached in `sessionStorage`?
- Are images using `<ImageWithLoader>` with lazy loading?
- Are Framer Motion imports tree-shaken? (`import { motion } from "framer-motion"`)
- Are fonts served locally (they are — `/public/fonts/`)?
- Is `manualChunks: undefined` still set in Rollup config (required for Critters)?

---

## Agent: `frontend-integrator`

**Purpose:** Validar contratos compartidos, detectar drift de paths/repos y sincronizar docs entre ambos frontends (cafetton-casero y dashboard-ts) que usan el mismo backend.

**Pre-session reads:**
1. `docs/frontend-dashboard.md` — referencia rápida de dashboard-ts
2. `docs/api.md` — contratos del lado de cafetton-casero
3. `dashboard-ts/docs/frontend-integrator.md` — protocolo cross-project completo y tabla de contratos

**Activación:** El usuario hace referencia a ambos proyectos, a contratos compartidos de backend, o pide sincronizar cambios entre frontends.

**Workflow (inicio de sesión cross-project):**

```bash
# 1. Verificar paths y remotes — actualizar si cambiaron
git -C "C:\Users\AndBe\Desktop\Projects\cafetton-casero" remote -v
git -C "C:\Users\AndBe\Desktop\Projects\dashboard-ts" remote -v
```

Si algún remote cambió o un path ya no existe:
- Actualizar `docs/frontend-dashboard.md` (en este repo)
- Actualizar `dashboard-ts/docs/frontend-integrator.md` (en dashboard-ts)
- Actualizar `CLAUDE.md` → sección Proyecto

**Workflow (validación de contrato compartido):**
1. Leer `dashboard-ts/docs/frontend-integrator.md` → tabla "Shared Backend Contracts"
2. Comparar contra `docs/api.md` de este repo
3. Si hay mismatch → reportar + sugerir fix concreto
4. Si se cambia un contrato → actualizar docs en **ambos** proyectos

**Casos de uso típicos:**
- Nuevo endpoint que usarán los dos frontends → definir shape una vez, documentar en ambos `docs/api.md`
- Cambio de modelo backend (Guest, Invitation, Resource) → actualizar interfaces TypeScript en ambos repos
- ¿Cafetton unwrap `r.data.data` correctamente para el nuevo endpoint? → validar envelope
- Detectar si dashboard-ts recibió un git remote → actualizar `docs/frontend-dashboard.md`

**Regla de paridad de docs:**
Si un contrato backend cambia, actualizar los tres proyectos:
- `cafetton-casero/docs/api.md`
- `dashboard-ts/docs/api.md` o `backend-agent.md`
- `itbem-events-backend/docs/` (si cambió la ruta del backend)

**Registry (auto-actualizar si cambia):**

| Proyecto | Local path | GitHub |
|---|---|---|
| cafetton-casero (este repo) | `C:\Users\AndBe\Desktop\Projects\cafetton-casero` | `https://github.com/Itbem-Corp/itbem-events-frontend.git` |
| dashboard-ts | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` | Sin remote configurado aún |
| Backend (Go) | `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend` | `git@github.com:Itbem-Corp/itbem-events-backend.git` |

