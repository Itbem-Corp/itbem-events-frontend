"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InvitationLoader, { type InvitationData } from "../InvitationDataLoader";
import type { SectionComponentProps, MomentWallConfig } from "../engine/types";

interface Moment {
  id: string;
  content_url: string;
  description: string;
  created_at: string;
}

export default function MomentWall({ config, EVENTS_URL }: SectionComponentProps) {
  // identifier is injected directly into this section's config by the backend;
  // spec.meta.identifier exists but is not passed through SectionComponentProps.
  const cfg = config as MomentWallConfig;
  const title = cfg.title ?? 'Momentos';
  const subtitle = cfg.subtitle;
  const identifier = cfg.identifier;

  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<Moment | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [invData, setInvData] = useState<InvitationData | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
  }, []);

  const fetchMoments = useCallback(async () => {
    if (!identifier) { setLoading(false); return; }
    try {
      const res = await fetch(`${EVENTS_URL}api/events/${identifier}/moments`);
      if (!res.ok) return;
      const json = await res.json();
      setMoments(json.data ?? []);
    } catch { /* fail silently */ } finally { setLoading(false); }
  }, [identifier, EVENTS_URL]);

  useEffect(() => { fetchMoments(); }, [fetchMoments]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invData?.prettyToken || !identifier) return;
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const descInput = form.elements.namedItem('description') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pretty_token', invData.prettyToken);
    fd.append('description', descInput.value);
    try {
      const res = await fetch(`${EVENTS_URL}api/events/${identifier}/moments`, { method: 'POST', body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message ?? 'Error al subir'); }
      setUploadSuccess(true);
      setShowUpload(false);
      fetchMoments();
      setTimeout(() => setUploadSuccess(false), 4000);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Error al subir la foto');
    } finally { setUploading(false); }
  };

  const getImageUrl = (contentUrl: string) => {
    if (contentUrl.startsWith('http')) return contentUrl;
    return EVENTS_URL + 'storage/' + contentUrl;
  };

  const prettyToken = invData?.prettyToken;

  return (
    <section className="py-16 px-4">
      {token && <InvitationLoader token={token} EVENTS_URL={EVENTS_URL} onLoaded={setInvData} />}
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold">{title}</h2>
          {subtitle && <p className="mt-2 text-gray-500">{subtitle}</p>}
        </div>
        <AnimatePresence>
          {uploadSuccess && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="mb-6 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center">
              ¡Foto enviada! Aparecerá aquí cuando sea aprobada.
            </motion.div>
          )}
        </AnimatePresence>
        {prettyToken && identifier && (
          <div className="mb-8 text-center">
            <button type="button" onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-6 py-3 text-sm font-medium hover:bg-gray-800 transition-colors">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Subir foto
            </button>
          </div>
        )}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Aun no hay momentos compartidos.</p>
        ) : (
          <div className="columns-2 sm:columns-3 gap-3 space-y-3">
            {moments.map((m) => (
              <button key={m.id} type="button" onClick={() => setLightbox(m)}
                className="w-full break-inside-avoid block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-black">
                <img src={getImageUrl(m.content_url)} alt={m.description || 'Momento del evento'}
                  className="w-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setLightbox(null)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
              <img src={getImageUrl(lightbox.content_url)} alt={lightbox.description || 'Momento'}
                className="w-full max-h-[80vh] object-contain rounded-xl" />
              {lightbox.description && (
                <p className="mt-3 text-center text-white/70 text-sm">{lightbox.description}</p>
              )}
              <button type="button" onClick={() => setLightbox(null)}
                className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
                aria-label="Cerrar">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
            onClick={() => !uploading && setShowUpload(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Subir foto</h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Foto <span className="text-red-500">*</span>
                  </label>
                  <input name="file" type="file" accept="image/*" required
                    className="w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion (opcional)</label>
                  <input name="description" type="text" placeholder="Un momento especial..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
                </div>
                {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => !uploading && setShowUpload(false)} disabled={uploading}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={uploading}
                    className="flex-1 rounded-xl bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-50">
                    {uploading ? 'Subiendo...' : 'Subir'}
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
