// utils/getResourcesBySection.ts
import {EVENTS_URL} from "astro:env/server";

export const sectionIds = [
    "76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5",
    "78acb1bb-bbc8-44de-afc9-a79eb22de2db",
    "dc87ac12-7ca1-4aca-9e07-02b687c4ecb1",
    "af03cf82-72d3-4d8c-8838-4cfcc6bf287b",
    "61202ab3-adaf-405f-8ff4-7bc75d1afc52",
];

interface ResourceResponse {
    data?: any[];
    success?: boolean;
    message?: string;
}

export async function getResourcesBySection(sectionId: string) {
    try {
        const response = await fetch(`${EVENTS_URL}api/resources/section/${sectionId}`, {
            method: 'GET',
            headers: {
                'Authorization': `1`,
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        });

        if (response.status === 401) {
            console.error(`Sección ${sectionId} falló: Token expirado o inválido`);
            return [];
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Sección ${sectionId} falló:`, error);
        return [];
    }
}

// Nueva función que obtiene recursos de todas las secciones
export async function fetchAllResources() {
    let allResources = [];

    for (const sectionId of sectionIds) {
        let resources = await getResourcesBySection(sectionId);

        // Siempre agregar la sección, con recursos o array vacío
        allResources.push({
            sectionId,
            sectionResources: (() => {
                const rawData =
                    Array.isArray(resources)
                        ? resources
                        : Array.isArray(resources?.data)
                            ? resources.data
                            : [];

                return rawData.sort((a: { position: number; }, b: { position: number; }) => a.position - b.position);
            })()
        });
    }
    return allResources;
}