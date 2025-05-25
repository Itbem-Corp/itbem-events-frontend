import ImageWithLoader from "../../../../ImageWithLoader";
import type { Section } from "../../../../ResourcesBySectionSingle";

interface Props {
    section: Section;
}

export function Section2_1({ section }: Props) {
    return (
        <div className="grid grid-cols-2 gap-4">
            {section.sectionResources.slice(0, 2).map((resource, index) => (
                <div
                    key={index}
                    className="aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden"
                >
                    <ImageWithLoader
                        src={resource.view_url}
                        alt={resource.title || 'Colegio Izapa'}
                        className="w-full h-full object-cover"
                    />
                </div>
            ))}
        </div>
    );
}

export function Section2_2({ section }: Props) {
    const resource = section.sectionResources[2];

    if (!resource?.view_url) return null;

    return (
        <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
            <ImageWithLoader
                src={resource.view_url}
                alt={resource.title || 'Colegio Izapa'}
                className="w-full h-full object-cover"
            />
        </div>
    );
}
