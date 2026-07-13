"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle } from "lucide-react";
import {
  UploadMediaPreviewCard,
  type UploadMediaStatus,
} from "./UploadMediaPreviewCard";
import type { UploadPreviewItem } from "./UploadPreviewDialog";

const loadUploadPreviewDialog = () => import("./UploadPreviewDialog");
const UploadPreviewDialog = lazy(async () => {
  const module = await loadUploadPreviewDialog();
  return { default: module.UploadPreviewDialog };
});

export type { UploadMediaStatus } from "./UploadMediaPreviewCard";

export interface UploadMediaPreviewEntry {
  id: string;
  file: { name: string; size: number };
  previewUrl: string;
  isVideo: boolean;
  status: UploadMediaStatus;
  errorMsg?: string;
  progress?: number;
  subtitle?: string;
}

interface UploadMediaPreviewGridProps {
  entries: readonly UploadMediaPreviewEntry[];
  videoThumbs: ReadonlyMap<string, string>;
  uploading: boolean;
  theme: "dark" | "light";
  onRemove: (id: string) => void;
}

function Spinner() {
  return (
    <LoaderCircle
      aria-hidden="true"
      className="h-7 w-7 animate-spin text-white motion-reduce:animate-none"
    />
  );
}

function PreviewLoadingOverlay() {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      role="status"
      aria-live="polite"
      aria-label="Cargando vista previa"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-medium text-white/90 backdrop-blur-lg">
        <Spinner />
        Preparando vista previa…
      </div>
    </div>,
    document.body,
  );
}

export function UploadMediaPreviewGrid({
  entries,
  videoThumbs,
  uploading,
  theme,
  onRemove,
}: UploadMediaPreviewGridProps) {
  const [previewItem, setPreviewItem] = useState<UploadPreviewItem | null>(
    null,
  );
  const shouldReduceMotion = Boolean(useReducedMotion());
  const onRemoveRef = useRef(onRemove);

  useEffect(() => {
    onRemoveRef.current = onRemove;
  }, [onRemove]);

  const handleOpenPreview = useCallback((item: UploadPreviewItem) => {
    setPreviewItem(item);
  }, []);
  const handleClosePreview = useCallback(() => {
    setPreviewItem(null);
  }, []);
  const handleRemove = useCallback((id: string) => {
    onRemoveRef.current(id);
  }, []);

  return (
    <>
      <AnimatePresence>
        {previewItem && (
          <Suspense fallback={<PreviewLoadingOverlay />}>
            <UploadPreviewDialog
              item={previewItem}
              onClose={handleClosePreview}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        className="grid grid-cols-3 gap-2"
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <UploadMediaPreviewCard
              key={entry.id}
              id={entry.id}
              fileName={entry.file.name}
              fileSize={entry.file.size}
              previewUrl={entry.previewUrl}
              videoThumbUrl={
                entry.isVideo ? videoThumbs.get(entry.id) : undefined
              }
              isVideo={entry.isVideo}
              status={entry.status}
              errorMsg={entry.errorMsg}
              progress={entry.progress}
              subtitle={entry.subtitle}
              uploading={uploading}
              theme={theme}
              shouldReduceMotion={shouldReduceMotion}
              onOpenPreview={handleOpenPreview}
              onRemove={handleRemove}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
