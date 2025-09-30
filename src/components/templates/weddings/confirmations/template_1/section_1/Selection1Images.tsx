import ImageWithLoader from "../../../../../ImageWithLoader";
import type { Section } from "../../../../../ResourcesBySectionSingle";

interface Props {
    section: Section | null;
}

export function Section1_1({ section }: Props) {
    const resource = section?.sectionResources?.[0];
    if (!resource?.view_url) return null;

    return (
        <div className="flex justify-center mt-6">
            <div className="w-40 md:w-52 lg:w-60 xl:w-64">
                <ImageWithLoader
                    src={resource.view_url}
                    alt={resource.title || "Andres Ivanna Yes"}
                    className="rounded-3xl border-2 border-dashed border-gold w-full h-auto object-cover shadow-lg"
                />
            </div>
        </div>
    );
}

export function Section1_2({ section }: Props) {
    const resource = section?.sectionResources?.[1];
    if (!resource?.view_url) return null;

    return (
        <div className="flex justify-center mt-6">
            <div className="w-40 md:w-52 lg:w-60 xl:w-64">
                <ImageWithLoader
                    src={resource.view_url}
                    alt={resource.title || "Andres Ivanna No"}
                    className="rounded-3xl border-2 border-dashed border-gold w-full h-auto object-cover shadow-lg"
                />
            </div>
        </div>
    );
}
