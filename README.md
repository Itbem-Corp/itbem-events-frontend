# EventiApp - Frontend de Invitaciones

Vistas publicas de invitaciones, RSVP y momentos. Construido con Astro, React y Tailwind.

---

## Setup Local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con los valores correctos

# 3. Iniciar servidor de desarrollo
npm run dev
# -> http://localhost:4321
```

---

## Variables De Entorno

| Variable | Descripcion | Requerida |
|---|---|---|
| `PUBLIC_EVENTS_URL` | URL base de la API; acepta con o sin slash final y sin `/api` | Si |
| `PUBLIC_DASHBOARD_URL` | URL del dashboard para generar OG images via `/api/og` | No |
| `PORT` | Puerto del servidor Node.js | No (default: 4321) |

Copiar `.env.example` a `.env` y ajustar los valores.

---

## Comandos

```bash
npm run dev          # Servidor de desarrollo (localhost:4321)
npm run build        # Build de produccion -> dist/
npm run preview      # Sirve dist/ con Cloudflare Pages + Wrangler
npm run start        # Igual que preview; requiere npm run build
npm run test:e2e     # Tests E2E Playwright (headless)
npm run test:e2e:ui  # Tests E2E con interfaz visual
```

---

## Paginas Activas

| URL | Descripcion |
|---|---|
| `/evento?token=XXX` | Pagina generica para cualquier evento |
| `/e/:identifier` | Pagina publica por identificador estable |
| `/rsvp/:identifier?token=XXX` | RSVP publico con token de invitacion |
| `/events/upload?e=:identifier` | Upload publico de momentos |

El `token` de invitacion viaja como query param y se reenvia al backend solo en endpoints publicos que lo aceptan.

---

## Docker Para El Runtime Cloudflare Local

```bash
docker build \
  --build-arg PUBLIC_EVENTS_URL=https://api.eventiapp.com.mx \
  --build-arg PUBLIC_DASHBOARD_URL=https://dashboard.eventiapp.com.mx \
  -t eventiapp-frontend .

docker run --rm -p 4321:4321 eventiapp-frontend
```

El contenedor ejecuta el artefacto `dist/_worker.js` con Wrangler. Produccion se
despliega directamente en Cloudflare Pages mediante el workflow del repositorio.

---

## Arquitectura

Ver `docs/architecture.md` para la documentacion completa del sistema.
