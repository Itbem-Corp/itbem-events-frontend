import { useEffect, useState } from "react";
import { useImageOrientation } from "../components/hooks/useImageOrientation";

interface Props {
    src: string;
    alt: string;
    className?: string;
}

export default function ImageWithLoader({ src, alt, className = "" }: Props) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    const orientation = useImageOrientation(src);

    useEffect(() => {
        if (!src || typeof src !== "string") return;

        const img = new Image();
        img.src = src;
        img.onload = () => setLoaded(true);
        img.onerror = () => {
            setError(true);
            setLoaded(true);
        };
    }, [src]);

    if (!src || typeof src !== "string" || !src.startsWith("http")) {
        return (
            <div className="bg-transparent text-xs text-gray-500 flex items-center justify-center w-full h-full">
                Imagen inválida
            </div>
        );
    }

    const dynamicObjectClass = orientation === "portrait"
        ? "object-contain"
        : "object-cover";

    return (
        <div className="relative w-full h-full overflow-hidden">
            {!loaded && !error && (
                <div className="absolute inset-0 bg-transparent animate-pulse flex items-center justify-center">
                    <div className="w-8 h-8 bg-slate-300 rounded-full" />
                </div>
            )}

            {error && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                    No se pudo cargar
                </div>
            )}

            {!error && (
                <img
                    src={src}
                    alt={alt}
                    className={`w-full h-full ${dynamicObjectClass} transition-opacity duration-500 ${
                        loaded ? "opacity-100" : "opacity-0"
                    } ${className}`}
                />
            )}
        </div>
    );
}
