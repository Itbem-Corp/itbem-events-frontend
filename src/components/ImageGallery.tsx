"use client"

import { useState, useEffect } from "react"

const DEFAULT_BG_IMAGE =
    "https://plus.unsplash.com/premium_photo-1701090939615-1794bbac5c06?fm=jpg&q=60&w=3000&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8Z3JheSUyMGJhY2tncm91bmR8ZW58MHx8MHx8fDA%3D"

interface ImageItem {
    url: string
    description?: string
}

interface ImageGalleryProps {
    images?: ImageItem[]
}

export default function ImageGallery({ images = [] }: ImageGalleryProps) {
    const [loading, setLoading] = useState(true)
    const [loadedImages, setLoadedImages] = useState<ImageItem[]>([])

    useEffect(() => {
        if (!images || !Array.isArray(images) || images.length === 0) {
            const placeholders: ImageItem[] = [
                {
                    url: DEFAULT_BG_IMAGE,
                    description: "Imagen de graduación",
                },
                {
                    url: DEFAULT_BG_IMAGE,
                    description: "Ceremonia de graduación",
                },
                {
                    url: DEFAULT_BG_IMAGE,
                    description: "Celebración de graduación",
                },
            ]

            const timer = setTimeout(() => {
                setLoadedImages(placeholders)
                setLoading(false)
            }, 1000)

            return () => clearTimeout(timer)
        }

        const timer = setTimeout(() => {
            setLoadedImages(images)
            setLoading(false)
        }, 1000)

        return () => clearTimeout(timer)
    }, [images])

    return (
        <div className="my-8">
            <h3 className="text-center font-bold mb-4">MAPA</h3>

            <div className="space-y-4">
                {loading
                    ? Array(3)
                        .fill(0)
                        .map((_, index) => (
                            <div
                                key={index}
                                className="w-full aspect-video rounded"
                                style={{
                                    backgroundImage: `url(${DEFAULT_BG_IMAGE})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                }}
                            >
                                <div className="w-full h-full bg-gray-800 bg-opacity-30 flex items-center justify-center">
                                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            </div>
                        ))
                    : loadedImages.map((image, index) => (
                        <div key={index} className="space-y-2">
                            <div
                                className="w-full aspect-video rounded shadow-sm overflow-hidden"
                                style={{
                                    backgroundImage: `url(${image.url || DEFAULT_BG_IMAGE})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                }}
                            >
                                <div className="w-full h-full bg-black bg-opacity-10"></div>
                            </div>
                            <p className="text-xs text-gray-600">
                                {image.description || "Imagen de graduación"}
                            </p>
                        </div>
                    ))}
            </div>
        </div>
    )
}
