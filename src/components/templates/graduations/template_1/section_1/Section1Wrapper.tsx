"use client";

import { useState } from "react";
import ResourcesBySectionSingle from "../../../../ResourcesBySectionSingle";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { Section1_1, Section1_2 } from "./Selection1Images";
import SkeletonSection1 from "./SkeletonSection1";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
    EVENTS_URL: string;
}

export default function Section1Wrapper({ EVENTS_URL }: Props) {
    const [sectionData, setSectionData] = useState<Section | null>(null);

    return (
        <>
            <ResourcesBySectionSingle
                sectionId="76a8d7d9-d83f-472b-9fcb-a75e96b6bcc5"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionData}
            />
            <AnimatePresence mode="wait">
            {sectionData ? (
                <motion.section
                    key="loaded"
                    className="text-center space-y-6 pb-4 relative z-10 pt-10"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="text-4xl font-semibold">
                        <h2 className="text-5xl font-bigilla font-semibold text-[#07293a]">NOS GRADUAMOS</h2>
                    </div>
                    <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden">
                        <Section1_1 section={sectionData} />
                    </div>
                    <div className="text-4xl font-bold">
                        <h3 className="text-4xl font-bigilla text-[#07293a]">2022 - 2025</h3>
                    </div>
                    <div className="flex flex-row items-center justify-center gap-2 md:gap-6 max-w-4xl mx-auto">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 flex-shrink-0">
                            <Section1_2 section={sectionData} />
                        </div>
                        <h3 className="text-3xl sm:text-4xl md:text-5xl font-semibold font-bigilla text-[#8B5D3D] text-center md:text-start mt-4 md:mt-0">
                            PREPARATORIA
                        </h3>
                    </div>
                </motion.section>
            ) : (
                <motion.div
                    key="skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <SkeletonSection1 />
                </motion.div>
            )}
            </AnimatePresence>
        </>
    );

}
