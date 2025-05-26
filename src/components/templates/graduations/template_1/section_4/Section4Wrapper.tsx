"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ResourcesBySectionSingle from "../../../../ResourcesBySectionSingle";
import type { Section } from "../../../../ResourcesBySectionSingle";
import { Section4_1 } from "./Selection4Images";
import SkeletonSection4 from "./SkeletonSection4";

interface Props {
    EVENTS_URL: string;
}

const nameList = [
    "Ana Gloria Vásquez Velázquez",
    "Ángel Tonatiuh Vanegas Zamora",
    "Ernesto Salas Obregón",
    "Gael Adrián García Somohano",
    "José Antonio Bolaños Córdoba",
    "Julia Magaña Ramírez",
    "Kelly Berenice Villalobos Zamora",
    "María de Jesús Romero Cigarroa",
    "María Luisa Córdoba Tang",
    "Miguel Ángel Aceves Orellana",
    "Pedro Maximiliano López Miranda",
    "Raúl Flores Wong",
    "Renata Montiel Díaz",
    "Valeria Trujillo Iniesta"
];

export default function Section4Wrapper({ EVENTS_URL }: Props) {
    const [sectionData, setSectionData] = useState<Section | null>(null);

    return (
        <>
            <ResourcesBySectionSingle
                sectionId="af03cf82-72d3-4d8c-8838-4cfcc6bf287b"
                EVENTS_URL={EVENTS_URL}
                onLoaded={setSectionData}
            />

            <AnimatePresence mode="wait">
                {sectionData ? (
                    <motion.section
                        key="section-4-loaded"
                        className="space-y-6 text-center relative z-0 pt-10"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.6 }}
                    >
                        <h2 className="text-3xl font-bold font-bigilla text-black">Graduados</h2>
                        <motion.ul
                            className="font-medium space-y-1"
                            initial="hidden"
                            animate="visible"
                            variants={{
                                visible: {
                                    transition: {
                                        staggerChildren: 0.44
                                    }
                                }
                            }}
                        >
                            {nameList.map((name, index) => (
                                <motion.li
                                    key={name}
                                    className={`text-lg font-quicksand ${
                                        index % 2 === 0 ? 'text-[#007BC4]' : 'text-[#1B1464]'
                                    }`}
                                    variants={{
                                        hidden: { opacity: 0, y: 20 },
                                        visible: { opacity: 1, y: 0 }
                                    }}
                                    transition={{ duration: 3 }}
                                >
                                    {name}
                                </motion.li>
                            ))}
                        </motion.ul>

                        <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-100 rounded shadow-md overflow-hidden my-6">
                            <Section4_1 section={sectionData} />
                        </div>

                        <p className="font-bigilla font-bold text-xl md:text-2xl text-[#8B5D3D]">celebremos juntos</p>
                    </motion.section>
                ) : (
                    <motion.div
                        key="section-4-skeleton"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <SkeletonSection4 />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
