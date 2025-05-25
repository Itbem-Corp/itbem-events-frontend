import React from "react";

export default function SkeletonSection4() {
    return (
        <section className="space-y-6 text-center relative z-0 animate-pulse pt-10">
            <h2 className="text-3xl font-semibold">Graduados</h2>

            {/* Simulación de lista de nombres */}
            <ul className="space-y-1 max-w-sm mx-auto">
                {[...Array(5)].map((_, i) => (
                    <li key={i} className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
                ))}
            </ul>

            {/* Imagen principal */}
            <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md overflow-hidden my-6" />

            {/* Mensaje de cierre */}
            <p className="italic text-xl text-gray-300">cargando...</p>
        </section>
    );
}
