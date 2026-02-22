# Eventiapp — Frontend de Invitaciones

Vistas públicas de invitaciones y RSVP. Construido con Astro + React + Tailwind.

---

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con los valores correctos

# 3. Iniciar servidor de desarrollo
npm run dev
# → http://localhost:4321
```

---

## Variables de entorno

| Variable | Descripción | Requerida |
|---|---|---|
| `PUBLIC_EVENTS_URL` | URL base de la API (con trailing slash) | Sí |
| `PORT` | Puerto del servidor Node.js | No (default: 4321) |

Copiar `.env.example` → `.env` y ajustar los valores.

---

## Comandos

```bash
npm run dev          # Servidor de desarrollo (localhost:4321)
npm run build        # Build de producción → dist/
npm run preview      # Preview del build local
npm run test:e2e     # Tests E2E Playwright (headless)
npm run test:e2e:ui  # Tests E2E con interfaz visual
```

---

## Páginas activas

| URL | Descripción |
|---|---|
| `/evento?token=XXX` | Página genérica — cualquier evento nuevo |
| `/graduacion-izapa?token=XXX` | Invitación graduación Izapa 2025 |
| `/AndresIvanna/Confirmacion?token=XXX` | RSVP boda Andrés & Ivanna |

El `token` es el identificador del evento en el backend.

---

## Docker (producción)

```bash
docker build \
  --build-arg PUBLIC_EVENTS_URL=https://api.eventiapp.com.mx/ \
  -t eventiapp-frontend .

# Los estáticos quedan en /public dentro del contenedor
# El servidor corre en el puerto 4321
```

---

## Arquitectura

Ver `docs/architecture.md` para la documentación completa del sistema.
