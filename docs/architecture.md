# Architecture

**Stack:** Astro 5 SSR (Node middleware) · React 19 islands · Tailwind CSS 3.4 · Framer Motion 12 · Howler.js · Vite + Critters · TypeScript strict

## Folder Map

```
src/
  pages/
    evento.astro               # Página genérica /evento?token=... — zero-code nuevos eventos
    graduacion-izapa.astro     # Página graduación Izapa
    AndresIvanna/
      Confirmacion.astro       # Página RSVP boda
  layouts/
    template.astro             # Shell HTML para eventos: lang=es, fuentes, preconnects
  components/
    engine/                    # ← SDUI engine (no tocar salvo para agregar features al engine)
      types.ts                 # PageSpec, SectionSpec, HydrationMode, per-section configs
      registry.ts              # SECTION_REGISTRY: mapea type string → loader + hydration
      SectionRenderer.tsx      # IntersectionObserver lazy hydration por sección
      SectionErrorBoundary.tsx # React Error Boundary — captura errores por sección
      EventPage.tsx            # Root renderer: fetch spec + retry + MusicWidget + secciones + Footer
    sections/                  # ← Un archivo por tipo de sección — self-contained
      CountdownHeader.tsx      # Countdown + heading animado
      GraduationHero.tsx       # Hero image + título + logo escolar
      EventVenue.tsx           # Imágenes + texto + mapa (misa/primer evento)
      Reception.tsx            # Imágenes + mapa + texto (recepción/segundo evento)
      GraduatesList.tsx        # Lista de nombres con stagger + foto grupal
      PhotoGrid.tsx            # Grid 2+3 de fotos con stagger
      RSVPConfirmation.tsx     # Formulario RSVP completo (boda)
    common/
      Footer.tsx               # Compartido — logo + WhatsApp + email
    MusicWidget.tsx            # Floating audio player — acepta audioUrl como prop
    ImageWithLoader.tsx        # img con skeleton + fade-in + orientación automática
    ResourcesBySectionSingle.tsx # Headless fetcher con cache sessionStorage+localStorage
    InvitationDataLoader.tsx   # Headless fetcher para datos de invitación (ByToken)
    CountdownTimer.tsx         # Countdown en tiempo real (timezone: America/Mexico_City)
    hooks/
      useImageOrientation.tsx
  lib/utils.ts                 # cn() = clsx + tailwind-merge
  utils/
    getDateInTimeZone.tsx
  styles/
    global.css
    fonts.css
```

---

## Arquitectura SDUI (Server-Driven UI)

El frontend usa un paradigma donde **la estructura de la página está separada del código de los componentes**.

### Flow completo (Phase 2 — activo)

```
1. Astro page renderiza shell HTML con <EventPage client:only="react" />
2. EventPage hidrata en cliente → lee ?token= de la URL
3. Fetch GET {EVENTS_URL}api/events/page-spec?token=... → recibe PageSpec JSON
   └─ sessionStorage cache (30 min TTL keyed by token)
   └─ 3 reintentos con backoff lineal (500ms / 1000ms / 1500ms) antes de error
   └─ 404 no se reintenta (token inválido)
4. EventPage ordena las secciones por `order`
5. Por cada sección → SectionRenderer decide si hydrate inmediato o lazy
6. SectionRenderer lazy-importa el componente del SECTION_REGISTRY
7. El componente carga sus imágenes vía ResourcesBySectionSingle
8. AnimatePresence: skeleton → contenido
9. SectionErrorBoundary captura errores por sección — la página no se rompe entera
```

### Agregar un evento nuevo (Phase 2)

```
Opción A — URL genérica (zero-code):
  El backend crea el Event + EventSection[]. URL: /evento?token=ABC. No se toca el frontend.

Opción B — URL personalizada (10 líneas):
  1. En el backend: crear Event + EventSection[] con component_type + config
  2. src/pages/{nombre}.astro — 10 líneas: solo importa EventPage + pasa EVENTS_URL
  Done.
```

```astro
---
import TemplateLayout from '../layouts/template.astro';
import EventPage from '../components/engine/EventPage';
---
<TemplateLayout title="Nombre del evento">
  <body>
    <EventPage client:only="react" EVENTS_URL={import.meta.env.PUBLIC_EVENTS_URL} />
  </body>
</TemplateLayout>
```

### Agregar un tipo de sección nuevo

```
1. Crear src/components/sections/MiSeccion.tsx
   └─ Props: { sectionId, config, EVENTS_URL } (SectionComponentProps)
   └─ config: narrows to MiSeccionConfig internamente
   └─ Skeleton inline con AnimatePresence
2. Agregar a engine/types.ts: export interface MiSeccionConfig { ... }
3. Agregar una línea a engine/registry.ts:
   MiSeccion: { loader: () => import('../sections/MiSeccion'), hydration: 'visible' }
4. Usar el type string en cualquier PageSpec del backend
```

---

## Astro Island Pattern

| Directiva | Cuándo usar |
|---|---|
| `client:only="react"` | `EventPage` — el único island de la página |
| `client:visible` | **No se usa** — SectionRenderer lo implementa en React con IntersectionObserver |

**Regla:** Una página de evento = un solo `client:only` island (`EventPage`). La lazy hydration por sección la maneja `SectionRenderer` internamente.

---

## Data Flow (evento público)

```
Browser carga página Astro
  │
  ├─ template.astro → HTML estático con preconnect API + S3 + Maps
  │
  └─ EventPage (client:only="react") hidrata:
       │
       ├─ Lee ?token= de la URL
       │
       ├─ GET {EVENTS_URL}api/events/page-spec?token=... (con cache + retry)
       │
       ├─ MusicWidget → lazy-load react-howler en primera interacción
       │
       └─ Por cada SectionSpec (ordenado por `order`):
            │
            ├─ hydration:'immediate' → carga JS del componente de inmediato
            ├─ hydration:'visible'   → IntersectionObserver (rootMargin: 150px)
            │                          carga JS solo cuando la sección se acerca al viewport
            │
            └─ Componente de sección:
                 ├─ SectionErrorBoundary → aisla errores por sección
                 ├─ ResourcesBySectionSingle → GET /api/resources/section/{id} (con cache)
                 └─ AnimatePresence: skeleton → datos
```

---

## Acceso por token (URL access code)

Las páginas de evento son **públicas** — no hay usuario logueado. El acceso se controla con un token en la URL:

```
/evento?token=ABC123
/AndresIvanna/Confirmacion?token=XYZ
```

- El token identifica a quién pertenece la invitación (`InvitationAccessToken` en el backend)
- Es **opcional** — eventos sin acceso restringido simplemente no validan el token
- Para RSVP: el componente `RSVPConfirmation` lee el `?token=` y llama a `/api/invitations/ByToken/:token`
- El backend devuelve `pretty_token` que se usa en el POST de confirmación

**No hay auth de usuario** en este repo. El dashboard admin es un proyecto separado (Next.js).

---

## Servidor de producción (`server.mjs`)

El adapter usa **modo `middleware`** (no `standalone`). El servidor HTTP lo levanta `server.mjs` en la raíz del proyecto.

```
browser request
  → http.createServer (server.mjs)
      → withCompression(req, res)   # gzip o brotli via node:zlib
          → handler(req, res)        # Astro SSR handler (dist/server/entry.mjs)
```

- **Brotli** — calidad 5, si `Accept-Encoding: br`
- **gzip** — nivel 6, si `Accept-Encoding: gzip`
- Solo comprime tipos compresibles: `text/*`, `application/javascript`, `application/json`, `image/svg+xml`
- Sin dependencias extra — solo `node:http` y `node:zlib` nativos

**Iniciar en producción:** `npm run start` o `node server.mjs`

---

## External Services

| Servicio | Propósito | Conexión |
|---|---|---|
| `PUBLIC_EVENTS_URL` | PageSpec, Invitations, RSVP, resources | fetch desde EventPage y componentes de sección |
| AWS S3 (`itbem-events-bucket-prod.s3.us-east-2.amazonaws.com`) | Imágenes y audio | Presigned URLs (preconnect en `<head>`) |
| Google Maps embed | Ubicaciones de eventos | iframes en EventVenue y Reception |

---

## Performance

1. **Critters** — inline CSS crítico en build. Requiere `manualChunks: undefined` en Rollup
2. **SectionRenderer IntersectionObserver** — secciones `visible` no cargan JS hasta estar cerca del viewport. Equivalente a `client:visible` pero implementado en React para funcionar dentro del island único
3. **Dynamic imports en registry** — cada sección es un chunk separado. El browser solo descarga el JS de las secciones que va a renderizar
4. **ResourcesBySectionSingle cache** — `sessionStorage` + expiry en `localStorage` basado en presigned URL params
5. **EventPage sessionStorage cache** — page-spec cacheado 30 min; retorno a la misma invitación no hace fetch
6. **Fuentes locales** — `/public/fonts/*.otf/.ttf`, sin CDN externo
7. **Compresión gzip/brotli** — `server.mjs` aplica compresión usando `node:zlib` nativo
8. **HTML válido** — Un solo `<main>` por página
