# API & Data

## External API Base URL

Set via `.env`: `PUBLIC_EVENTS_URL=https://api.eventiapp.com.mx/`

> Siempre con trailing slash. Las URLs se construyen como `${EVENTS_URL}api/...`

Backend repo: `git@github.com:Itbem-Corp/itbem-events-backend.git` (Go + Echo v4). Ver `docs/backend.md`.

---

## Auth en rutas públicas

Las rutas públicas del backend **no requieren autenticación**. El header `Authorization: "1"` que envía el frontend es ignorado por el backend — las rutas públicas no tienen middleware de auth. Se puede eliminar sin efecto.

Para las rutas admin (protegidas) se usa `Authorization: Bearer <cognito-jwt>` — gestionado por `src/utils/auth.ts` cuando se implemente.

---

## Endpoints Used

### GET — Invitation by token
```
GET {EVENTS_URL}api/invitations/ByToken/{token}
```
⚠️ El backend define `ByToken` con **B y T mayúsculas** (Go/Echo, case-sensitive). El frontend llama `byToken` — validar si hay mismatch activo. Ver issue #1 en `docs/backend.md`.

**Response shape:**
```ts
{
  data: {
    pretty_token: string,
    invitation: {
      ID: string,
      EventID: string,
      max_guests: number,
      Event: {
        EventDateTime: string  // ISO 8601
      }
    },
    guest: {
      first_name: string,
      last_name: string,
      rsvp_status: "confirmed" | "declined" | ""
    }
  }
}
```

**Mapped to `InvitationData`** in `src/components/InvitationDataLoader.tsx`:
```ts
interface InvitationData {
  id: string;
  eventId: string;
  guestName: string;       // first_name + last_name
  maxGuests: number;
  prettyToken: string;
  rsvpStatus: string;      // "confirmed" | "declined" | ""
  eventDate: string;       // ISO string from Event.EventDateTime
}
```

---

### GET — Section resources
```
GET {EVENTS_URL}api/resources/section/{sectionId}
Authorization: 1
```

**Response shape:**
```ts
{
  data: Array<{
    view_url: string,    // Presigned S3 URL
    title: string,
    position: number     // Sort order (ascending)
  }>
}
```

**Mapped to `Section`** in `src/components/ResourcesBySectionSingle.tsx`:
```ts
interface Resource {
  view_url: string;
  title: string;
  position: number;
}
interface Section {
  sectionId: string;
  sectionResources: Resource[];  // sorted by position ASC
}
```

---

### POST — RSVP confirmation
```
POST {EVENTS_URL}api/invitations/rsvp
Authorization: 1
Content-Type: application/json
```

**Request body:**
```ts
{
  pretty_token: string,
  status: "confirmed" | "declined",
  method: "web",
  guest_count: number   // 0 when declining
}
```

**Response:** JSON with success/error message. Check `res.ok` for HTTP status.

---

## Caching Strategy (ResourcesBySectionSingle)

Section resources (S3 presigned URLs) are cached to avoid redundant API calls:

- **Cache store:** `sessionStorage` (key: `resourcesBySection-{sectionId}`)
- **Expiry store:** `localStorage` (key: `resourcesExpiry-{sectionId}`)
- **TTL source:** Parsed from S3 presigned URL params (`X-Amz-Date` + `X-Amz-Expires`)
- **Fallback TTL:** 6 hours if no presigned params detected
- **Invalidation:** Automatic on expiry; corrupt cache is cleared and re-fetched

Cache check sequence:
1. Read `expiryKey` from localStorage
2. If valid and not expired → load from `sessionStorage` → call `onLoaded()`
3. If expired or missing → fetch API → parse expiry → store both → call `onLoaded()`

---

## Section IDs

Section UUIDs viven en los archivos `src/events/*.ts` (PageSpec). Ya no están hardcodeados en componentes.

Keep a record here:

| Event | Section | UUID |
|---|---|---|
| Andres & Ivanna (wedding) | Confirmation section | `8c1600fd-f6d3-494c-9542-2dc4a0897954` |
| Izapa Graduation | Section 1 — Hero + school logo | `76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5` |
| Izapa Graduation | Section 2 — Misa location | `78acb1bb-bbc8-44de-afc9-a79eb22de2db` |
| Izapa Graduation | Section 3 — Hotel reception | `dc87ac12-7ca1-4aca-9e07-02b687c4ecb1` |
| Izapa Graduation | Section 4 — Lista graduados + foto grupal | `af03cf82-72d3-4d8c-8838-4cfcc6bf287b` |
| Izapa Graduation | Section 5 — Final | `61202ab3-adaf-405f-8ff4-7bc75d1afc52` |

> Cuando agregues un evento nuevo, actualiza esta tabla Y el archivo `src/events/*.ts` correspondiente.

---

## Auth Header (Current State)

All API calls use `Authorization: "1"` as a bypass token. This is defined in `src/utils/auth.ts`:

```ts
export const getAuthHeaders = () => ({
  'Authorization': '1'   // TODO: implement real JWT
});
```

When implementing real auth, update `getAuthHeaders()` and replace all manual header objects in fetch calls.

---

## Google Maps Embeds (Hardcoded in Graduation Sections)

| Location | Section | Coordinates |
|---|---|---|
| Santuario la Villita de Guadalupe (Misa) | Section 2 | `14.897417, -92.253839` — embed completo en Section2Wrapper |
| Hotel Holiday Inn — Salón Barista (Recepción) | Section 3 | `14.874759, -92.286864` — embed completo en Section3Wrapper |

> Los iframes de Google Maps tienen el embed URL completo hardcodeado directamente en cada `SectionNWrapper`. Para cambiar la ubicación, editar el `src` del `<iframe>` en el wrapper correspondiente.

---

## POST — Drink registration (Internal — incomplete)
```
POST /api/drink
{ "bebida": string }
```
Used by `DrinkForm.tsx`. Backend route not yet implemented.

---

### PageSpec meta.contact (added 2026-02-21)

`GET /api/events/page-spec?token=...` response now includes optional `meta.contact`:

```typescript
meta: {
  pageTitle: string;
  musicUrl?: string;
  contact?: {        // new — omitted when event has no organizer data
    name?: string;
    phone?: string;
    email?: string;
  };
}
```

Sourced from `Event.OrganizerName`, `Event.OrganizerPhone`, `Event.OrganizerEmail` fields on the backend.
Footer renders these dynamically; falls back to Eventiapp defaults (`9999988610` / `contacto.eventiapp@itbem.com`) when absent.

---

## Login Endpoint (Internal — Admin only)

```
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@example.com", "password": "123456" }
```

Returns `{ success: true, token: "fake-jwt-token", user: { email, name } }`.
This is placeholder auth — not used in event confirmation flows.
