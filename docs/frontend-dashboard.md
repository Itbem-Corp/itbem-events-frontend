# Dashboard Admin Frontend (dashboard-ts)

Referencia rápida del proyecto hermano. Para trabajo cross-project usar el agente `frontend-integrator` → `docs/agents.md`.

---

## Registro del proyecto

| Campo | Valor |
|---|---|
| Propósito | Panel admin — gestión de clientes, usuarios, eventos, órdenes, analytics |
| Local path | `C:\Users\AndBe\Desktop\Projects\dashboard-ts` |
| GitHub | Sin remote configurado aún (verificar con `git remote -v`) |
| Dev URL | `http://localhost:3000` |
| Comandos | `npm run dev` · `npm run build` · `npm run lint` |

> **Auto-actualizar esta tabla** si el path o el GitHub URL cambian.

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5.8 strict · Tailwind CSS v4 (CSS-first) · Motion 12 · Zustand 5 · SWR 2 + Axios · Zod 4 · Headless UI 2 · Radix UI · React Hook Form

---

## Env vars (`.env.local`)

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
COGNITO_CLIENT_ID=
COGNITO_DOMAIN=
COGNITO_REDIRECT_URI=
COGNITO_LOGOUT_REDIRECT_URI=
```

---

## Diferencias clave vs este repo (cafetton-casero)

| Aspecto | cafetton-casero (este repo) | dashboard-ts |
|---|---|---|
| Framework | Astro 5 + React islands | Next.js 15 App Router |
| Tailwind | v3.4 (`tailwind.config.cjs`) | v4 CSS-first (sin config JS) |
| Auth | Sin auth — rutas públicas con `?token=` | Cognito OAuth 2.0 (session cookie httpOnly) |
| Estado | `useState` local por isla | Zustand global |
| Fetch | `fetch()` directo en `useEffect` | SWR + Axios (interceptors auth) |
| Rutas backend | Públicas (`/api/invitations/*`, `/api/resources/*`) | Protegidas (`Bearer <cognito-jwt>`) |
| Tema | Light, fuentes custom, gold/coffee | Dark only (`zinc-950`) |
| Animaciones | Framer Motion 12.7 | Motion 12 (paquete sucesor) |

---

## Auth flow (Cognito OAuth 2.0)

```
/auth/login → Cognito Hosted UI → /auth/callback?code=
  → exchange code for tokens
  → set cookies: session=id_token (1h httpOnly) · refresh_token (30d httpOnly)
  → redirect /
  → SessionBootstrap: GET /api/auth/token → decodeJWT() → GET /api/users → store.setProfile()
```

Middleware bloquea rutas privadas sin `session` cookie. HTTP 401 → logout automático.

---

## Rutas de app protegidas

```
(app)/
  page.tsx           Dashboard — KPIs + eventos activos
  clients/           Gestión de clientes (solo root)
  events/[id]/       Listado + detalle de eventos
  orders/            Órdenes
  users/             Gestión de usuarios (solo root)
  settings/profile/  Editor de perfil
```

---

## Roles y acceso

| Rol | Accede a | Bloqueado de |
|---|---|---|
| `is_root=true` | `/clients`, `/users` | `/events`, `/team` |
| `is_root=false` | `/events`, `/orders`, `/team` | `/clients`, `/users` |
| Cliente AGENCY | `/sub-clients` | — |
| No-AGENCY | — | `/sub-clients` |

Multi-tenant: `currentClient` en Zustand, todas las SWR keys scoped con el contexto del cliente.

---

## Contratos backend compartidos

Ambos frontends usan el mismo backend. Endpoints compartidos:

| Endpoint | dashboard-ts | cafetton-casero |
|---|---|---|
| `GET /api/resources/section/:id` | No aún (futuro) | ✅ ResourcesBySectionSingle |
| `GET /api/invitations/ByToken/:token` | ❌ | ✅ InvitationDataLoader |
| `POST /api/invitations/rsvp` | ❌ | ✅ Section1Wrapper |
| Rutas protegidas (`/api/events`, `/api/clients`…) | ✅ | ❌ |

> **Envelope mismatch a validar:** cafetton unwrap `r.data.data`; dashboard usa `r.data`. Validar con backend antes de cualquier endpoint compartido nuevo.

---

## Documentación interna de dashboard-ts

El proyecto tiene su propio sistema de docs:

```
dashboard-ts/docs/
  architecture.md      layout App Router, data flows, multi-tenant
  auth.md              Cognito flow, cookies, middleware, roles
  api.md               SWR patterns, Axios instance, endpoints
  state.md             Zustand store shape y acciones
  models.md            40+ interfaces TypeScript (mirror GORM models)
  components.md        UI library, patterns CRUD
  routing.md           rutas, guards, navegación
  styling.md           Tailwind v4, dark theme, Motion patterns
  coding-standards.md  TypeScript, patrones React, Zod
  agents.md            agentes especializados
  backend-agent.md     contratos validados con backend Go
  frontend-integrator.md   protocolo cross-project (fuente de verdad para el integrador)
```

> Para trabajo cross-project profundo, leer `dashboard-ts/docs/frontend-integrator.md` — contiene el protocolo completo y la tabla de contratos compartidos.
