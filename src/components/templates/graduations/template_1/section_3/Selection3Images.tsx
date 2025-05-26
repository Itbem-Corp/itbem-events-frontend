import ImageWithLoader from "../../../../ImageWithLoader";
import type { Section } from "../../../../ResourcesBySectionSingle";

interface Props {
    section: Section;
}

export function Section3_1({ section }: Props) {
    return (
        <div className="grid grid-cols-2 gap-4">
            {section.sectionResources.slice(0, 2).map((resource, index) => (
                <div
                    key={index}
                    className="bg-gray-100 aspect-[3/2]  rounded shadow-md overflow-hidden"
                >
                    <ImageWithLoader
                        src={resource.view_url}
                        alt={resource.title || "Colegio Izapa"}
                        className="aspect-3/2 object-fill"
                    />
                </div>
            ))}
        </div>
    );
}

export function Section3_2({ section }: Props) {
    return (
        <div className="grid grid-cols-2 gap-4">
            {section.sectionResources.slice(2, 4).map((resource, index) => (
                <div
                    key={index}
                    className="bg-gray-100 aspect-[3/2] rounded shadow-md overflow-hidden"
                >
                    <ImageWithLoader
                        src={resource.view_url}
                        alt={resource.title || "Colegio Izapa"}
                    />
                </div>
            ))}
        </div>
    );
}
