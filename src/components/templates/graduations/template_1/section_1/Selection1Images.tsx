import ImageWithLoader from "../../../../ImageWithLoader";
import type { Section } from "../../../../ResourcesBySectionSingle";

interface Props {
    section: Section;
}

export function Section1_1({ section }: Props) {
    const resource = section?.sectionResources[0];

    if (!resource?.view_url) return null;

    return (
        <ImageWithLoader
            src={resource.view_url}
            alt={resource.title || "Colegio Izapa"}
            className="w-full h-full object-cover"
        />
    );
}

export function Section1_2({ section }: Props) {
    const resource = section?.sectionResources[1];

    if (!resource?.view_url) return null;

    return (
        <ImageWithLoader
            src={resource.view_url}
            alt={resource.title || "Colegio Izapa"}
            className="w-full h-full object-cover"
        />
    );
}