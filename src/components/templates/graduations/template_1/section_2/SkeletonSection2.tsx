import React from "react";

export default function SkeletonSection2() {
    return (
        <section className="text-center space-y-6 relative z-10 animate-pulse pt-10">
            <div className="grid grid-cols-2 gap-2">
                <div className="aspect-[3/2] bg-gray-200 rounded shadow-md w-full" />
                <div className="aspect-[3/2] bg-gray-200 rounded shadow-md w-full" />
            </div>

            <p className="text-2xl bg-gray-200 h-6 w-3/4 mx-auto rounded" />

            <div className="mx-auto w-[90%] sm:w-[80%] md:w-[70%] lg:w-[600px] aspect-[3/2] bg-gray-200 rounded shadow-md" />

            <p className="text-2xl bg-gray-200 h-6 w-1/2 mx-auto rounded" />

            <div className="flex flex-row gap-2">
                <div className="basis-2/3 space-y-2 pe-4">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-5/6" />
                </div>
                <div className="basis-full sm:basis-2/3 px-2">
                    <div className="bg-gray-200 w-full max-w-[500px] aspect-[4/3] rounded mx-auto" />
                </div>
            </div>
        </section>
    );
}
