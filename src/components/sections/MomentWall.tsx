"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InvitationLoader, { type InvitationData } from "../InvitationDataLoader";
import type { SectionComponentProps, MomentWallConfig } from "../engine/types";
import { addPendingMoment } from "../moments/MomentsGallery";
import { useVideoThumbnail } from "../../hooks/useVideoThumbnail";

interface Moment {
  id: string;
  content_url: string;
  thumbnail_url?: string; // WebP poster extracted by video Lambda; empty for images
  description?: string;
  created_at: string;
  processing_status?: string;
}

interface PaginatedMoments {
  items: Moment[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
  published: number;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|m4v)(\?|$)/i.test(url);
}

function getMediaUrl(contentUrl: string, EVENTS_URL: string): string {
  if (!contentUrl) return "";
  if (contentUrl.startsWith("http")) return contentUrl;
  return EVENTS_URL + "storage/" + contentUrl;
}

interface VideoMomentCardProps {
  moment: Moment;
  EVENTS_URL: string;
  onClick: () => void;
}

function VideoMomentCard({ moment, EVENTS_URL, onClick }: VideoMomentCardProps) {
  // Only invoke canvas extraction when the backend thumbnail is absent
  const extractedFrame = useVideoThumbnail(
    moment.thumbnail_url ? null : getMediaUrl(moment.content_url, EVENTS_URL)
  );

  const posterSrc = moment.thumbnail_url
    ? getMediaUrl(moment.thumbnail_url, EVENTS_URL)
    : extractedFrame; // null while extracting → falls back to grey div

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black relative group"
    >
      <div className="relative">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={moment.description || "Video del evento"}
            className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        ) : (
          /* Grey fallback: shown until Lambda thumbnail or canvas frame is ready */
          <div className="aspect-video bg-gray-900 w-full group-hover:brightness-110 transition-[filter] duration-300" />
        )}
        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function MomentWall({ config, EVENTS_URL: rawEventsUrl }: SectionComponentProps) {
  // Normalize: ensure trailing slash so `${EVENTS_URL}api/...` always produces a valid URL.
  const EVENTS_URL = rawEventsUrl.endsWith('/') ? rawEventsUrl : rawEventsUrl + '/';
  const cfg = config as unknown as MomentWallConfig;
  const title          = cfg.title ?? "Momentos";
  const subtitle       = cfg.subtitle;
  const identifier     = cfg.identifier;
  const allowMessages  = cfg.allow_messages ?? false;

  const [moments, setMoments]             = useState<Moment[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [hasMore, setHasMore]             = useState(false);
  const [page, setPage]                   = useState(1);

  const [lightbox, setLightbox]           = useState<Moment | null>(null);
  const [lightboxIdx, setLightboxIdx]     = useState(0);
  const touchStartX                        = useRef<number | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const [showUpload, setShowUpload]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [invData, setInvData]             = useState<InvitationData | null>(null);
  const [token, setToken]                 = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  const fetchMoments = useCallback(async (pageNum = 1, append = false) => {
    if (!identifier) { setLoading(false); return; }
    try {
      const res = await fetch(`${EVENTS_URL}api/events/${identifier}/moments?page=${pageNum}&limit=20`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data as PaginatedMoments;
      const items = data?.items ?? [];
      setMoments(prev => append ? [...prev, ...items] : items);
      setHasMore(data?.has_more ?? false);
      setPage(pageNum);
    } catch {
      if (append) setLoadMoreError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [identifier, EVENTS_URL]);

  useEffect(() => { fetchMoments(1, false); }, [fetchMoments]);

  // Keyboard nav for lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!lightbox) return;
      if (e.key === "Escape") { setLightbox(null); return; }
      if (e.key === "ArrowRight") {
        const next = moments[lightboxIdx + 1];
        if (next) { setLightbox(next); setLightboxIdx(i => i + 1); }
      }
      if (e.key === "ArrowLeft") {
        const prev = moments[lightboxIdx - 1];
        if (prev) { setLightbox(prev); setLightboxIdx(i => i - 1); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, lightboxIdx, moments]);

  // Preload the adjacent moments so lightbox navigation feels instant
  useEffect(() => {
    if (!lightbox) return;
    const preload = (m: Moment | undefined) => {
      if (!m) return;
      const src = getMediaUrl(m.content_url, EVENTS_URL);
      if (!src || isVideoUrl(src)) return;
      const img = new Image();
      img.src = src;
    };
    preload(moments[lightboxIdx - 1]);
    preload(moments[lightboxIdx + 1]);
  }, [lightbox, lightboxIdx, moments, EVENTS_URL]);

  const openLightbox = (m: Moment, idx: number) => {
    setLightbox(m);
    setLightboxIdx(idx);
  };

  const handleLoadMore = () => {
    setLoadingMore(true);
    setLoadMoreError(false);
    fetchMoments(page + 1, true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return; // ignore small swipes
    if (diff > 0) {
      // swiped left → next
      const next = moments[lightboxIdx + 1];
      if (next) { setLightbox(next); setLightboxIdx(i => i + 1); }
    } else {
      // swiped right → prev
      const prev = moments[lightboxIdx - 1];
      if (prev) { setLightbox(prev); setLightboxIdx(i => i - 1); }
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invData?.prettyToken || !identifier) return;
    const form      = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const descInput = form.elements.namedItem("description") as HTMLInputElement;
    const file      = fileInput.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setUploadProgress(0);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    const contentType = file.type ||
      (ext === "heic" || ext === "heif" ? "image/heic" :
       ext === "mp4" ? "video/mp4" :
       ext === "mov" ? "video/quicktime" : "application/octet-stream");

    try {
      // Step 1 — get presigned PUT URL
      const urlRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pretty_token: invData.prettyToken, content_type: contentType, filename: file.name }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al preparar la subida");
      }
      const { data } = await urlRes.json();

      // Step 2 — PUT file directly to S3 with XHR so we get progress events
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.upload_url);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 90));
        };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 error ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Error de conexión al subir el archivo"));
        xhr.send(file);
      });
      setUploadProgress(95);

      // Step 3 — confirm with backend
      const confirmRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pretty_token: invData.prettyToken, s3_key: data.s3_key, description: descInput.value }),
      });
      if (!confirmRes.ok) {
        const err = await confirmRes.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al confirmar la subida");
      }

      setUploadProgress(100);
      setUploadSuccess(true);
      setShowUpload(false);
      form.reset();
      // Store a pending stub so the /momentos wall can show a processing card
      // while Lambda optimizes the file.
      if (identifier) {
        const isVideoUpload = contentType.startsWith("video/");
        addPendingMoment(identifier, isVideoUpload ? "video" : "image");
      }
      fetchMoments(1, false);
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Error al subir el archivo");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const prettyToken = invData?.prettyToken;
  const canUpload   = !!prettyToken && !!identifier;

  return (
    <section className="py-16 px-4">
      {token && (
        <InvitationLoader token={token} EVENTS_URL={EVENTS_URL} onLoaded={setInvData} />
      )}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold">{title}</h2>
          {subtitle && <p className="mt-2 text-gray-500">{subtitle}</p>}
        </div>

        {/* Success toast */}
        <AnimatePresence>
          {uploadSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="mb-6 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center"
            >
              ¡Archivo enviado! Aparecerá aquí cuando sea aprobado.
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload button */}
        {canUpload && (
          <div className="mb-8 text-center">
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-6 py-3 text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Subir foto o video
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">
            Aún no hay momentos compartidos.
          </p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {moments.map((m, idx) => {
              const src   = getMediaUrl(m.content_url, EVENTS_URL);
              const video = isVideoUrl(m.content_url);
              if (video) {
                return (
                  <VideoMomentCard
                    key={m.id}
                    moment={m}
                    EVENTS_URL={EVENTS_URL}
                    onClick={() => openLightbox(m, idx)}
                  />
                );
              }
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => openLightbox(m, idx)}
                  className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black relative group"
                >
                  <img
                    src={src}
                    alt={m.description || "Momento del evento"}
                    className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-6 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Cargando…
                </>
              ) : (
                "Ver más momentos"
              )}
            </button>
            {loadMoreError && (
              <p className="mt-2 text-xs text-red-500">
                Error al cargar más momentos. Intenta de nuevo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              className="relative max-w-3xl w-full"
              style={{ touchAction: 'none' }}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {isVideoUrl(lightbox.content_url) ? (
                <video
                  src={getMediaUrl(lightbox.content_url, EVENTS_URL)}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[80vh] rounded-xl"
                />
              ) : (
                <img
                  src={getMediaUrl(lightbox.content_url, EVENTS_URL)}
                  alt={lightbox.description || "Momento"}
                  className="w-full max-h-[80vh] object-contain rounded-xl"
                />
              )}
              {lightbox.description && (
                <p className="mt-3 text-center text-white/70 text-sm whitespace-pre-wrap break-words">{lightbox.description}</p>
              )}
              {/* Close */}
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                aria-label="Cerrar"
              >
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {/* Prev / Next */}
              {lightboxIdx > 0 && (
                <button
                  type="button"
                  onClick={() => { const p = moments[lightboxIdx - 1]; setLightbox(p); setLightboxIdx(i => i - 1); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                  aria-label="Anterior"
                >
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              {lightboxIdx < moments.length - 1 && (
                <button
                  type="button"
                  onClick={() => { const n = moments[lightboxIdx + 1]; setLightbox(n); setLightboxIdx(i => i + 1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                  aria-label="Siguiente"
                >
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => !uploading && setShowUpload(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Subir foto o video</h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Archivo <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    name="file"
                    type="file"
                    accept="image/*,video/*"
                    required
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
                  />
                </div>
                {allowMessages && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nota (opcional)
                    </label>
                    <textarea
                      name="description"
                      placeholder="Un momento especial… 🎉"
                      rows={2}
                      maxLength={300}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
                    />
                  </div>
                )}
                {uploadError && (
                  <p className="text-sm text-red-600">{uploadError}</p>
                )}
                {uploading && uploadProgress > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{uploadProgress < 95 ? "Subiendo archivo…" : uploadProgress < 100 ? "Procesando…" : "¡Listo!"}</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-black transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => !uploading && setShowUpload(false)}
                    disabled={uploading}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {uploading ? "Subiendo…" : "Subir"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
