"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ResourcesBySectionSingle from "../../../../ResourcesBySectionSingle";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { Section3_1, Section3_2 } from "./Selection3Images";
import SkeletonSection3 from "./SkeletonSection3";

interface Props {
    EVENTS_URL: string;
}

export default function Section3Wrapper({ EVENTS_URL }: Props) {
    const [sectionData, setSectionData] = useState<Section | null>(null);

    return (
        <>
            <ResourcesBySectionSingle
                sectionId="dc87ac12-7ca1-4aca-9e07-02b687c4ecb1"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionData}
            />

            <AnimatePresence mode="wait">
                {sectionData ? (
                    <motion.section
                        key="section-3-loaded"
                        className="space-y-6 text-center relative z-0 pt-10"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.6 }}
                    >
                        <Section3_1 section={sectionData} />
                        <div className="flex flex-row">
                            <div className="basis-full sm:basis-2/3 px-2">
                                <div className="bg-gray-300 w-full max-w-[500px] aspect-[4/3] rounded mx-auto overflow-hidden">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3856.1165481300136!2d-92.28686442316067!3d14.874759985644767!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x858e0f003d3b1c25%3A0x878b155778419b43!2sHotel%20holiday%20entrada%20principal!5e0!3m2!1ses-419!2smx!4v1748107202928!5m2!1ses-419!2smx"
                                        className="w-full h-full"
                                        allowFullScreen
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    ></iframe>
                                </div>
                            </div>
                            <div className="basis-2/3 place-content-center ps-2">
                                <p className="text-sm leading-relaxed">
                                    posteriormente la recepción será en el Salón Barista del Hotel Holiday Inn a las 8:30 p.m.
                                </p>
                            </div>
                        </div>
                        <Section3_2 section={sectionData} />
                    </motion.section>
                ) : (
                    <motion.div
                        key="section-3-skeleton"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <SkeletonSection3 />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
