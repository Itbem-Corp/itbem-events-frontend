"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Camera, Check, LoaderCircle, Play, X } from "lucide-react";
import type { UploadPreviewItem } from "./UploadPreviewDialog";

export type UploadMediaStatus = "pending" | "uploading" | "done" | "error";

export interface UploadMediaPreviewCardProps {
  id: string;
  fileName: string;
  fileSize: number;
  previewUrl: string;
  videoThumbUrl?: string;
  isVideo: boolean;
  status: UploadMediaStatus;
  errorMsg?: string;
  progress?: number;
  subtitle?: string;
  uploading: boolean;
  theme: "dark" | "light";
  shouldReduceMotion: boolean;
  onOpenPreview: (item: UploadPreviewItem) => void;
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadMediaPreviewCardComponent({
  id,
  fileName,
  fileSize,
  previewUrl,
  videoThumbUrl,
  isVideo,
  status,
  errorMsg,
  progress,
  subtitle,
  uploading,
  theme,
  shouldReduceMotion,
  onOpenPreview,
  onRemove,
}: UploadMediaPreviewCardProps) {
  return (
    <motion.div
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: "spring", damping: 20, stiffness: 300 }
      }
      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-2xl transition-all duration-200 motion-reduce:transition-none ${
        status === "uploading"
          ? "ring-2 ring-amber-400/60 shadow-[0_0_14px_rgba(251,191,36,0.35)]"
          : status === "done"
            ? "ring-2 ring-green-400/60 shadow-[0_0_14px_rgba(52,211,153,0.45)]"
            : status === "error"
              ? "ring-2 ring-red-400/60 shadow-[0_0_14px_rgba(248,113,113,0.45)]"
              : theme === "dark"
                ? "bg-gray-800 ring-1 ring-white/10 hover:scale-[1.02] hover:ring-white/25 motion-reduce:hover:scale-100"
                : "bg-gray-100 ring-1 ring-gray-200 hover:scale-[1.02] hover:ring-gray-300 motion-reduce:hover:scale-100"
      }`}
    >
      <button
        type="button"
        disabled={uploading}
        aria-haspopup="dialog"
        aria-label={`Abrir vista previa de ${fileName}`}
        onPointerEnter={preloadUploadPreviewDialog}
        onPointerDown={preloadUploadPreviewDialog}
        onFocus={preloadUploadPreviewDialog}
        onClick={() =>
          onOpenPreview({
            kind: isVideo ? "video" : previewUrl === "heic" ? "heic" : "image",
            name: fileName,
            sizeLabel: formatSize(fileSize),
            src: previewUrl === "heic" ? null : previewUrl,
          })
        }
        className="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:cursor-default"
      />

      {isVideo ? (
        videoThumbUrl ? (
          <img
            src={videoThumbUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
            <Play aria-hidden="true" className="h-8 w-8 text-white/40" />
          </div>
        )
      ) : previewUrl === "heic" ? (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-1 ${
            theme === "dark"
              ? "bg-gradient-to-br from-gray-700 to-gray-800"
              : "bg-gradient-to-br from-gray-200 to-gray-300"
          }`}
        >
          <Camera
            aria-hidden="true"
            className={`h-6 w-6 ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
          />
          <p
            className={`w-full truncate text-center text-[9px] font-medium leading-tight ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
          >
            {fileName}
          </p>
        </div>
      ) : (
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {isVideo && status === "pending" && (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 py-0.5 pl-1.5 pr-2 backdrop-blur-sm">
          <Play aria-hidden="true" className="h-3 w-3 text-white" />
          <span className="text-[10px] font-medium text-white">
            {formatSize(fileSize)}
          </span>
        </div>
      )}

      {status === "uploading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
          {(progress ?? 0) > 0 ? (
            <>
              <span className="text-xs font-semibold text-white">
                {progress}%
              </span>
              <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white transition-all duration-300 motion-reduce:transition-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {subtitle && (
                <span className="px-1 text-center text-[9px] font-medium leading-none text-white/70">
                  {subtitle}
                </span>
              )}
            </>
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="h-7 w-7 animate-spin text-white motion-reduce:animate-none"
            />
          )}
        </div>
      )}

      {status === "done" && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-green-500/20 backdrop-blur-[1px]"
        >
          <motion.div
            initial={shouldReduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 400, damping: 15 }
            }
            className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 shadow-lg"
          >
            <Check aria-hidden="true" className="h-5 w-5 text-white" />
          </motion.div>
        </motion.div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 backdrop-blur-[1px]">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 shadow-lg"
            title={errorMsg}
          >
            <X aria-hidden="true" className="h-5 w-5 text-white" />
          </div>
        </div>
      )}

      {(status === "pending" || status === "error") && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => onRemove(id)}
          className="absolute right-0.5 top-0.5 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-black/50 p-2 text-white opacity-80 backdrop-blur-sm transition-all hover:bg-black/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default disabled:opacity-0 motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Quitar ${fileName}`}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}

function preloadUploadPreviewDialog() {
  void import("./UploadPreviewDialog").catch(() => {
    // Speculative loading should never interrupt file selection.
  });
}

export function areUploadMediaPreviewCardPropsEqual(
  previous: Readonly<UploadMediaPreviewCardProps>,
  next: Readonly<UploadMediaPreviewCardProps>,
): boolean {
  return (
    previous.id === next.id &&
    previous.fileName === next.fileName &&
    previous.fileSize === next.fileSize &&
    previous.previewUrl === next.previewUrl &&
    previous.videoThumbUrl === next.videoThumbUrl &&
    previous.isVideo === next.isVideo &&
    previous.status === next.status &&
    previous.errorMsg === next.errorMsg &&
    previous.progress === next.progress &&
    previous.subtitle === next.subtitle &&
    previous.uploading === next.uploading &&
    previous.theme === next.theme &&
    previous.shouldReduceMotion === next.shouldReduceMotion &&
    previous.onOpenPreview === next.onOpenPreview &&
    previous.onRemove === next.onRemove
  );
}

export const UploadMediaPreviewCard = memo(
  UploadMediaPreviewCardComponent,
  areUploadMediaPreviewCardPropsEqual,
);

UploadMediaPreviewCard.displayName = "UploadMediaPreviewCard";
