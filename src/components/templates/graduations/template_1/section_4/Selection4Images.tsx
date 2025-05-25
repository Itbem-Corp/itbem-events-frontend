// src/components/templates/graduations/template_1/section_4/Selection4Images.tsx
import ImageWithLoader from "../../../../ImageWithLoader";
import type { Section } from "../../../../ResourcesBySectionSingle";

interface Props {
    section: Section;
}

export function Section4_1({ section }: Props) {
    const resource = section?.sectionResources[0];

    if (!resource?.view_url) return null;

    return (
        <ImageWithLoader
            src={resource.view_url}
            alt={resource.title || "Foto final de graduados"}
            className="w-full h-full object-cover"
        />
    );
}