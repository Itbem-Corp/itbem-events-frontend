// src/components/templates/graduations/template_1/Header.tsx
"use client";

import { motion } from "framer-motion";
import CountdownTimer from "../../../CountdownTimer";

interface Props {
    targetDate: Date;
}

export default function Header({ targetDate }: Props) {
    return (
        <motion.header
            className="py-2 text-center space-y-6 relative z-10 pt-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
        >
            <h1 className="text-4xl font-bigilla text-[#8B5D3D]">EL GRAN DÍA</h1>
            <div className="w-full flex flex-wrap justify-center gap-4 text-[#07293A]">
                <CountdownTimer targetDate={targetDate} />
            </div>
        </motion.header>
    );
}