"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

function getIdentifierFromURL(): string {
  if (typeof window === "undefined") return "";
  // Matches /events/{identifier}/upload (Cloudflare Pages rewrite keeps original path)
  const match = window.location.pathname.match(/\/events\/([^/]+)\/upload/);
  if (match) return match[1];
  // Fallback: ?e= or ?identifier= query param
  const params = new URLSearchParams(window.location.search);
  return params.get("e") ?? params.get("identifier") ?? "";
}

interface UploadPageProps {
  EVENTS_URL: string;
}

export default function SharedUploadPage({ EVENTS_URL }: UploadPageProps) {
  const [identifier, setIdentifier]               = useState("");
  const [file, setFile]                           = useState<File | null>(null);
  const [preview, setPreview]                     = useState<string>("");
  const [isPreviewVideo, setIsPreviewVideo]        = useState(false);
  const [description, setDescription]             = useState("");
  const [uploading, setUploading]                 = useState(false);
  const [success, setSuccess]                     = useState(false);
  const [uploadsAfterThis, setUploadsAfterThis]   = useState<number | null>(null);
  const [limitReached, setLimitReached]           = useState(false);
  const [limitMessage, setLimitMessage]           = useState("");
  const [error, setError]                         = useState("");
  const [uploadsRemaining, setUploadsRemaining]   = useState<number | null>(null);
  const [dragOver, setDragOver]                   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIdentifier(getIdentifierFromURL());
  }, []);

  // Check upload quota on mount
  const checkQuota = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${EVENTS_URL}api/events/${id}/moments?page=1&limit=1`);
      if (!res.ok) return;
      const json = await res.json();
      const remaining = json.data?.uploads_remaining;
      if (remaining !== undefined) {
        setUploadsRemaining(remaining);
        if (remaining === 0) {
          setLimitReached(true);
          setLimitMessage("Ya has compartido todos los momentos permitidos. ¡Muchas gracias!");
        }
      }
    } catch { /* silent */ }
  }, [EVENTS_URL]);

  useEffect(() => {
    if (identifier) checkQuota(identifier);
  }, [identifier, checkQuota]);

  // Clean up object URLs
  useEffect(() => {
    return () => { if (preview && preview !== "video") URL.revokeObjectURL(preview); };
  }, [preview]);

  const applyFile = (f: File) => {
    setError("");

    // HEIC detection (iOS camera format — not supported by Lambda)
    if (
      f.type === "image/heic" || f.type === "image/heif" ||
      f.name.toLowerCase().endsWith(".heic") || f.name.toLowerCase().endsWith(".heif")
    ) {
      setError("Los archivos HEIC de iPhone no son soportados aún. Ve a Ajustes > Cámara > Formatos y selecciona 'Más compatible' para capturar en JPG.");
      return;
    }

    const MAX_IMAGE_BYTES = 25 * 1024 * 1024;  // 25 MB
    const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
    const ALLOWED_TYPES = [
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime", "video/x-m4v",
    ];

    const isVideo = f.type.startsWith("video/");
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (f.size > maxBytes) {
      const maxMB = isVideo ? 200 : 25;
      setError(`El archivo es demasiado grande. Máximo ${maxMB} MB para ${isVideo ? "videos" : "fotos"}.`);
      return;
    }

    if (!ALLOWED_TYPES.includes(f.type)) {
      setError("Formato no soportado. Acepta: JPG, PNG, WebP, MP4, MOV o WebM.");
      return;
    }

    setFile(f);
    if (f.type.startsWith("image/")) {
      setIsPreviewVideo(false);
      setPreview(URL.createObjectURL(f));
    } else {
      setIsPreviewVideo(true);
      setPreview("video");
    }
  };

  const clearFile = () => {
    if (preview && preview !== "video") URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setIsPreviewVideo(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) applyFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !identifier || uploading) return;
    setUploading(true);
    setError("");

    const fd = new FormData();
    fd.append("file", file);
    if (description.trim()) fd.append("description", description.trim());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429) {
        const json = await res.json();
        setLimitReached(true);
        setLimitMessage(json.message ?? "Ya alcanzaste el límite de subidas para este evento.");
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = ({
          400: "El archivo no es válido.",
          401: "No tienes permiso para subir a este evento.",
          403: "Las subidas están deshabilitadas para este evento.",
          413: "El archivo es demasiado grande. Máximo 25 MB para fotos, 200 MB para videos.",
          422: "El archivo no pudo procesarse. Verifica que no esté dañado.",
          500: "El servidor tiene problemas. Intenta en un momento.",
          503: "Servicio no disponible. Intenta en un momento.",
        } as Record<number, string>)[res.status] ?? json.message ?? `Error al subir (${res.status})`;
        throw new Error(msg);
      }

      const json = await res.json().catch(() => ({}));
      const remaining = json.data?.uploads_remaining;
      if (remaining !== undefined) {
        setUploadsRemaining(remaining);
        setUploadsAfterThis(remaining);
      }
      setSuccess(true);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        setError("La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.");
      } else {
        setError(err instanceof Error ? err.message : "Error al subir. Intenta de nuevo.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAnother = () => {
    setSuccess(false);
    clearFile();
    setDescription("");
    setUploadsAfterThis(null);
  };

  // ── Screens ───────────────────────────────────────────────────────────────

  if (!identifier) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-400 text-sm text-center">Enlace inválido. Escanea el código QR de nuevo.</p>
      </div>
    );
  }

  if (limitReached) {
    return <LimitReachedScreen message={limitMessage} />;
  }

  if (success) {
    return (
      <SuccessScreen
        uploadsRemaining={uploadsAfterThis}
        onUploadMore={uploadsAfterThis !== null && uploadsAfterThis > 0 ? handleUploadAnother : undefined}
      />
    );
  }

  // ── Main upload UI ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {/* Header */}
      <header className="px-6 pt-10 pb-4 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-black mb-4">
          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Comparte tu momento</h1>
        <p className="mt-1 text-gray-500 text-sm max-w-xs mx-auto">
          Sube una foto o video y el organizador podrá incluirlo en la galería del evento.
        </p>
        {uploadsRemaining !== null && uploadsRemaining > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            {uploadsRemaining} {uploadsRemaining === 1 ? "subida restante" : "subidas restantes"}
          </p>
        )}
      </header>

      {/* Form */}
      <main className="flex-1 px-6 pb-12 max-w-sm mx-auto w-full">
        {/* Drop zone / preview */}
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl aspect-video flex flex-col items-center justify-center gap-3 transition-all ${
                dragOver
                  ? "border-black bg-gray-100 scale-[1.02]"
                  : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <div className={`p-3 rounded-full transition-colors ${dragOver ? "bg-black" : "bg-gray-100"}`}>
                <svg className={`w-7 h-7 ${dragOver ? "text-white" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-center px-4">
                <p className="text-sm font-semibold text-gray-700">
                  {dragOver ? "Suelta aquí" : "Toca para seleccionar"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Foto o video · Hasta 200 MB</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-video"
            >
              {isPreviewVideo ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-800">
                  <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-7 h-7 text-white/80 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-white/80 text-sm font-medium truncate max-w-[180px]">{file.name}</p>
                    <p className="text-white/40 text-xs mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>
              ) : (
                <img
                  src={preview}
                  alt="Vista previa"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={clearFile}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                aria-label="Quitar archivo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f); }}
        />

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Deja un mensaje (opcional)"
          rows={3}
          maxLength={300}
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
        />

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 text-sm text-red-600 text-center"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Indeterminate upload indicator */}
        {uploading && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 animate-spin text-black"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs text-gray-500">Subiendo…</span>
          </div>
        )}

        {/* Submit button */}
        <button
          type="button"
          disabled={!file || uploading}
          onClick={handleUpload}
          className="mt-5 w-full rounded-2xl bg-black py-4 text-sm font-semibold text-white hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {uploading ? "Subiendo…" : "Compartir momento"}
        </button>
      </main>
    </div>
  );
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

function SuccessScreen({
  uploadsRemaining,
  onUploadMore,
}: {
  uploadsRemaining: number | null;
  onUploadMore?: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6"
      >
        <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h2 className="text-2xl font-bold text-gray-900">¡Momento compartido!</h2>
        <p className="mt-2 text-gray-500 text-sm max-w-xs mx-auto">
          Aparecerá en la galería cuando el organizador lo apruebe.
        </p>
        {uploadsRemaining !== null && uploadsRemaining > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            Puedes compartir {uploadsRemaining} {uploadsRemaining === 1 ? "momento más" : "momentos más"}
          </p>
        )}
        {onUploadMore && (
          <button
            onClick={onUploadMore}
            className="mt-6 rounded-2xl border border-gray-200 px-8 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Subir otra foto o video
          </button>
        )}
      </motion.div>
    </div>
  );
}

function LimitReachedScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-24 h-24 rounded-full bg-amber-100 flex items-center justify-center mb-6"
      >
        <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <h2 className="text-2xl font-bold text-gray-900">¡Gracias por tu participación!</h2>
        <p className="mt-2 text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">{message}</p>
      </motion.div>
    </div>
  );
}
