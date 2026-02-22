"use client";
import { useEffect, useRef } from "react";

export interface Resource {
    view_url: string;
    title: string;
    position: number;
}

export interface Section {
    sectionId: string;
    sectionResources: Resource[];
}

interface Props {
    sectionId: string;
    EVENTS_URL: string;
    onLoaded: (section: Section) => void;
}

function getPresignedExpiry(viewUrl: string): Date | null {
    try {
        const url = new URL(viewUrl);
        const dateStr = url.searchParams.get("X-Amz-Date");
        const expires = parseInt(url.searchParams.get("X-Amz-Expires") || "0");

        if (!dateStr || !expires) return null;

        const signedDate = new Date(
            Date.UTC(
                parseInt(dateStr.substring(0, 4)),
                parseInt(dateStr.substring(4, 6)) - 1,
                parseInt(dateStr.substring(6, 8)),
                parseInt(dateStr.substring(9, 11)),
                parseInt(dateStr.substring(11, 13)),
                parseInt(dateStr.substring(13, 15))
            )
        );

        return new Date(signedDate.getTime() + expires * 1000);
    } catch {
        return null;
    }
}

export default function ResourcesBySectionSingle({ sectionId, EVENTS_URL, onLoaded }: Props) {
    // Ref guard: prevents duplicate fetches when parent re-renders and recreates onLoaded
    const loadedRef = useRef(false);

    useEffect(() => {
        if (loadedRef.current) return;

        const controller = new AbortController();
        const cacheKey = `resourcesBySection-${sectionId}`;
        const expiryKey = `resourcesExpiry-${sectionId}`;

        const loadResources = async () => {
            const now = new Date();

            // Check sessionStorage cache with localStorage expiry
            const cachedExpiry = localStorage.getItem(expiryKey);
            if (cachedExpiry) {
                const expiryDate = new Date(cachedExpiry);
                if (expiryDate > now) {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            loadedRef.current = true;
                            onLoaded(parsed);
                            return;
                        } catch {
                            // Corrupt cache — fall through to fetch
                        }
                    }
                    // sessionStorage vacío (pestaña cerrada y reabierta) — limpiar expiry y refetch
                }
                // Expirado o sessionStorage vacío: limpiar ambas keys juntas para mantener sincronía
                sessionStorage.removeItem(cacheKey);
                localStorage.removeItem(expiryKey);
            }

            try {
                const res = await fetch(`${EVENTS_URL}api/resources/section/${sectionId}`, {
                    signal: controller.signal,
                });

                if (!res.ok) throw new Error(`API error: ${res.status}`);

                const json = await res.json();
                const data = Array.isArray(json?.data) ? json.data : [];

                const section: Section = {
                    sectionId,
                    sectionResources: data.sort((a: Resource, b: Resource) => a.position - b.position),
                };

                // Detectar la expiración más cercana entre todas las URLs
                const expirations = section.sectionResources
                    .map((r) => getPresignedExpiry(r.view_url))
                    .filter((d): d is Date => d instanceof Date);

                const minExpiry = expirations.length
                    ? new Date(Math.min(...expirations.map((d) => d.getTime())))
                    : new Date(Date.now() + 6 * 60 * 60 * 1000); // fallback: 6 horas

                // Siempre almacenar ambas keys juntas para evitar desincronización
                sessionStorage.setItem(cacheKey, JSON.stringify(section));
                localStorage.setItem(expiryKey, minExpiry.toISOString());

                loadedRef.current = true;
                onLoaded(section);
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") return;
                console.error(`Error loading section ${sectionId}:`, err);
            }
        };

        loadResources();

        // Cleanup: cancela la petición si el componente se desmonta antes de terminar
        return () => { controller.abort(); };
    }, [sectionId, EVENTS_URL]); // onLoaded excluido: es estable (setter de useState)

    return null;
}
