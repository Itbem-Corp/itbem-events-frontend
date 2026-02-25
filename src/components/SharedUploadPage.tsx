"use client";

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Theme toggle ──────────────────────────────────────────────────────────────
type Theme = 'dark' | 'light';

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = localStorage.getItem('upload-theme');
    return (stored === 'dark' || stored === 'light') ? stored : 'dark';
  });
  const toggle = useCallback(() => {
    setTheme(t => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('upload-theme', next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

function getIdentifierFromURL(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/events\/([^/]+)\/upload/);
  if (match) return match[1];
  const params = new URLSearchParams(window.location.search);
  return params.get("e") ?? params.get("identifier") ?? "";
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILES = 10;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/3gpp",
];
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif",
  "mp4", "mov", "webm", "m4v", "3gp",
];
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.mp4,.mov,.webm,.m4v,.3gp";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FileEntry {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  isHeic: boolean;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
  progress?: number; // 0-100 during upload
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validateFile(f: File): string | null {
  const isVideo = f.type.startsWith("video/");
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (f.size > maxBytes) {
    const maxMB = isVideo ? 200 : 25;
    return `"${f.name}" excede ${maxMB} MB.`;
  }
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_TYPES.includes(f.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${f.name}" tiene formato no soportado.`;
  }
  return null;
}

function buildEntry(f: File): FileEntry {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  const isVideo = f.type.startsWith("video/") || ["mp4", "mov", "webm", "m4v", "3gp"].includes(ext);
  const isHeic = ext === "heic" || ext === "heif";
  let previewUrl: string;
  if (isVideo) {
    previewUrl = URL.createObjectURL(f); // blob URL — used for <video> playback too
  } else if (isHeic) {
    previewUrl = "heic";
  } else {
    previewUrl = URL.createObjectURL(f);
  }
  return { id: crypto.randomUUID(), file: f, previewUrl, isVideo, isHeic, status: "pending" };
}

/** Extract a thumbnail from a video file using a hidden <video> + <canvas>. */
function extractVideoThumbnail(blobUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = blobUrl;

    const fallback = () => resolve("");

    video.addEventListener("loadeddata", () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1);
    }, { once: true });

    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 400);
        canvas.height = Math.min(video.videoHeight, 400);
        const ctx = canvas.getContext("2d");
        if (!ctx) { fallback(); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      } catch { fallback(); }
    }, { once: true });

    video.addEventListener("error", fallback, { once: true });
    setTimeout(fallback, 5000);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Reusable icons ─────────────────────────────────────────────────────────────

function IconCamera({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
    </svg>
  );
}

function IconPlay({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconUpload({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function Spinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Preview Lightbox ───────────────────────────────────────────────────────────

function PreviewLightbox({
  entry,
  onClose,
}: {
  entry: FileEntry;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <IconX className="w-6 h-6" />
      </button>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {entry.isVideo ? (
          <video
            src={entry.previewUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[85vh] max-w-full rounded-2xl"
          />
        ) : entry.previewUrl === "heic" ? (
          <div className="flex flex-col items-center gap-3 text-white/60">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-sm">{entry.file.name}</p>
            <p className="text-xs text-white/40">Vista previa no disponible para HEIC</p>
          </div>
        ) : (
          <img
            src={entry.previewUrl}
            alt={entry.file.name}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain"
          />
        )}
      </motion.div>

      {/* File info bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-lg rounded-full px-5 py-2 flex items-center gap-3">
        <span className="text-white/80 text-sm font-medium truncate max-w-[200px]">{entry.file.name}</span>
        <span className="text-white/40 text-xs">{formatSize(entry.file.size)}</span>
      </div>
    </motion.div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

interface UploadPageProps {
  EVENTS_URL: string;
}

export default function SharedUploadPage({ EVENTS_URL: rawEventsUrl }: UploadPageProps) {
  const EVENTS_URL = rawEventsUrl.endsWith('/') ? rawEventsUrl : rawEventsUrl + '/';
  const [theme, toggleTheme] = useTheme();
  const [identifier, setIdentifier] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [videoThumbs, setVideoThumbs] = useState<Map<string, string>>(new Map());
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [wallPublished, setWallPublished] = useState(false);
  const [wallEventName, setWallEventName] = useState("");
  const [uploadsNotEnabled, setUploadsNotEnabled] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIdentifier(getIdentifierFromURL());
  }, []);

  const checkQuota = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`${EVENTS_URL}api/events/${id}/moments?page=1&limit=1`);
      if (!res.ok) return;
      const json = await res.json();
      // Check if shared uploads are enabled
      const shareEnabled = json.data?.share_uploads_enabled;
      if (shareEnabled === false) {
        setUploadsNotEnabled(true);
      }
      const wp = json.data?.moments_wall_published;
      if (wp === true) {
        setWallPublished(true);
        if (json.data?.event_name) setWallEventName(json.data.event_name);
      }
    } catch { /* silent */ }
  }, [EVENTS_URL]);

  useEffect(() => {
    if (identifier) checkQuota(identifier);
  }, [identifier, checkQuota]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((e) => {
        if (e.previewUrl && e.previewUrl !== "heic") URL.revokeObjectURL(e.previewUrl);
      });
    };
  }, []);

  // Generate video thumbnails in background
  const generateVideoThumb = useCallback(async (entry: FileEntry) => {
    if (!entry.isVideo || entry.previewUrl === "heic") return;
    const thumb = await extractVideoThumbnail(entry.previewUrl);
    if (thumb) {
      setVideoThumbs((prev) => new Map(prev).set(entry.id, thumb));
    }
  }, []);

  const addFiles = (incoming: File[]) => {
    setError("");
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      setError(`Máximo ${MAX_FILES} archivos por subida.`);
      return;
    }

    const toAdd = incoming.slice(0, remaining);
    const errors: string[] = [];
    const entries: FileEntry[] = [];

    for (const f of toAdd) {
      const err = validateFile(f);
      if (err) {
        errors.push(err);
      } else {
        entries.push(buildEntry(f));
      }
    }

    if (incoming.length > remaining) {
      errors.push(`Se ignoraron ${incoming.length - remaining} archivo(s) — máximo ${MAX_FILES}.`);
    }

    if (entries.length > 0) {
      setFiles((prev) => [...prev, ...entries]);
      // Generate video thumbnails async
      entries.filter((e) => e.isVideo).forEach((e) => generateVideoThumb(e));
    }
    if (errors.length > 0) {
      setError(errors.join(" "));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry?.previewUrl && entry.previewUrl !== "heic") {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((e) => e.id !== id);
    });
    setVideoThumbs((prev) => { const next = new Map(prev); next.delete(id); return next; });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  };

  const handleUpload = async () => {
    if (files.length === 0 || !identifier || uploading) return;
    setUploading(true);
    setError("");

    // Upload up to 3 files concurrently — 3x faster than sequential without
    // overwhelming the server or the user's connection.
    const CONCURRENCY = 3;
    let uploaded = 0;
    let connectionError = false;
    let uploadsDisabled = false;

    // Track in-flight S3 XHRs so we can abort them immediately on connection failure,
    // instead of waiting up to 2 minutes for each video timeout.
    const activeXHRs = new Set<XMLHttpRequest>();
    const abortActiveXHRs = () => { activeXHRs.forEach((x) => x.abort()); activeXHRs.clear(); };

    const uploadOne = async (entry: FileEntry, isFirst: boolean): Promise<void> => {
      if (entry.status === "done") { uploaded++; return; }

      setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "uploading" as const } : e));

      // Resolve content type — fall back to extension sniffing for HEIC/unknown types
      const ext = entry.file.name.toLowerCase().split(".").pop() ?? "";
      const contentType = entry.file.type ||
        (ext === "heic" || ext === "heif" ? "image/heic" :
         ext === "mp4" ? "video/mp4" :
         ext === "mov" ? "video/quicktime" :
         "application/octet-stream");

      try {
        // ── Step 1: Request a presigned PUT URL from the backend ──────────────
        const urlRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_type: contentType, filename: entry.file.name }),
        });

        if (urlRes.status === 403) { uploadsDisabled = true; return; }
        if (!urlRes.ok) {
          const json = await urlRes.json().catch(() => ({}));
          throw new Error(json.message ?? `Error obteniendo URL (${urlRes.status})`);
        }

        const { data } = await urlRes.json();
        const uploadUrl: string = data.upload_url;
        const s3Key: string = data.s3_key;

        // ── Step 2: PUT file bytes directly to S3 with XHR for progress ─────
        const xhr = new XMLHttpRequest();
        activeXHRs.add(xhr);
        try {
          await new Promise<void>((resolve, reject) => {
            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", contentType);
            xhr.timeout = 120_000; // 2 min for large videos
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const pct = Math.round((ev.loaded / ev.total) * 90); // reserve last 10% for confirm
                setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, progress: pct } : e));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`Error subiendo archivo a S3 (${xhr.status})`));
            };
            xhr.onerror = () => reject(new Error("Error de conexión al subir el archivo"));
            xhr.ontimeout = () => reject(new Error("La subida tardó demasiado. Revisa tu conexión."));
            xhr.onabort = () => reject(Object.assign(new Error("abort"), { silent: true }));
            xhr.send(entry.file);
          });
        } finally {
          activeXHRs.delete(xhr);
        }

        // ── Step 3: Confirm with backend — save DB record + queue Lambda ──────
        setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, progress: 95 } : e));
        const confirmRes = await fetch(`${EVENTS_URL}api/events/${identifier}/moments/shared/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            s3_key: s3Key,
            content_type: contentType,
            description: isFirst && description.trim() ? description.trim() : "",
          }),
        });

        if (!confirmRes.ok) {
          const json = await confirmRes.json().catch(() => ({}));
          throw new Error(json.message ?? `Error confirmando subida (${confirmRes.status})`);
        }

        setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "done" as const, progress: 100 } : e));
        uploaded++;
        setUploadedCount(uploaded);
      } catch (err) {
        if ((err as { silent?: boolean }).silent) return; // silently dropped by abortActiveXHRs()
        let msg: string;
        if (err instanceof Error && err.name === "AbortError") {
          msg = "La subida tardó demasiado. Revisa tu conexión.";
        } else if (err instanceof TypeError) {
          msg = "No se pudo conectar al servidor. Verifica tu conexión a internet.";
          connectionError = true;
          abortActiveXHRs(); // kill other in-flight S3 uploads immediately
        } else if (err instanceof Error) {
          msg = err.message;
        } else {
          msg = "Ocurrió un error inesperado. Intenta de nuevo.";
        }
        setFiles((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "error" as const, errorMsg: msg } : e));
      }
    };

    // Process in batches of CONCURRENCY; stop early on connection/access errors
    const pending = files.filter((e) => e.status !== "done");
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      if (connectionError || uploadsDisabled) break;
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((entry, batchIdx) => uploadOne(entry, i === 0 && batchIdx === 0)));
    }

    if (connectionError) setError("No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.");
    if (uploadsDisabled) { setUploadsNotEnabled(true); setUploading(false); return; }

    setUploading(false);
    setFiles((prev) => {
      const allOk = prev.every((e) => e.status === "done");
      if (allOk && prev.length > 0) setAllDone(true);
      return prev;
    });
  };

  const handleUploadAnother = () => {
    files.forEach((e) => {
      if (e.previewUrl && e.previewUrl !== "heic") URL.revokeObjectURL(e.previewUrl);
    });
    setFiles([]);
    setVideoThumbs(new Map());
    setDescription("");
    setAllDone(false);
    setUploadedCount(0);
    setError("");
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  if (!identifier) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <ThemeToggleButton />
        <div className={`min-h-screen flex items-center justify-center px-6 relative${theme === 'light' ? ' bg-gray-50' : ''}`}>
          <DarkBackground />
          <p className="text-gray-500 text-sm text-center">Enlace inválido. Escanea el código QR de nuevo.</p>
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (uploadsNotEnabled) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <ThemeToggleButton />
        <ComingSoonScreen identifier={identifier} />
      </ThemeCtx.Provider>
    );
  }

  if (wallPublished) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <ThemeToggleButton />
        <ThankYouScreen eventName={wallEventName} identifier={identifier} />
      </ThemeCtx.Provider>
    );
  }

  if (allDone) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <ThemeToggleButton />
        <SuccessScreen
          count={uploadedCount}
          onUploadMore={handleUploadAnother}
        />
      </ThemeCtx.Provider>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const doneCount = files.filter((e) => e.status === "done").length;
  const hasErrors = files.some((e) => e.status === "error");
  const canAdd = files.length < MAX_FILES;

  // ── Main UI ────────────────────────────────────────────────────────────────

  return (
    <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
    <ThemeToggleButton />
    <div className={`min-h-screen flex flex-col relative${theme === 'light' ? ' bg-gray-50' : ''}`}>
      <DarkBackground />
      {/* Preview lightbox */}
      <AnimatePresence>
        {previewEntry && (
          <PreviewLightbox entry={previewEntry} onClose={() => setPreviewEntry(null)} />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-4 sm:px-6 pt-8 sm:pt-12 pb-6 text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.1 }}
          className={`inline-flex items-center justify-center w-16 h-16 rounded-[20px] mb-5 transition-colors ${
            theme === 'dark'
              ? 'bg-violet-500/20 border border-violet-500/30 shadow-[0_0_40px_rgba(139,92,246,0.25)]'
              : 'bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-indigo-500/25'
          }`}
        >
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
        >
          Comparte tus momentos
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`mt-2 text-sm max-w-[280px] mx-auto leading-relaxed ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
        >
          Sube hasta {MAX_FILES} fotos o videos para la galería del evento
        </motion.p>
      </header>

      {/* Main content */}
      <main className="flex-1 px-3 sm:px-5 pb-10 pt-2 max-w-md mx-auto w-full">
        <div className={`space-y-4 rounded-3xl p-4 sm:p-6 transition-all ${
          theme === 'dark'
            ? 'bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/50'
            : 'bg-white border border-gray-100 shadow-sm'
        }`}>

        {/* Thumbnails grid */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-2"
            >
              {files.map((entry) => {
                const thumb = entry.isVideo ? videoThumbs.get(entry.id) : null;
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    className={`relative aspect-square rounded-2xl overflow-hidden group cursor-pointer transition-all duration-200 ${
                      entry.status === 'uploading'
                        ? 'ring-2 ring-amber-400/60 shadow-[0_0_14px_rgba(251,191,36,0.35)]'
                        : entry.status === 'done'
                        ? 'ring-2 ring-green-400/60 shadow-[0_0_14px_rgba(52,211,153,0.45)]'
                        : entry.status === 'error'
                        ? 'ring-2 ring-red-400/60 shadow-[0_0_14px_rgba(248,113,113,0.45)]'
                        : theme === 'dark'
                        ? 'ring-1 ring-white/10 hover:ring-white/25 hover:scale-[1.02] bg-gray-800'
                        : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:scale-[1.02] bg-gray-100'
                    }`}
                    onClick={() => { if (!uploading) setPreviewEntry(entry); }}
                  >
                    {/* Thumbnail image */}
                    {entry.isVideo ? (
                      thumb ? (
                        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                          <IconPlay className="w-8 h-8 text-white/40" />
                        </div>
                      )
                    ) : entry.previewUrl === "heic" ? (
                      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 ${
                        theme === 'dark'
                          ? 'bg-gradient-to-br from-gray-700 to-gray-800'
                          : 'bg-gradient-to-br from-gray-200 to-gray-300'
                      }`}>
                        <svg className={`w-6 h-6 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        <p className={`text-[9px] font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>HEIC</p>
                      </div>
                    ) : (
                      <img src={entry.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    )}

                    {/* Video play badge */}
                    {entry.isVideo && entry.status === "pending" && (
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full pl-1.5 pr-2 py-0.5">
                        <IconPlay className="w-3 h-3 text-white" />
                        <span className="text-[10px] text-white font-medium">{formatSize(entry.file.size)}</span>
                      </div>
                    )}

                    {/* Status overlays */}
                    {entry.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                        {(entry.progress ?? 0) > 0 ? (
                          <>
                            <span className="text-white text-xs font-semibold">{entry.progress}%</span>
                            <div className="w-3/4 h-1 rounded-full bg-white/30 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-white transition-all duration-300"
                                style={{ width: `${entry.progress}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <Spinner className="w-7 h-7 text-white" />
                        )}
                      </div>
                    )}
                    {entry.status === "done" && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-green-500/20 backdrop-blur-[1px] flex items-center justify-center"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow-lg"
                        >
                          <IconCheck className="w-5 h-5 text-white" />
                        </motion.div>
                      </motion.div>
                    )}
                    {entry.status === "error" && (
                      <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[1px] flex items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shadow-lg" title={entry.errorMsg}>
                          <IconX className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}

                    {/* Remove button */}
                    {!uploading && entry.status !== "done" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(entry.id); }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 sm:opacity-70"
                        aria-label="Quitar"
                      >
                        <IconX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — gallery + camera */}
        {canAdd && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: files.length === 0 ? 0.25 : 0 }}
          >
            {files.length === 0 ? (
              /* Empty state — large drop zone */
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-3xl aspect-[4/3] flex flex-col items-center justify-center gap-4 transition-all duration-200 ${
                  dragOver
                    ? theme === 'dark'
                      ? 'border-violet-400/70 bg-violet-500/[0.08] shadow-[inset_0_0_40px_rgba(139,92,246,0.12)] scale-[1.01]'
                      : 'border-indigo-400 bg-indigo-50 scale-[1.01]'
                    : theme === 'dark'
                      ? 'border-white/20 hover:border-violet-400/40 hover:bg-violet-500/[0.04]'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50'
                }`}
              >
                <motion.div
                  animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                  className={`p-4 rounded-2xl transition-colors ${
                    dragOver
                      ? theme === 'dark' ? 'bg-violet-500/20' : 'bg-indigo-100'
                      : theme === 'dark' ? 'bg-gradient-to-br from-violet-500/15 to-indigo-500/15' : 'bg-gray-50'
                  }`}
                >
                  <IconUpload className={`w-8 h-8 ${
                    dragOver
                      ? theme === 'dark' ? 'text-violet-300' : 'text-indigo-500'
                      : theme === 'dark' ? 'text-violet-400/60' : 'text-gray-300'
                  }`} />
                </motion.div>
                <div className="text-center px-6">
                  <p className={`text-[15px] font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-700'}`}>
                    {dragOver ? "Suelta aquí" : "Seleccionar de galería"}
                  </p>
                  <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Fotos y videos · Máx. 25 MB fotos, 200 MB videos</p>
                </div>
              </div>
            ) : (
              /* Has files — compact add more */
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl py-4 flex items-center justify-center gap-2 transition-all ${
                  dragOver
                    ? theme === 'dark' ? 'border-violet-400/70 bg-violet-500/[0.08]' : 'border-indigo-400 bg-indigo-50'
                    : theme === 'dark' ? 'border-white/15 hover:border-violet-400/40 hover:bg-violet-500/[0.04]' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50'
                }`}
              >
                <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-violet-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Agregar más ({files.length}/{MAX_FILES})
                </span>
              </div>
            )}

            {/* Camera button */}
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className={`mt-2 w-full flex items-center justify-center gap-2.5 rounded-2xl border py-3.5 text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'border-white/10 text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <IconCamera className="w-5 h-5" />
              Tomar foto o video
            </button>
          </motion.div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 0) addFiles(selected);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 0) addFiles(selected);
            e.target.value = "";
          }}
        />

        {/* Description */}
        {files.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Escribe un mensaje (opcional)"
              rows={2}
              maxLength={300}
              className={`w-full rounded-2xl border px-4 py-3 text-sm resize-none transition-all focus:outline-none focus:ring-2 ${
                theme === 'dark'
                  ? 'border-white/10 bg-white/[0.04] text-white placeholder:text-gray-600 focus:ring-violet-500/25 focus:border-violet-500/40'
                  : 'border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:ring-indigo-500/30 focus:border-indigo-300'
              }`}
            />
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={`rounded-xl px-4 py-3 flex items-start gap-2 ${
                theme === 'dark' ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50'
              }`}
            >
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Partial success banner — some uploaded, some failed */}
        <AnimatePresence>
          {!uploading && doneCount > 0 && hasErrors && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={`rounded-xl px-4 py-3 flex items-start gap-2.5 border ${
                theme === 'dark' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200/50'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                theme === 'dark' ? 'bg-amber-500/40 border border-amber-400/40' : 'bg-amber-400'
              }`}>
                <span className="text-white text-xs font-bold">!</span>
              </div>
              <div>
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-amber-300' : 'text-amber-800'}`}>
                  {doneCount} de {files.length} {doneCount === 1 ? "se subió" : "se subieron"} correctamente
                </p>
                <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-amber-400/80' : 'text-amber-600'}`}>
                  Puedes reintentar los que fallaron tocando el botón de abajo.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        {uploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            <div className={`h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${files.length > 0 ? ((uploadedCount + 0.5) / files.length) * 100 : 0}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center justify-center gap-2">
              <Spinner className="w-4 h-4 text-indigo-500" />
              <p className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                Subiendo {Math.min(uploadedCount + 1, files.length)} de {files.length}
              </p>
            </div>
          </motion.div>
        )}

        {/* Submit button */}
        {files.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            type="button"
            disabled={files.length === 0 || uploading || files.every((e) => e.status === "done")}
            onClick={handleUpload}
            className={`w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-sm font-semibold text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none ${
              theme === 'dark'
                ? 'shadow-[0_8px_32px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.55)]'
                : 'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30'
            }`}
          >
            {uploading
              ? `Subiendo ${Math.min(uploadedCount + 1, files.length)} de ${files.length}…`
              : hasErrors
                ? "Reintentar fallidos"
                : files.length === 1
                  ? "Compartir momento"
                  : `Compartir ${files.length} momentos`}
          </motion.button>
        )}
        </div>
      </main>
    </div>
    </ThemeCtx.Provider>
  );
}

// ── Sub-screens ────────────────────────────────────────────────────────────────

function SuccessScreen({
  count,
  onUploadMore,
}: {
  count: number;
  onUploadMore?: () => void;
}) {
  const { theme } = useContext(ThemeCtx);
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden${theme === 'light' ? ' bg-white' : ''}`}>
      {/* Confetti dots */}
      {Array.from({ length: 16 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: -20, x: 0 }}
          animate={{
            opacity: [0, 1, 0],
            y: [-(20 + Math.random() * 40), 60 + Math.random() * 200],
            x: (Math.random() - 0.5) * 200,
          }}
          transition={{ duration: 1.5 + Math.random(), delay: 0.1 + Math.random() * 0.4, ease: "easeOut" }}
          className="absolute top-1/4 left-1/2 w-2 h-2 rounded-full"
          style={{
            backgroundColor: ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa", "#fb923c", "#e879f9"][i % 8],
          }}
        />
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-violet-500 to-indigo-500 shadow-[0_0_60px_rgba(139,92,246,0.55)]'
            : 'bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/30'
        }`}
      >
        <IconCheck className="w-12 h-12 text-white" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4"
      >
        <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {count === 1 ? "¡Momento compartido!" : `¡${count} momentos compartidos!`}
        </h2>
        <p className={`text-sm max-w-[280px] mx-auto leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
          {count === 1
            ? "Tu foto aparecerá en la galería del evento una vez que el organizador la apruebe."
            : `Tus ${count} archivos aparecerán en la galería del evento una vez que el organizador los apruebe.`}
        </p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-xs italic ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
        >
          ¡Gracias por ser parte de este momento especial!
        </motion.p>

        {onUploadMore && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={onUploadMore}
            className={`mt-2 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] ${
              theme === 'dark'
                ? 'shadow-[0_8px_32px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.55)]'
                : 'shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30'
            }`}
          >
            Subir más fotos o videos
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}

function ComingSoonScreen({ identifier }: { identifier: string }) {
  const { theme } = useContext(ThemeCtx);
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden${theme === 'light' ? ' bg-white' : ''}`}>
      {/* Floating decorative dots */}
      {Array.from({ length: 10 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 4 + (i % 3) * 4,
            height: 4 + (i % 3) * 4,
            left: `${8 + i * 9}%`,
            top: `${12 + (i % 4) * 20}%`,
            backgroundColor: ['#a78bfa', '#818cf8', '#c084fc', '#6366f1', '#8b5cf6'][i % 5],
          }}
          animate={{
            y: [0, -8 - (i % 3) * 4, 0],
            opacity: [0.25, 0.55, 0.25],
            scale: [1, 1.15, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 3 + i * 0.4,
            delay: i * 0.25,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Icon */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative mb-8"
      >
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-violet-500 to-indigo-500 shadow-[0_0_50px_rgba(139,92,246,0.45)]'
            : 'bg-gradient-to-br from-violet-400 to-indigo-500 shadow-lg shadow-indigo-500/25'
        }`}>
          <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
        </div>
        {/* Pulse ring */}
        <motion.div
          className={`absolute inset-0 rounded-full border-2 ${theme === 'dark' ? 'border-violet-400/60' : 'border-indigo-300'}`}
          animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
        />
      </motion.div>

      {/* Text content */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4 max-w-sm"
      >
        <h2 className={`text-2xl font-bold tracking-tight leading-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Pronto podras compartir tus mejores momentos
        </h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`text-sm leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
        >
          El organizador esta preparando todo para que puedas subir tus fotos y videos del evento. Vuelve en un momento.
        </motion.p>
      </motion.div>

      {/* Activity indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-10 flex items-center gap-2.5"
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${theme === 'dark' ? 'bg-violet-400' : 'bg-indigo-400'}`}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: "easeInOut" }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400 font-medium">Preparando el evento</span>
      </motion.div>
    </div>
  );
}

function ThankYouScreen({ eventName, identifier }: { eventName: string; identifier: string }) {
  const { theme } = useContext(ThemeCtx);
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden${theme === 'light' ? ' bg-white' : ''}`}>
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-amber-300/40 text-lg pointer-events-none"
          style={{ left: `${10 + i * 11}%`, top: `${15 + (i % 3) * 25}%` }}
          animate={{ y: [0, -12, 0], opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2.5 + i * 0.3, delay: i * 0.3, ease: "easeInOut" }}
        >
          ✦
        </motion.div>
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-8 shadow-lg shadow-amber-500/20"
      >
        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
          Gracias por compartir tus<br />mejores momentos
        </h2>
        {eventName && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-lg font-medium text-gray-600">
            {eventName}
          </motion.p>
        )}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-gray-400 text-sm max-w-[300px] mx-auto leading-relaxed">
          Estamos muy agradecidos de que hayas sido parte de este día tan especial
        </motion.p>
        <motion.a
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          href={`/e/${identifier}/momentos`}
          className="inline-flex items-center gap-2 mt-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-xl active:scale-[0.98] transition-all"
        >
          Ver el muro de momentos
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </motion.a>
      </motion.div>
    </div>
  );
}

// ── Theme toggle button ────────────────────────────────────────────────────────
function ThemeToggleButton() {
  const { theme, toggle } = useContext(ThemeCtx);
  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={{ scale: 0.9 }}
      className={`fixed top-4 right-4 z-50 flex items-center justify-center w-9 h-9 rounded-full border transition-all ${
        theme === 'dark'
          ? 'bg-white/10 border-white/15 text-gray-300 hover:bg-white/20'
          : 'bg-black/5 border-black/10 text-gray-500 hover:bg-black/10'
      }`}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </motion.button>
  );
}

// ── Dark background with ambient light blobs ──────────────────────────────────

function DarkBackground() {
  const { theme } = useContext(ThemeCtx);
  if (theme === 'light') return null;
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-gray-950 pointer-events-none">
      {/* Blob 1 — violet, top-left */}
      <motion.div
        animate={{ y: [0, -24, 0] }}
        transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
        className="absolute -top-20 -left-20 w-[420px] h-[420px] rounded-full bg-violet-600/20 blur-[120px]"
      />
      {/* Blob 2 — indigo, top-right */}
      <motion.div
        animate={{ y: [0, 20, 0] }}
        transition={{ repeat: Infinity, duration: 13, ease: "easeInOut", delay: 2 }}
        className="absolute top-10 -right-16 w-[320px] h-[320px] rounded-full bg-indigo-500/15 blur-[100px]"
      />
      {/* Blob 3 — blue, bottom-center */}
      <motion.div
        animate={{ y: [0, -16, 0] }}
        transition={{ repeat: Infinity, duration: 11, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full bg-blue-600/10 blur-[140px]"
      />
    </div>
  );
}
