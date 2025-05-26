// src/components/common/Footer.tsx
"use client";

import { motion } from "framer-motion";

export default function Footer() {
    return (
        <motion.footer
            className="relative bg-white border-t mt-16 py-10 text-gray-600 text-sm overflow-hidden"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
        >
            <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2 text-center md:text-left">
                {/* Logo vector eventiapp */}
                <img
                    src="/backgrounds/vectores-03.svg"
                    alt="eventiapp 2025 by itbem"
                    className="w-[160px] sm:w-[200px] md:w-[240px]"
                />

                {/* WhatsApp (vector-04) */}
                <div className="flex items-center">
                    <img
                        src="/backgrounds/vectores-04.svg"
                        alt="WhatsApp icon"
                        className="w-12 h-12"
                    />
                    <span className="text-black font-aloevera text-xl">9999988610</span>
                </div>

                {/* Email (vector-05) */}
                <div className="flex items-center">
                    <img
                        src="/backgrounds/vectores-05.svg"
                        alt="Email icon"
                        className="w-12 h-12"
                    />
                    <span className="text-black font-aloevera text-md">contacto.eventiapp@itbem.com</span>
                </div>
            </div>
        </motion.footer>
    );
}
