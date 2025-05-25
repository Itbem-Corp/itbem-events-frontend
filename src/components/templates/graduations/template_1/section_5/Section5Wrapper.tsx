"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ResourcesBySectionSingle from "../../../../ResourcesBySectionSingle";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { Section5Top, Section5Bottom } from "./Selection5Images";
import SkeletonSection5 from "./SkeletonSection5";

interface Props {
    EVENTS_URL: string;
}

export default function Section5Wrapper({ EVENTS_URL }: Props) {
    const [sectionData, setSectionData] = useState<Section | null>(null);

    return (
        <>
            <ResourcesBySectionSingle
                sectionId="61202ab3-adaf-405f-8ff4-7bc75d1afc52"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionData}
            />

            <AnimatePresence mode="wait">
                {sectionData ? (
                    <motion.section
                        key="section-5-loaded"
                        className="space-y-6 relative z-0"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.6 }}
                    >
                        <Section5Top section={sectionData} />
                        <Section5Bottom section={sectionData} />
                    </motion.section>
                ) : (
                    <motion.div
                        key="section-5-skeleton"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <SkeletonSection5 />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
