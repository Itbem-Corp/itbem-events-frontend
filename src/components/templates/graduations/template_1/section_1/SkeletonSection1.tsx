// src/components/templates/graduations/template_1/section_1/SkeletonSection1.tsx
import React from "react";

export default function SkeletonSection1() {
    return (
        <section className="text-center space-y-6 pb-4 relative z-10 animate-pulse pt-10">
            <h2 className="text-5xl font-bold text-gray-300">NOS GRADUAMOS</h2>

            <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md" />

            <div className="text-4xl font-bold text-gray-300">
                <h3>2022 - 2025</h3>
            </div>

            <div className="flex flex-row items-center justify-center gap-4 md:gap-6 max-w-4xl mx-auto">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-200 rounded" />
                <div className="h-10 w-48 md:w-64 bg-gray-200 rounded" />
            </div>
        </section>
    );
}
