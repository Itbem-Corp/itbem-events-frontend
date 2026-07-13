# API & Data

## External API Base URL

Set via `.env`: `PUBLIC_EVENTS_URL=https://api.eventiapp.com.mx/`

Trailing slash is optional. Runtime code normalizes this value with `normalizeEventsUrl()`, strips a trailing `/api` if someone configures it by mistake, and builds backend URLs through `src/lib/apiUrls.ts`.

Backend repo: `git@github.com:Itbem-Corp/itbem-events-backend.git` (Go + Echo v4). Ver `docs/backend.md`.

---

## Auth en rutas públicas

Las rutas publicas del backend **no requieren autenticacion**. Cafetton no debe mandar `Authorization` en llamadas publicas.

El acceso publico se expresa con query params cuando aplica:
- `token`: canonical invitation/RSVP token. Accepted aliases: `Token`, `invitation_token`, `invitationToken`, `InvitationToken`, `pretty_token`, `prettyToken`, `PrettyToken`.
- `preview_token`: canonical signed preview token emitted by the dashboard. Accepted aliases: `previewToken`, `PreviewToken`.
- `t`: cache-buster asociado al preview.
- `event_access_token`: password-proof token for shared public links. Accepted aliases: `eventAccessToken`, `EventAccessToken`; Cafetton sends the value to the backend as `X-Event-Access-Token`.

Las respuestas SSR que reciben cualquiera de esas credenciales se entregan con
`Cache-Control: private, no-store` y `Pragma: no-cache`. Todas las páginas usan
`Referrer-Policy: no-referrer`; los iframes de mapas repiten la misma política.
Así, una URL de invitación o preview no termina en cachés compartidos ni en el
encabezado `Referer` de un tercero.

Las rutas admin/protegidas pertenecen al dashboard y usan `Authorization: Bearer <cognito-jwt>`.

---

## Endpoints Used

### GET — Invitation by token
```
GET {EVENTS_URL}api/invitations/ByToken?token={token}
```
El frontend construye esta URL con `buildInvitationByTokenUrl`, respetando el casing `ByToken` que define Echo.

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
```

For password-protected public events, send `X-Event-Access-Token` with the `accessToken` returned by `POST /api/events/:identifier/verify-access`. Studio preview may use `preview_token` only when PageSpec returned `access.previewAuthorized=true`.

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

- **Cache store:** `sessionStorage` (key includes backend URL, section ID, and public access scope: preview token, invitation token, and password proof when present)
- **Expiry store:** `localStorage` (same scoped key family)
- **TTL source:** Parsed from S3 presigned URL params (`X-Amz-Date` + `X-Amz-Expires`)
- **Fallback TTL:** 6 hours if no presigned params detected
- **Invalidation:** Automatic on expiry; corrupt cache is cleared and re-fetched. Preview traffic (`preview_token`) bypasses storage cache with `cache: "no-store"`.

Cache check sequence:
1. Read `expiryKey` from localStorage
2. If valid and not expired -> load from `sessionStorage` -> call `onLoaded()`
3. If expired or missing -> fetch API -> parse expiry -> store both -> call `onLoaded()`

---

## Section IDs

Section UUIDs vienen del PageSpec dinamico del backend. Los componentes reciben `sectionId` desde `SectionRenderer`; no deben hardcodear IDs.

Keep a record here:

| Event | Section | UUID |
|---|---|---|
| Andres & Ivanna (wedding) | Confirmation section | `8c1600fd-f6d3-494c-9542-2dc4a0897954` |
| Izapa Graduation | Section 1 — Hero + school logo | `76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5` |
| Izapa Graduation | Section 2 — Misa location | `78acb1bb-bbc8-44de-afc9-a79eb22de2db` |
| Izapa Graduation | Section 3 — Hotel reception | `dc87ac12-7ca1-4aca-9e07-02b687c4ecb1` |
| Izapa Graduation | Section 4 — Lista graduados + foto grupal | `af03cf82-72d3-4d8c-8838-4cfcc6bf287b` |
| Izapa Graduation | Section 5 — Final | `61202ab3-adaf-405f-8ff4-7bc75d1afc52` |

> Esta tabla es historica/de referencia. El flujo actual se administra desde dashboard/backend y se consume via PageSpec.

---

## Public access params

Dashboard preview and invitation context are read with `readPublicAccessParams()` and forwarded to backend GETs with `publicAccessQueryParams()`. Preview mode only activates when a backend-supported preview token alias is present; `preview=1` alone is normal public traffic.

`GET /api/events/:identifier/meta` returns a public-safe metadata shape and may use the PWA fresh-first cache when anonymous. If the request carries `preview_token`, invitation `token`, `event_access_token`, or `X-Event-Access-Token`, treat it as scoped public access and use `cache: "no-store"`.

---

## Google Maps Embeds (Hardcoded in Graduation Sections)

| Location | Section | Coordinates |
|---|---|---|
| Santuario la Villita de Guadalupe (Misa) | Section 2 | `14.897417, -92.253839` — embed completo en Section2Wrapper |
| Hotel Holiday Inn — Salón Barista (Recepción) | Section 3 | `14.874759, -92.286864` — embed completo en Section3Wrapper |

> Los iframes de Google Maps tienen el embed URL completo hardcodeado directamente en cada `SectionNWrapper`. Para cambiar la ubicación, editar el `src` del `<iframe>` en el wrapper correspondiente.

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
