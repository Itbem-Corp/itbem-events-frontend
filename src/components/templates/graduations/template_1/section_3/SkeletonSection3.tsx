import React from "react";

export default function SkeletonSection3() {
    return (
        <section className="space-y-6 text-center relative z-0 animate-pulse pt-10">
            {/* Primer bloque de 2 imágenes */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
                <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
            </div>

            {/* Mapa + texto */}
            <div className="flex flex-row gap-2">
                <div className="basis-full sm:basis-2/3 px-2">
                    <div className="bg-gray-200 w-full max-w-[500px] aspect-[4/3] rounded mx-auto" />
                </div>
                <div className="basis-2/3 space-y-2 ps-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
                    <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
                </div>
            </div>

            {/* Segundo bloque de 2 imágenes */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
                <div className="bg-gray-200 aspect-[3/2] rounded shadow-md w-full" />
            </div>
        </section>
    );
}
