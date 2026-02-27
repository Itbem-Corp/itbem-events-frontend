import { useEffect, useState } from "react";
import { useImageOrientation } from "../components/hooks/useImageOrientation";

interface Props {
    src: string;
    alt: string;
    className?: string;
    priority?: boolean; // true → loading="eager" + fetchpriority="high" (LCP images)
}

export default function ImageWithLoader({ src, alt, className = "", priority = false }: Props) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);

    const orientation = useImageOrientation(src);

    useEffect(() => {
        if (!src) return;

        let cancelled = false;

        const img = new Image();
        img.onload = () => { if (!cancelled) setLoaded(true); };
        img.onerror = () => {
            if (!cancelled) {
                setError(true);
                setLoaded(true);
            }
        };
        img.src = src;

        // Cleanup: evita setState sobre componente desmontado
        return () => { cancelled = true; };
    }, [src]);

    if (!src || !src.startsWith("http")) {
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
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    // @ts-ignore — fetchpriority is valid but not yet in all TS libs
                    fetchpriority={priority ? "high" : undefined}
                    className={`w-full h-full ${dynamicObjectClass} transition-[opacity,filter] duration-500 ${
                        loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm"
                    } ${className}`}
                />
            )}
        </div>
    );
}
