// src/components/templates/graduations/template_1/section_5/Selection5Images.tsx
import ImageWithLoader from "../../../../ImageWithLoader";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { motion } from "framer-motion";

interface Props {
    section: Section;
}

export function Section5Top({ section }: Props) {
    return (
        <motion.div
            className="grid grid-cols-2 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
                visible: { transition: { staggerChildren: 0.1 } },
                hidden: {}
            }}
        >
            {section.sectionResources.slice(0, 2).map((resource, index) => (
                <motion.div
                    key={index}
                    variants={{
                        hidden: { opacity: 0, y: 10 },
                        visible: { opacity: 1, y: 0 }
                    }}
                    transition={{ duration: 0.4 }}
                    className="bg-transparent aspect-[3/2] rounded shadow-md overflow-hidden"
                >
                    <ImageWithLoader
                        src={resource.view_url}
                        alt={resource.title || "Colegio Izapa"}
                    />
                </motion.div>
            ))}
        </motion.div>
    );
}

export function Section5Bottom({ section }: Props) {
    return (
        <motion.div
            className="grid grid-cols-3 gap-4"
            initial="hidden"
            animate="visible"
            variants={{
                visible: { transition: { staggerChildren: 0.1 } },
                hidden: {}
            }}
        >
            {section.sectionResources.slice(2, 5).map((resource, index) => (
                <motion.div
                    key={index}
                    variants={{
                        hidden: { opacity: 0, y: 10 },
                        visible: { opacity: 1, y: 0 }
                    }}
                    transition={{ duration: 0.4 }}
                    className="bg-transparent aspect-[3/2] rounded shadow-md overflow-hidden"
                >
                    <ImageWithLoader
                        src={resource.view_url}
                        alt={resource.title || "Colegio Izapa"}
                    />
                </motion.div>
            ))}
        </motion.div>
    );
}
