import { useState, useEffect } from "react";

export type Orientation = "landscape" | "portrait" | "square" | "unknown";

export function useImageOrientation(src: string): Orientation {
    const [orientation, setOrientation] = useState<Orientation>("unknown");

    useEffect(() => {
        if (!src) return;

        const img = new Image();
        img.src = src;

        img.onload = () => {
            if (img.naturalWidth > img.naturalHeight) {
                setOrientation("landscape");
            } else if (img.naturalHeight > img.naturalWidth) {
                setOrientation("portrait");
            } else if (img.naturalHeight === img.naturalWidth) {
                setOrientation("square");
            }
        };

        img.onerror = () => {
            setOrientation("unknown");
        };
    }, [src]);

    return orientation;
}
