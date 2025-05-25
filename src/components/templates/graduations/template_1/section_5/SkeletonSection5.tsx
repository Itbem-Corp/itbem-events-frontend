import React from "react";

export default function SkeletonSection5() {
    return (
        <section className="space-y-6 relative z-0 animate-pulse">
            {/* Primera fila de 2 columnas */}
            <div className="grid grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                    <div
                        key={i}
                        className="bg-gray-200 aspect-[3/2] rounded shadow-md"
                    />
                ))}
            </div>

            {/* Segunda fila de 3 columnas */}
            <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="bg-gray-200 aspect-[3/2] rounded shadow-md"
                    />
                ))}
            </div>
        </section>
    );
}
