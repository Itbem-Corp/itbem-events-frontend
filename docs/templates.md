# Template System

## Paradigma actual: Server-Driven UI (SDUI)

El sistema ya no usa "templates" como carpetas de componentes por evento. En su lugar:

- **PageSpec** (en `src/events/`) — describe QUÉ secciones tiene la página y con qué config
- **Section components** (en `src/components/sections/`) — saben CÓMO renderizar cada tipo de sección
- **SECTION_REGISTRY** (en `src/components/engine/registry.ts`) — conecta ambos

Nuevo evento del mismo tipo = nuevo archivo en `src/events/`. Cero componentes nuevos.

---

## PageSpec — shape

```ts
interface PageSpec {
  meta: {
    pageTitle: string;
    musicUrl?: string;    // Si presente, MusicWidget aparece
  };
  sections: Array<{
    type: string;         // Clave en SECTION_REGISTRY
    sectionId: string;    // UUID para ResourcesBySectionSingle ("" si no necesita imágenes)
    order: number;        // Orden de renderizado (ascendente)
    config: Record<string, unknown>;  // Datos del evento — tipados por cada section component
  }>;
}
```

---

## Section Types disponibles

### `CountdownHeader`
- **Config:** `{ heading: string, targetDate: string (ISO) }`
- **Recursos API:** ninguno (`sectionId: ""`)
- **Hydration:** `immediate` (above-fold)
- **Renders:** heading animado + countdown en tiempo real

### `GraduationHero`
- **Config:** `{ title, years, school }`
- **Recursos API:** 2 imágenes — `[0]` hero (3/2), `[1]` logo escolar (cuadrado)
- **Hydration:** `immediate`
- **Renders:** título + imagen hero 3/2 + años + logo + escuela

### `EventVenue`
- **Config:** `{ text, date, venueText, mapUrl }`
- **Recursos API:** 3 imágenes — `[0-1]` grid 2 cols, `[2]` centrada 3/2
- **Hydration:** `visible`
- **Renders:** grid imágenes + texto + mapa [texto izq | mapa der]

### `Reception`
- **Config:** `{ venueText, mapUrl }`
- **Recursos API:** 4 imágenes — `[0-1]` grid 2 cols arriba, `[2-3]` grid 2 cols abajo
- **Hydration:** `visible`
- **Renders:** grid top + mapa [mapa izq | texto der] + grid bottom

### `GraduatesList`
- **Config:** `{ names: string[], closing: string }`
- **Recursos API:** 1 imagen — `[0]` foto grupal 5/2
- **Hydration:** `visible`
- **Renders:** lista stagger (colores alternos blue/navy) + foto grupal + texto cierre

### `PhotoGrid`
- **Config:** `{}` (ninguno)
- **Recursos API:** 5 imágenes — `[0-1]` grid 2 cols, `[2-4]` grid 3 cols
- **Hydration:** `visible`
- **Renders:** dos filas de fotos con stagger entrance animation

### `RSVPConfirmation`
- **Config:** `{}` (ninguno — todo dinámico por token + API)
- **Recursos API:** 2 imágenes — `[0]` declined, `[1]` confirmed
- **Hydration:** `immediate`
- **Renders:** formulario RSVP completo con estados confirmed/declined/form/message

---

## Eventos actuales

### Graduación Izapa (`src/events/izapa-graduation.ts`)
Secciones en orden: `CountdownHeader` → `GraduationHero` → `EventVenue` → `Reception` → `GraduatesList` → `PhotoGrid`

### Boda Andres & Ivanna (`src/events/andres-ivanna-wedding.ts`)
Secciones: `RSVPConfirmation`

---

## Agregar un evento nuevo

### Mismo tipo de evento (ej. otra graduación)

```ts
// src/events/nueva-graduacion.ts
import type { PageSpec } from '../components/engine/types';

export const nuevaGraduacionSpec: PageSpec = {
  meta: { pageTitle: 'Nueva Graduación 2026', musicUrl: 'https://s3.../audio.mp3' },
  sections: [
    { type: 'CountdownHeader', sectionId: '', order: 1,
      config: { heading: 'EL GRAN DÍA', targetDate: '2026-06-15T20:00:00-06:00' } },
    { type: 'GraduationHero', sectionId: 'nuevo-uuid-s1', order: 2,
      config: { title: 'NOS GRADUAMOS', years: '2023-2026', school: 'SECUNDARIA' } },
    // ... más secciones
  ],
};
```

```astro
---
// src/pages/nueva-graduacion.astro
import TemplateLayout from '../layouts/template.astro';
import EventPage from '../components/engine/EventPage';
import { nuevaGraduacionSpec } from '../events/nueva-graduacion';
---
<TemplateLayout title={nuevaGraduacionSpec.meta.pageTitle}>
  <body>
    <EventPage client:only="react" spec={nuevaGraduacionSpec} EVENTS_URL={import.meta.env.PUBLIC_EVENTS_URL} />
  </body>
</TemplateLayout>
```

### Tipo de sección nuevo

1. Definir el config type en `src/components/engine/types.ts`
2. Crear `src/components/sections/MiSeccion.tsx` (ver patrón abajo)
3. Agregar una línea en `src/components/engine/registry.ts`

---

## Patrón de section component

```tsx
"use client";
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ResourcesBySectionSingle, { type Section } from '../ResourcesBySectionSingle';
import type { SectionComponentProps, MiSeccionConfig } from '../engine/types';

// Skeleton inline — misma estructura visual que el contenido
function Skeleton() {
  return <section className="animate-pulse pt-10">...</section>;
}

export default function MiSeccion({ sectionId, config, EVENTS_URL }: SectionComponentProps) {
  const { miCampo } = config as unknown as MiSeccionConfig;
  const [section, setSection] = useState<Section | null>(null);

  return (
    <>
      {/* Omitir si la sección no necesita imágenes (sectionId = "") */}
      <ResourcesBySectionSingle sectionId={sectionId} EVENTS_URL={EVENTS_URL} onLoaded={setSection} />

      <AnimatePresence mode="wait">
        {section ? (
          <motion.section key="loaded" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.6 }}>
            {/* contenido */}
          </motion.section>
        ) : (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <Skeleton />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

---

## Flujo RSVP (RSVPConfirmation)

```
Mount
  ├─ Lee ?token= de URL (useEffect)
  ├─ InvitationLoader → GET byToken → setInvData
  └─ ResourcesBySectionSingle (sectionId del spec) → setImages

Estados de render:
  ├─ !invData && !invError  → "Cargando..."
  ├─ invError               → texto rojo error
  ├─ rsvpStatus="confirmed" → mensaje + imgSi + link cancelar
  ├─ rsvpStatus="declined"  → mensaje + imgNo
  ├─ message (post-submit)  → resultado + imagen según respuesta
  └─ rsvpStatus=""          → formulario RSVP completo
```

---

## Phase 2: config desde API ✅ (activo)

`EventPage.tsx` ya no recibe `spec` como prop. En su lugar:

1. Lee `?token=` de `window.location.search`
2. Fetch `GET {EVENTS_URL}api/events/page-spec?token=...`
3. Muestra `PageSkeleton` (3 bloques animate-pulse) mientras carga
4. Muestra mensaje de error si el token es inválido o falta
5. Actualiza `document.title` con `pageSpec.meta.pageTitle` al cargar

```tsx
// EventPage.tsx — Phase 2 (actual)
useEffect(() => {
  const token = new URLSearchParams(window.location.search).get('token');
  fetch(`${EVENTS_URL}api/events/page-spec?token=${token}`)
    .then(res => res.json())
    .then(json => setSpec(json.data));
}, [EVENTS_URL]);
```

Los section components, el registry y las páginas Astro no cambian.

### Páginas Astro (Phase 2)

Ya no importan el spec estático. Solo pasan `EVENTS_URL`:

```astro
---
import TemplateLayout from '../layouts/template.astro';
import EventPage from '../components/engine/EventPage';
---
<TemplateLayout title="Título del evento">
  <body>
    <EventPage client:only="react" EVENTS_URL={import.meta.env.PUBLIC_EVENTS_URL} />
  </body>
</TemplateLayout>
```

Los archivos `src/events/*.ts` permanecen como referencia/documentación.
