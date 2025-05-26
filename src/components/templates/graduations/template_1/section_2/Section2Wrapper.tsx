"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ResourcesBySectionSingle from "../../../../ResourcesBySectionSingle";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { Section2_1, Section2_2 } from "./Selection2Images";
import SkeletonSection2 from "./SkeletonSection2";

interface Props {
    EVENTS_URL: string;
}

export default function Section2Wrapper({ EVENTS_URL }: Props) {
    const [sectionData, setSectionData] = useState<Section | null>(null);

    return (
        <>
            <ResourcesBySectionSingle
                sectionId="78acb1bb-bbc8-44de-afc9-a79eb22de2db"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionData}
            />

            <AnimatePresence mode="wait">
                {sectionData ? (
                    <motion.section
                        key="section-2-loaded"
                        className="text-center space-y-6 relative z-10 pt-10"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.6 }}
                    >
                        <Section2_1 section={sectionData} />
                        <p className="text-2xl font-bigilla leading-snug text-[#07293A]">
                            Tenemos un logro más y queremos compartirlo contigo
                        </p>
                        <Section2_2 section={sectionData} />
                        <p className="text-2xl font-bigilla text-[#8B5D3D]">
                            este 22 de junio del 2025
                        </p>
                        <div className="flex flex-row">
                            <div className="basis-2/3 place-content-center pe-4">
                                <p className="text-sm md:text-2xl leading-relaxed font-quicksand text-[#07293A]">
                                    la misa se celebrará en el Santuario la Villita de Guadalupe a las 6:45 p.m.
                                </p>
                            </div>
                            <div className="basis-full sm:basis-2/3 px-2">
                                <div className="bg-gray-300 w-full max-w-[500px] aspect-[4/3] rounded mx-auto overflow-hidden">
                                    <iframe
                                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3855.711226652614!2d-92.25383992316038!3d14.897417285624766!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x858e0eef1d27d96d%3A0x8759c291e89adbe8!2sSantuario%20Diocesano%20La%20Villita%20de%20Guadalupe!5e0!3m2!1ses-419!2smx!4v1748106996850!5m2!1ses-419!2smx"
                                        className="w-full h-full"
                                        allowFullScreen
                                        loading="lazy"
                                        referrerPolicy="no-referrer-when-downgrade"
                                    ></iframe>
                                </div>
                            </div>
                        </div>
                    </motion.section>
                ) : (
                    <motion.div
                        key="section-2-skeleton"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <SkeletonSection2 />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
