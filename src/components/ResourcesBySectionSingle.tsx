"use client";
import { useEffect, useState } from "react";

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
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const loadResources = async () => {
            const now = new Date();
            const cacheKey = `resourcesBySection-${sectionId}`;
            const expiryKey = `resourcesExpiry-${sectionId}`;

            // Verifica si hay expiración previa
            const cachedExpiry = localStorage.getItem(expiryKey);
            if (cachedExpiry) {
                const expiryDate = new Date(cachedExpiry);
                if (expiryDate > now) {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) {
                        try {
                            const parsed = JSON.parse(cached);
                            onLoaded(parsed);
                            setLoaded(true);
                            return;
                        } catch {
                            sessionStorage.removeItem(cacheKey);
                            localStorage.removeItem(expiryKey);
                        }
                    }
                } else {
                    // ⚠️ Expirado, limpia
                    sessionStorage.removeItem(cacheKey);
                    localStorage.removeItem(expiryKey);
                }
            }

            const res = await fetch(`${EVENTS_URL}api/resources/section/${sectionId}`, {
                headers: {
                    Authorization: "1",
                },
            });

            const json = await res.json();
            const data = Array.isArray(json?.data) ? json.data : [];

            const section = {
                sectionId,
                sectionResources: data.sort((a: { position: number; }, b: { position: number; }) => a.position - b.position),
            };

            // Detecta la expiración más cercana entre las URLs
            const expirations = section.sectionResources
                .map((r) => getPresignedExpiry(r.view_url))
                .filter((d): d is Date => d instanceof Date);

            const minExpiry = expirations.length
                ? new Date(Math.min(...expirations.map((d) => d.getTime())))
                : new Date(Date.now() + 6 * 60 * 60 * 1000); // fallback: 6 horas

            sessionStorage.setItem(cacheKey, JSON.stringify(section));
            localStorage.setItem(expiryKey, minExpiry.toISOString());

            onLoaded(section);
            setLoaded(true);
        };

        loadResources();
    }, [sectionId, EVENTS_URL, onLoaded]);

    return null;
}
