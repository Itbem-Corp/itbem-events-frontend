/**
 * Builds the branded OG image URL using the dashboard's /api/og endpoint.
 * Falls back to the event's cover_image_url if no dashboard URL is configured.
 */

const DASHBOARD_URL = import.meta.env.PUBLIC_DASHBOARD_URL as string | undefined

interface OgImageParams {
    title: string
    date?: string
    address?: string
    cover?: string
    type?: string
}

export function buildOgImageUrl(params: OgImageParams): string {
    if (!DASHBOARD_URL) return params.cover || ''

    const url = new URL('/api/og', DASHBOARD_URL)
    url.searchParams.set('title', params.title)
    if (params.date) url.searchParams.set('date', params.date)
    if (params.address) url.searchParams.set('address', params.address)
    if (params.cover) url.searchParams.set('cover', params.cover)
    if (params.type) url.searchParams.set('type', params.type)

    return url.toString()
}

export interface EventOgData {
    name: string
    description?: string
    cover_image_url?: string
    event_date_time?: string
    address?: string
    organizer_name?: string
    event_type?: string
}

/**
 * Fetches event data from the page-spec endpoint for OG meta tags.
 * Best-effort with 3s timeout — returns null on failure.
 */
export async function fetchEventOgData(
    eventsUrl: string,
    identifier: string
): Promise<EventOgData | null> {
    // Normalize: always end with /
    const base = eventsUrl.endsWith('/') ? eventsUrl : `${eventsUrl}/`
    try {
        const res = await fetch(
            `${base}api/events/${encodeURIComponent(identifier)}/meta`,
            { signal: AbortSignal.timeout(3000) }
        )
        if (!res.ok) {
            // Fallback to page-spec if /meta doesn't exist
            const specRes = await fetch(
                `${base}api/events/${encodeURIComponent(identifier)}/page-spec`,
                { signal: AbortSignal.timeout(3000) }
            )
            if (!specRes.ok) return null
            const json = await specRes.json() as {
                data?: {
                    meta?: {
                        pageTitle?: string
                        contact?: { name?: string }
                        coverImageUrl?: string
                        eventDateTime?: string
                        address?: string
                        eventType?: string
                    }
                }
            }
            const meta = json?.data?.meta
            if (!meta) return null
            return {
                name: meta.pageTitle || '',
                organizer_name: meta.contact?.name,
                cover_image_url: meta.coverImageUrl,
                event_date_time: meta.eventDateTime,
                address: meta.address,
                event_type: meta.eventType,
            }
        }
        const json = await res.json() as { data?: EventOgData }
        return json?.data || null
    } catch {
        return null
    }
}
