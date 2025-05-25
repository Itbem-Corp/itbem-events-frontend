// src/components/ResourcesBySectionClient.tsx
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

export default function ResourcesBySectionSingle({ sectionId, EVENTS_URL, onLoaded }: Props) {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const loadResources = async () => {
            const now = new Date();
            const cacheKey = `resourcesBySection-${sectionId}-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
            const cached = sessionStorage.getItem(cacheKey);

            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    onLoaded(parsed);
                    setLoaded(true);
                    return;
                } catch {
                    sessionStorage.removeItem(cacheKey);
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

            sessionStorage.setItem(cacheKey, JSON.stringify(section));
            Object.keys(sessionStorage).forEach((key) => {
                if (key.startsWith(`resourcesBySection-${sectionId}-`) && key !== cacheKey) {
                    sessionStorage.removeItem(key);
                }
            });

            onLoaded(section);
            setLoaded(true);
        };

        loadResources();
    }, [sectionId, EVENTS_URL, onLoaded]);


    return null;
}