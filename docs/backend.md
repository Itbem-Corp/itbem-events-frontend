# Backend Integration

## Repositorio

- **GitHub:** `git@github.com:Itbem-Corp/itbem-events-backend.git` (org: `Itbem-Corp`)
- **Local (WSL):** `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend`
- **Branch principal:** `main`
- **Deploy:** GitHub Actions → EC2

---

## Stack

| Componente | Tecnología |
|---|---|
| Lenguaje | Go 1.24 |
| Framework HTTP | Echo v4.12 |
| ORM | GORM (driver PostgreSQL pgx v5) |
| Base de datos | PostgreSQL |
| Cache | Redis v9 |
| Auth | AWS Cognito (JWT via `MicahParks/keyfunc`) |
| Storage | AWS S3 (aws-sdk-go-v2) |
| Imágenes | `h2non/bimg` (libvips) |

---

## Arquitectura del backend

```
Request → Controller → Service → Repository → PostgreSQL / Redis / S3
```

- **Controllers** — parsean request, llaman service, retornan `utils.Success()` / `utils.Error()`
- **Services** — lógica de negocio + invalidación de cache Redis
- **Repositories** — operaciones GORM + Redis
- Auto-migración de modelos al iniciar. Sin tests automatizados.

---

## Endpoints públicos usados por este frontend

> Estas rutas **no requieren auth** y no envían ningún header de autorización. Rate limit: 20 req/s.

### GET — Page Spec (Phase 2 SDUI)
```
GET /api/events/page-spec?token={invitation_token}
```

Retorna el PageSpec del evento asociado al token. Implementado en Phase 2.

**Response:**
```json
{
  "data": {
    "meta": {
      "pageTitle": "Nos Graduamos 2022-2025",
      "musicUrl": "https://s3.../audio.mp3"
    },
    "sections": [
      {
        "type": "CountdownHeader",
        "sectionId": "uuid-del-eventsection",
        "order": 1,
        "config": { "heading": "EL GRAN DÍA", "targetDate": "2025-06-22T20:30:00-06:00" }
      }
    ]
  }
}
```

**Implementación backend:**
- Controller: `controllers/events/events.go` → `GetPageSpec`
- Service: `services/events/PageSpecService.go` → `GetPageSpecByToken`
- Flow: token → `InvitationAccessToken` → `Invitation.EventID` → `Event` + `EventSection[]`
- Solo devuelve secciones con `is_visible=true` y `component_type != ""`

**Para activar Phase 2 en el frontend** (`EventPage.tsx`):
```tsx
// Reemplazar prop estática spec por fetch dinámico:
const spec = await fetchPageSpec(token, EVENTS_URL);
```

---

### GET — Invitation by token
```
GET /api/invitations/ByToken/:token
```
⚠️ **Case-sensitive:** `ByToken` con B y T mayúsculas. El frontend llama a `byToken` (minúscula) — validar si Echo tiene case-insensitive routing o si hay un mismatch.

**Response:**
```json
{
  "data": {
    "pretty_token": "string",
    "invitation": {
      "ID": "uuid",
      "EventID": "uuid",
      "max_guests": 2,
      "Event": { "EventDateTime": "ISO8601" }
    },
    "guest": {
      "first_name": "string",
      "last_name": "string",
      "rsvp_status": "confirmed | declined | \"\""
    }
  }
}
```

### GET — Resources by section
```
GET /api/resources/section/:key
GET /api/resources/:id
```

**Response:**
```json
{
  "data": [
    { "view_url": "presigned-s3-url", "title": "string", "position": 1 }
  ]
}
```

### GET — Attendees by section (GraduatesList)
```
GET /api/events/section/:sectionId/attendees
```

Retorna los guests de un evento a partir del UUID del EventSection. Usado por el componente `GraduatesList` para mostrar los nombres desde la DB.

**Response:**
```json
{
  "data": [
    { "first_name": "string", "last_name": "string", "nickname": "string", "role": "string", "order": 1 }
  ]
}
```

- Los guests se crean en el backend con `role = "Graduado"` para graduaciones
- `nickname` se usa como nombre visible si está definido; si no, se concatena `first_name + last_name`
- Ordenados por `order` ASC

---

### POST — RSVP
```
POST /api/invitations/rsvp
```

**Body:**
```json
{
  "pretty_token": "string",
  "status": "confirmed | declined",
  "method": "web",
  "guest_count": 2
}
```

---

## Endpoints protegidos (solo admin — Cognito JWT)

Requieren `Authorization: Bearer <cognito-token>`. Rate limit: 60 req/s.
No usados por este frontend (son del panel admin).

Cubren: CRUD Events, EventConfig, EventSections, Guests (batch + invitaciones atómicas), Moments, Resources, Fonts, Clients (multi-tenant), Users + avatar, Cache flush, Catálogos.

---

## Modelos relevantes para el frontend

```
Guest         → first_name, last_name, rsvp_status
Invitation    → ID, EventID, max_guests, Event{EventDateTime}
Event         → EventDateTime (ISO8601), Name (pageTitle), MusicUrl (opcional, para MusicWidget)
InvitationAccessToken → pretty_token, token (raw URL param)
Resource      → view_url (S3 presigned), title, position
EventSection  → ID (UUID = sectionId), ComponentType (tipo SDUI), Config (JSONB), Order, IsVisible
```

**Campos SDUI nuevos (Phase 2):**

| Modelo | Campo | Tipo | Propósito |
|---|---|---|---|
| `Event` | `music_url` | `VARCHAR` | URL S3 del audio para MusicWidget. Vacío si no aplica. |
| `EventSection` | `component_type` | `VARCHAR(50)` | Tipo de sección React: `"GraduationHero"`, `"CountdownHeader"`, etc. |
| `EventSection` | `config` | `JSONB` | Config específica de la sección. Default: `{}`. |

AutoMigrate agrega estas columnas automáticamente al iniciar el servidor.

---

## Variables de entorno del backend

Documentadas en `{BACKEND_PATH}/docs/ENVIRONMENT.md`:
```bash
DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB
AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_REGION
PORT, ENV, API_BASE_URL
```

---

## Protocolo del agente `backend-integrator`

Cuando el usuario diga "valida con el backend" o dé una tarea de integración:

1. Leer `\\wsl.localhost\Ubuntu\var\www\itbem-events-backend\CLAUDE.md`
2. Según la tarea, leer el archivo relevante del backend:
   - Rutas → `routes/routes.go`
   - Lógica endpoint → `controllers/{dominio}/`, `services/{dominio}/`
   - Modelo/tipos → `models/`, `dtos/`
   - Docs → `docs/`
3. Comparar contra `docs/api.md` de este frontend
4. Reportar diferencias o confirmar alineación

---

## Issues de integración conocidos

| # | Issue | Estado |
|---|---|---|
| 1 | Frontend llama `byToken` (minúscula), backend define `ByToken` (mayúscula) — verificar si Echo es case-insensitive | ⚠️ A validar |
| 2 | Frontend envía `Authorization: "1"` en rutas públicas — el backend no lo requiere ni valida | ✅ Sin impacto (ignorado) |
| 3 | Auth real usa AWS Cognito JWT — cuando el admin panel se active, `src/utils/auth.ts` debe generar Bearer token de Cognito | 🔲 Pendiente |
| 6 | Phase 2 SDUI: `GET /api/events/page-spec?token=...` implementado. Backend agrega `component_type` + `config` (JSONB) a `EventSection` y `music_url` a `Event`. AutoMigrate activo. | ✅ Implementado |
| 7 | Frontend llamaba `byToken` (minúscula) pero backend define `ByToken` (mayúscula). Echo v4 es case-sensitive. | ✅ Corregido en `InvitationDataLoader.tsx` |
| 4 | `pretty_token` vs `token`: URL usa `?token=` (raw), el POST de RSVP usa `pretty_token` (del response del GET) | ✅ Documentado |
| 5 | `rsvp_status` posibles valores del backend: `"confirmed"`, `"declined"`, `""` | ✅ Alineado |
