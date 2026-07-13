"use client";

import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import { flushSync } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useToast } from "../hooks/useToast";
import ToastList from "./common/Toast";
import PublicEventPasswordGate from "./common/PublicEventPasswordGate";
import { InvalidUploadLinkState } from "./InvalidUploadLinkState";
import { UploadStatusErrorState } from "./shared-upload/UploadStatusErrorState";
import { UploadStatusLoadingState } from "./shared-upload/UploadStatusLoadingState";
import { UploadThemeToggle } from "./shared-upload/UploadThemeToggle";
import { usePublicEventAccess } from "../hooks/usePublicEventAccess";
import { normalizeEventsUrl } from "../lib/eventsUrl";
import {
  publicAccessFetchInit,
  publicAccessQueryParams,
  readPublicAccessParams,
  resolvePublicAccessParams,
} from "../lib/publicPreview";
import {
  buildEventMomentsPath,
  getSharedUploadIdentifier,
} from "../lib/sharedUploadIdentifier";
import {
  getSharedUploadGate,
  isSharedUploadOpen,
} from "../lib/sharedUploadAccess";
import { buildEventMomentsUrl } from "../lib/apiUrls";
import { fetchApiData, isApiFetchError } from "../lib/apiFetch";
import {
  classifyUploadStatusError,
  type UploadStatusError,
} from "../lib/uploadStatusError";
import {
  normalizePublicMomentsPage,
  normalizePublicMomentUploadResponse,
  type PublicMoment,
} from "../lib/publicMoments";
import {
  getSelectableUploadSlots,
  getSelectableUploadSlotsWithPending,
  getUploadDisplayLimit,
  readUploadQuota,
  reconcileUploadQuotaRemaining,
} from "../lib/uploadQuota";
import {
  UPLOAD_FILE_ACCEPT as FILE_ACCEPT,
  validateUploadFile as validateFile,
} from "../lib/uploadFilePolicy";
import {
  loadSharedUploadEngineForAction,
  preloadSharedUploadEngine,
} from "./shared-upload/loadSharedUploadEngine";
import type { SharedUploadFileEntry } from "./shared-upload/SharedUploadEngine";
const loadUploadMediaPreviewGrid = () => import("./UploadMediaPreviewGrid");
const UploadMediaPreviewGrid = lazy(async () => {
  const module = await loadUploadMediaPreviewGrid();
  return { default: module.UploadMediaPreviewGrid };
});

function preloadUploadMediaPreviewGrid() {
  void loadUploadMediaPreviewGrid().catch(() => {
    // File validation remains usable if speculative chunk loading is interrupted.
  });
}

const CAMERA_FILE_ACCEPT = `${FILE_ACCEPT},image/*,video/*`;

// ── Theme toggle ──────────────────────────────────────────────────────────────
type Theme = "dark" | "light";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const stored = localStorage.getItem("upload-theme");
      return stored === "dark" || stored === "light" ? stored : "dark";
    } catch {
      return "dark";
    }
  });
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("upload-theme", next);
      } catch {
        // Keep the in-memory preference when storage is restricted.
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

function getIdentifierFromURL(): string {
  if (typeof window === "undefined") return "";
  return getSharedUploadIdentifier(
    window.location.pathname,
    window.location.search,
  );
}

function getPublicUploadBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(
    /^(.*?)\/events(?:\/[^/]+)?\/upload\/?$/,
  );
  return match?.[1] ?? "";
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_FILES = 10;

// ── Upload state ───────────────────────────────────────────────────────────────
type SharedUploadPublicationHint =
  "published" | "processing" | "pending_review";

function uploadHintForMoment(
  moment: PublicMoment | null,
): SharedUploadPublicationHint {
  if (moment?.publication_status === "published") return "published";
  if (
    moment?.publication_status === "processing" ||
    moment?.approval_status === "approved"
  ) {
    return "processing";
  }
  return "pending_review";
}

function mergeUploadPublicationHint(
  current: SharedUploadPublicationHint,
  next: SharedUploadPublicationHint,
): SharedUploadPublicationHint {
  if (current === "pending_review" || next === "pending_review") {
    return "pending_review";
  }
  if (current === "processing" || next === "processing") {
    return "processing";
  }
  return "published";
}

type FileEntry = SharedUploadFileEntry;

// ── Reusable icons ─────────────────────────────────────────────────────────────

function IconCamera({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
      />
    </svg>
  );
}

function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}

function IconUpload({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function Spinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Upload worker pool ─────────────────────────────────────────────────────────

// ── Multipart helpers ─────────────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────────────────────

interface UploadPageProps {
  EVENTS_URL: string;
}

export default function SharedUploadPage({
  EVENTS_URL: rawEventsUrl,
}: UploadPageProps) {
  const EVENTS_URL = normalizeEventsUrl(rawEventsUrl);
  const [theme, toggleTheme] = useTheme();
  const identifier = getIdentifierFromURL();
  const initialAccessParams =
    typeof window === "undefined"
      ? {
          previewToken: "",
          cacheKey: "",
          invitationToken: "",
          accessToken: "",
        }
      : readPublicAccessParams(window.location.search);
  const eventAccess = usePublicEventAccess({
    eventsUrl: EVENTS_URL,
    identifier,
    previewToken: initialAccessParams.previewToken,
    previewCacheKey: initialAccessParams.cacheKey,
    invitationToken: initialAccessParams.invitationToken,
    accessToken: initialAccessParams.accessToken,
    enabled: Boolean(identifier),
  });
  const accessToken = eventAccess.accessToken;
  const [files, setFiles] = useState<FileEntry[]>([]);
  const filesRef = useRef<FileEntry[]>([]);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const pendingSelectionSlotsRef = useRef(0);
  const selectionPreparationCountRef = useRef(0);
  const selectionAbortControllersRef = useRef(new Set<AbortController>());
  const mountedRef = useRef(true);
  const quotaAbortControllerRef = useRef<AbortController | null>(null);
  const [videoThumbs, setVideoThumbs] = useState<Map<string, string>>(
    new Map(),
  );
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadsRemaining, setUploadsRemaining] = useState<number | null>(null);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [wallPublished, setWallPublished] = useState(false);
  const [wallEventName, setWallEventName] = useState("");
  const [uploadsNotEnabled, setUploadsNotEnabled] = useState(false);
  const [uploadStatusError, setUploadStatusError] =
    useState<UploadStatusError | null>(null);
  const [quotaRetrying, setQuotaRetrying] = useState(false);
  const [allowMessages, setAllowMessages] = useState(true);
  const [uploadPublicationHint, setUploadPublicationHint] =
    useState<SharedUploadPublicationHint>("pending_review");
  const uploadPublicationHintRef =
    useRef<SharedUploadPublicationHint>("published");

  const commitFiles = useCallback(
    (updater: (entries: FileEntry[]) => FileEntry[]) => {
      setFiles((previous) => {
        const next = updater(previous);
        filesRef.current = next;
        return next;
      });
    },
    [],
  );

  const { toasts, addToast, removeToast } = useToast();

  const [isPreparing, setIsPreparing] = useState(false);
  const pickerOpenRef = useRef(false);
  const preparingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const applyUploadQuota = useCallback((payload: unknown) => {
    const quota = readUploadQuota(payload);
    if (quota.remaining !== null) {
      setUploadsRemaining((prev) =>
        reconcileUploadQuotaRemaining(prev, quota.remaining),
      );
    }
  }, []);

  const currentPublicAccessFetchInit = useCallback(
    (init?: RequestInit): RequestInit | undefined => {
      const accessParams =
        typeof window === "undefined"
          ? { previewToken: "", invitationToken: "", accessToken: "" }
          : resolvePublicAccessParams({ accessToken }, window.location.search);
      return publicAccessFetchInit(accessParams, init);
    },
    [accessToken],
  );

  const fetchUploadApiData = useCallback(
    async <T,>(
      input: RequestInfo | URL,
      init?: RequestInit,
      fallbackMessage?: string,
    ): Promise<T> => {
      try {
        const data = await fetchApiData<T>(
          input,
          currentPublicAccessFetchInit(init),
          fallbackMessage,
        );
        applyUploadQuota(data);
        return data;
      } catch (error) {
        if (isApiFetchError(error)) {
          applyUploadQuota(error.payload);
        }
        throw error;
      }
    },
    [applyUploadQuota, currentPublicAccessFetchInit],
  );

  const currentPublicAccessQuery = useCallback(() => {
    if (typeof window === "undefined") return {};
    return publicAccessQueryParams(
      resolvePublicAccessParams({ accessToken }, window.location.search),
    );
  }, [accessToken]);

  const recordUploadPublicationHint = useCallback((payload: unknown) => {
    const moment = normalizePublicMomentUploadResponse(payload);
    const next = mergeUploadPublicationHint(
      uploadPublicationHintRef.current,
      uploadHintForMoment(moment),
    );
    uploadPublicationHintRef.current = next;
    setUploadPublicationHint(next);
    return moment;
  }, []);

  const checkQuota = useCallback(
    async (id: string) => {
      if (!id) return;
      quotaAbortControllerRef.current?.abort();
      const controller = new AbortController();
      quotaAbortControllerRef.current = controller;
      try {
        const data = normalizePublicMomentsPage(
          await fetchUploadApiData<unknown>(
            buildEventMomentsUrl(EVENTS_URL, id, {
              page: 1,
              limit: 1,
              purpose: "upload",
              ...currentPublicAccessQuery(),
            }),
            { cache: "no-store", signal: controller.signal },
          ),
        );
        const quota = readUploadQuota(data);
        if (quota.remaining !== null) {
          setUploadsRemaining(quota.remaining);
        }
        const shareEnabled = isSharedUploadOpen({
          allowUploads: data.allow_uploads,
          shareUploadsEnabled: data.share_uploads_enabled,
        });
        setAllowMessages(data.allow_messages !== false);
        setUploadsNotEnabled(!shareEnabled);
        setUploadStatusError(null);
        const wallIsPublished =
          data.moments_wall_published ?? data.published ?? false;
        setWallPublished(wallIsPublished);
        if (wallIsPublished) {
          if (typeof data.event_name === "string")
            setWallEventName(data.event_name);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setUploadStatusError(classifyUploadStatusError(error));
      } finally {
        if (quotaAbortControllerRef.current === controller) {
          quotaAbortControllerRef.current = null;
          if (mountedRef.current) setQuotaLoaded(true);
        }
      }
    },
    [EVENTS_URL, currentPublicAccessQuery, fetchUploadApiData],
  );

  async function retryQuota() {
    if (!identifier || quotaRetrying) return;
    setQuotaRetrying(true);
    try {
      await checkQuota(identifier);
    } finally {
      if (mountedRef.current) setQuotaRetrying(false);
    }
  }

  useEffect(() => {
    if (!identifier) return;
    if (!eventAccess.ready) return;
    if (eventAccess.passwordRequired) {
      setQuotaLoaded(true);
      return;
    }
    setQuotaLoaded(false);
    setUploadStatusError(null);
    void checkQuota(identifier);
  }, [identifier, eventAccess.ready, eventAccess.passwordRequired, checkQuota]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Cleanup the latest object URLs on unmount without revoking live previews.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      quotaAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current?.abort();
      selectionAbortControllersRef.current.forEach((controller) =>
        controller.abort(),
      );
      selectionAbortControllersRef.current.clear();
      filesRef.current.forEach((e) => {
        if (e.previewUrl && e.previewUrl !== "heic")
          URL.revokeObjectURL(e.previewUrl);
      });
    };
  }, []);

  // Detect iOS gallery picker close → show "preparing" overlay until onChange fires
  useEffect(() => {
    const onFocus = () => {
      if (pickerOpenRef.current) {
        setIsPreparing(true);
        pickerOpenRef.current = false;
        // Safety valve: auto-dismiss if onChange never fires (e.g. picker cancelled, permission denied)
        if (preparingTimerRef.current) clearTimeout(preparingTimerRef.current);
        preparingTimerRef.current = setTimeout(
          () => setIsPreparing(false),
          8000,
        );
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onFocus();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (preparingTimerRef.current) clearTimeout(preparingTimerRef.current);
    };
  }, []);

  const addFiles = async (incoming: File[]) => {
    if (uploading) return;
    preloadUploadMediaPreviewGrid();
    setError("");

    const pendingSlots = pendingSelectionSlotsRef.current;
    const currentFiles = filesRef.current;
    const reservedQuotaCount = currentFiles.filter(
      (entry) => entry.status !== "done",
    ).length;
    const remaining = getSelectableUploadSlotsWithPending({
      currentBatchCount: currentFiles.length,
      reservedQuotaCount,
      pendingSelectionCount: pendingSlots,
      perBatchLimit: MAX_FILES,
      quotaRemaining: uploadsRemaining,
    });
    if (remaining <= 0) {
      const quotaReached =
        uploadsRemaining !== null &&
        uploadsRemaining <= reservedQuotaCount + pendingSlots;
      const message = quotaReached
        ? "Ya alcanzaste el límite de archivos permitidos para este evento."
        : "Máximo " + MAX_FILES + " archivos por subida.";
      setError(message);
      addToast(message, "error");
      return;
    }

    const toAdd = incoming.slice(0, remaining);
    const errors: string[] = [];
    const acceptedFiles: File[] = [];
    for (const file of toAdd) {
      const validationError = validateFile(file);
      if (validationError) errors.push(validationError);
      else acceptedFiles.push(file);
    }

    if (incoming.length > remaining) {
      const ignoredCount = incoming.length - remaining;
      errors.push(
        uploadsRemaining === null
          ? "Se ignoraron " +
              ignoredCount +
              " archivo(s) — máximo " +
              MAX_FILES +
              "."
          : "Se ignoraron " +
              ignoredCount +
              " archivo(s) — cupo disponible: " +
              remaining +
              ".",
      );
      addToast(
        uploadsRemaining === null
          ? "Solo se agregaron " +
              remaining +
              " de " +
              incoming.length +
              " archivos (límite: " +
              MAX_FILES +
              ")"
          : "Solo se agregaron " +
              remaining +
              " de " +
              incoming.length +
              " archivos (cupo disponible)",
        "error",
      );
    }

    if (acceptedFiles.length === 0) {
      if (errors.length > 0) setError(errors.join(" "));
      return;
    }

    const reservedSlots = acceptedFiles.length;
    pendingSelectionSlotsRef.current += reservedSlots;
    selectionPreparationCountRef.current += 1;
    setIsPreparing(true);
    const preparationController = new AbortController();
    selectionAbortControllersRef.current.add(preparationController);

    try {
      const engine = await loadSharedUploadEngineForAction();
      if (preparationController.signal.aborted) return;

      const { validEntries, rejectedVideoEntries } =
        await engine.prepareSharedUploadEntries(
          acceptedFiles,
          preparationController.signal,
        );
      if (preparationController.signal.aborted || !mountedRef.current) {
        validEntries.forEach((entry) => {
          if (entry.previewUrl && entry.previewUrl !== "heic") {
            URL.revokeObjectURL(entry.previewUrl);
          }
        });
        return;
      }

      if (rejectedVideoEntries.length > 0) {
        addToast(
          rejectedVideoEntries.length === 1
            ? "Un video supera el límite de 5 minutos y no fue agregado"
            : rejectedVideoEntries.length +
                " videos superan el límite de 5 minutos y no fueron agregados",
          "error",
        );
      }

      if (validEntries.length > 0) {
        commitFiles((previous) => [...previous, ...validEntries]);

        validEntries
          .filter((entry) => entry.isVideo)
          .forEach((entry) => {
            void engine
              .extractSharedUploadVideoThumbnail(entry.previewUrl)
              .then((thumbnail) => {
                if (!thumbnail || !mountedRef.current) return;
                setVideoThumbs((previous) => {
                  if (
                    !filesRef.current.some(
                      (candidate) => candidate.id === entry.id,
                    )
                  ) {
                    return previous;
                  }
                  return new Map(previous).set(entry.id, thumbnail);
                });
              });
          });

        validEntries
          .filter((entry) => entry.isHeic)
          .forEach((entry) => {
            void engine
              .convertSharedUploadHeic(entry.file)
              .then((converted) => {
                if (!converted || !mountedRef.current) return;
                commitFiles((previous) => {
                  const match = previous.find(
                    (candidate) => candidate.id === entry.id,
                  );
                  if (!match) return previous;
                  const newPreview = URL.createObjectURL(converted);
                  return previous.map((candidate) =>
                    candidate.id === entry.id
                      ? {
                          ...candidate,
                          file: converted,
                          previewUrl: newPreview,
                          isHeic: false,
                        }
                      : candidate,
                  );
                });
              });
          });
      }

      if (errors.length > 0) setError(errors.join(" "));
    } catch (preparationError) {
      if (
        preparationController.signal.aborted ||
        (preparationError instanceof Error &&
          preparationError.name === "AbortError")
      ) {
        return;
      }
      const message =
        "No pudimos preparar tus archivos. Revisa tu conexión e intenta de nuevo.";
      if (mountedRef.current) {
        setError(message);
        addToast(message, "error");
      }
    } finally {
      pendingSelectionSlotsRef.current = Math.max(
        0,
        pendingSelectionSlotsRef.current - reservedSlots,
      );
      selectionAbortControllersRef.current.delete(preparationController);
      selectionPreparationCountRef.current = Math.max(
        0,
        selectionPreparationCountRef.current - 1,
      );
      if (selectionPreparationCountRef.current === 0 && mountedRef.current) {
        setIsPreparing(false);
      }
    }
  };

  const removeFile = (id: string) => {
    if (uploading || selectionPreparationCountRef.current > 0) return;
    commitFiles((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry?.previewUrl && entry.previewUrl !== "heic") {
        URL.revokeObjectURL(entry.previewUrl);
      }
      return prev.filter((e) => e.id !== id);
    });
    setVideoThumbs((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading || selectionPreparationCountRef.current > 0) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  };

  const handleUpload = async () => {
    if (
      files.length === 0 ||
      !identifier ||
      uploading ||
      selectionPreparationCountRef.current > 0
    ) {
      return;
    }
    const completedBeforeAttempt = files.filter(
      (entry) => entry.status === "done",
    ).length;
    const startsFreshBatch = completedBeforeAttempt === 0;

    // Preserve the same-frame INP guarantee: no await may move above this block.
    flushSync(() => {
      setUploading(true);
      setError("");
      setUploadedCount(completedBeforeAttempt);
      if (startsFreshBatch) setUploadPublicationHint("published");
    });
    if (startsFreshBatch) uploadPublicationHintRef.current = "published";
    uploadAbortControllerRef.current?.abort();
    const uploadController = new AbortController();
    uploadAbortControllerRef.current = uploadController;

    let engine: Awaited<ReturnType<typeof loadSharedUploadEngineForAction>>;
    try {
      engine = await loadSharedUploadEngineForAction();
    } catch {
      if (uploadAbortControllerRef.current === uploadController) {
        uploadAbortControllerRef.current = null;
      }
      if (uploadController.signal.aborted) return;
      setError(
        "No pudimos iniciar la subida. Revisa tu conexión e intenta de nuevo.",
      );
      setUploading(false);
      return;
    }
    if (uploadController.signal.aborted) return;

    let result: Awaited<ReturnType<typeof engine.uploadSharedFiles>>;
    try {
      result = await engine.uploadSharedFiles({
        eventsUrl: EVENTS_URL,
        identifier,
        files,
        description,
        descriptionEntryId: files[0]?.id ?? "",
        allowMessages,
        initialUploadedCount: completedBeforeAttempt,
        signal: uploadController.signal,
        fetchUploadApiData,
        publicAccessQuery: currentPublicAccessQuery,
        publicAccessFetchInit: currentPublicAccessFetchInit,
        updateFiles: commitFiles,
        onUploadedCount: setUploadedCount,
        onError: setError,
        onPublicationResponse: (payload) => {
          recordUploadPublicationHint(payload);
        },
      });
    } catch (uploadError) {
      if (uploadAbortControllerRef.current === uploadController) {
        uploadAbortControllerRef.current = null;
      }
      if (uploadController.signal.aborted) return;
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Ocurrió un error inesperado. Intenta de nuevo.",
      );
      setUploading(false);
      return;
    }
    if (uploadAbortControllerRef.current === uploadController) {
      uploadAbortControllerRef.current = null;
    }

    if (result.abortedEarly) {
      setUploading(false);
      return;
    }
    if (result.connectionError) {
      setError(
        "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.",
      );
    }
    if (result.uploadsDisabled) {
      setUploadsNotEnabled(true);
      setUploading(false);
      return;
    }

    setUploading(false);
    commitFiles((previous) => {
      const allUploadsSucceeded = previous.every(
        (entry) => entry.status === "done",
      );
      if (allUploadsSucceeded && previous.length > 0) {
        if (uploadPublicationHintRef.current === "processing") {
          setOptimizing(true);
          window.setTimeout(() => {
            setOptimizing(false);
            setAllDone(true);
          }, 2000);
        } else {
          setAllDone(true);
        }
      }
      return previous;
    });
  };

  const handleUploadAnother = () => {
    files.forEach((e) => {
      if (e.previewUrl && e.previewUrl !== "heic")
        URL.revokeObjectURL(e.previewUrl);
    });
    commitFiles(() => []);
    setVideoThumbs(new Map());
    setDescription("");
    setAllDone(false);
    setUploadPublicationHint("pending_review");
    uploadPublicationHintRef.current = "published";
    setUploadedCount(0);
    setError("");
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  if (!identifier) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <div
          className={`relative isolate flex min-h-screen items-center justify-center px-6${theme === "light" ? " bg-gray-50" : ""}`}
        >
          <DarkBackground />
          <InvalidUploadLinkState theme={theme} />
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (!eventAccess.ready) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <div
          className={`relative isolate flex min-h-screen items-center justify-center px-6${theme === "light" ? " bg-gray-50" : ""}`}
        >
          <DarkBackground />
          <Spinner className="w-6 h-6 text-violet-400" />
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (eventAccess.passwordRequired) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <PublicEventPasswordGate
          title="Uploads privados"
          description="Ingresa la contrasena del evento para compartir tus momentos."
          className={theme === "dark" ? "bg-gray-950" : "bg-gray-50"}
          onVerify={eventAccess.verifyPassword}
        />
      </ThemeCtx.Provider>
    );
  }

  if (allDone) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <SuccessScreen
          count={uploadedCount}
          publicationHint={uploadPublicationHint}
          onUploadMore={handleUploadAnother}
        />
      </ThemeCtx.Provider>
    );
  }

  const sharedUploadGate = getSharedUploadGate({
    uploadsNotEnabled,
    wallPublished,
    quotaLoaded,
    uploadsRemaining,
  });

  if (!quotaLoaded) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <div
          className={`relative isolate flex min-h-screen items-center justify-center px-6 py-10${theme === "light" ? " bg-gray-50" : ""}`}
        >
          <DarkBackground />
          <UploadStatusLoadingState theme={theme} />
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (quotaLoaded && uploadStatusError) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <div
          className={`relative isolate flex min-h-screen items-center justify-center px-6 py-10${theme === "light" ? " bg-gray-50" : ""}`}
        >
          <DarkBackground />
          <UploadStatusErrorState
            theme={theme}
            kind={uploadStatusError.kind}
            retrying={quotaRetrying}
            onRetry={
              uploadStatusError.kind === "transient"
                ? () => void retryQuota()
                : undefined
            }
          />
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (sharedUploadGate === "published") {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <ThankYouScreen
          eventName={wallEventName}
          identifier={identifier}
          accessToken={accessToken}
        />
      </ThemeCtx.Provider>
    );
  }

  if (sharedUploadGate === "disabled") {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <ComingSoonScreen />
      </ThemeCtx.Provider>
    );
  }

  if (sharedUploadGate === "limit-reached") {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <UploadLimitReachedScreen />
      </ThemeCtx.Provider>
    );
  }

  if (optimizing) {
    return (
      <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
        <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
        <div
          className={`relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center${theme === "light" ? " bg-white" : ""}`}
        >
          <DarkBackground />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex flex-col items-center gap-4"
          >
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                theme === "dark"
                  ? "bg-gradient-to-br from-violet-600/30 to-indigo-600/30 ring-1 ring-violet-500/40"
                  : "bg-gradient-to-br from-violet-100 to-indigo-100 ring-1 ring-violet-300"
              }`}
            >
              <Spinner className="w-8 h-8 text-violet-500" />
            </div>
            <div className="space-y-1.5">
              <p
                className={`text-base font-semibold ${theme === "dark" ? "text-white" : "text-gray-900"}`}
              >
                Optimizando tus archivos…
              </p>
              <p
                className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
              >
                Esto solo toma unos segundos
              </p>
            </div>
          </motion.div>
        </div>
      </ThemeCtx.Provider>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const doneCount = files.filter((e) => e.status === "done").length;
  const hasErrors = files.some((e) => e.status === "error");
  const reservedQuotaCount = files.filter((e) => e.status !== "done").length;
  const selectableSlots = getSelectableUploadSlots({
    currentBatchCount: files.length,
    reservedQuotaCount,
    perBatchLimit: MAX_FILES,
    quotaRemaining: uploadsRemaining,
  });
  const displayMaxFiles = getUploadDisplayLimit(MAX_FILES, uploadsRemaining);
  const canAdd = selectableSlots > 0 && !uploading;

  // ── Main UI ────────────────────────────────────────────────────────────────

  return (
    <ThemeCtx.Provider value={{ theme, toggle: toggleTheme }}>
      <UploadThemeToggle theme={theme} onToggle={toggleTheme} />
      <ToastList toasts={toasts} onRemove={removeToast} />
      <div
        className={`relative isolate flex min-h-screen flex-col${theme === "light" ? " bg-gray-50" : ""}`}
      >
        <DarkBackground />

        {/* iOS gallery preparation overlay */}
        <AnimatePresence>
          {isPreparing && (
            <motion.div
              key="preparing"
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl backdrop-blur-md"
              style={{
                background: "rgba(24,24,27,0.92)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <svg
                className="w-4 h-4 text-pink-400 animate-spin shrink-0"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="text-sm text-white/90 font-medium whitespace-nowrap">
                Preparando archivos de tu galería…
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="px-4 sm:px-6 pt-8 sm:pt-12 pb-6 text-center">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              delay: 0.1,
            }}
            className={`inline-flex items-center justify-center w-16 h-16 rounded-[20px] mb-5 transition-colors ${
              theme === "dark"
                ? "bg-violet-500/20 border border-violet-500/30 shadow-[0_0_40px_rgba(139,92,246,0.25)]"
                : "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-indigo-500/25"
            }`}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`text-2xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}
          >
            Comparte tus momentos
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`mt-2 text-sm max-w-[280px] mx-auto leading-relaxed ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
          >
            Sube hasta {displayMaxFiles} fotos o videos para la galería del
            evento
          </motion.p>
        </header>

        {/* Main content */}
        <main className="flex-1 px-3 sm:px-5 pb-10 pt-2 max-w-md mx-auto w-full">
          <div
            className={`space-y-4 rounded-3xl p-4 sm:p-6 transition-all ${
              theme === "dark"
                ? "bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-2xl shadow-black/50"
                : "bg-white border border-gray-100 shadow-sm"
            }`}
          >
            {/* Media preview grid — loaded only after the first file is selected. */}
            {files.length > 0 && (
              <Suspense
                fallback={
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="status"
                    aria-label="Preparando archivos seleccionados"
                  >
                    {files.slice(0, 3).map((entry) => (
                      <div
                        key={entry.id}
                        className={`aspect-square animate-pulse rounded-2xl motion-reduce:animate-none ${
                          theme === "dark" ? "bg-white/10" : "bg-gray-100"
                        }`}
                      />
                    ))}
                  </div>
                }
              >
                <UploadMediaPreviewGrid
                  entries={files}
                  videoThumbs={videoThumbs}
                  uploading={uploading || isPreparing}
                  theme={theme}
                  onRemove={removeFile}
                />
              </Suspense>
            )}

            {/* Action buttons — gallery + camera */}
            {canAdd && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: files.length === 0 ? 0.25 : 0 }}
              >
                {files.length === 0 ? (
                  /* Empty state — large drop zone */
                  <button
                    type="button"
                    disabled={isPreparing}
                    onPointerEnter={preloadSharedUploadEngine}
                    onFocus={preloadSharedUploadEngine}
                    onTouchStart={preloadSharedUploadEngine}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => {
                      preloadSharedUploadEngine();
                      pickerOpenRef.current = true;
                      fileInputRef.current?.click();
                    }}
                    className={`w-full cursor-pointer border-2 border-dashed rounded-3xl aspect-[4/3] flex flex-col items-center justify-center gap-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${theme === "dark" ? "focus-visible:ring-offset-gray-950" : "focus-visible:ring-offset-white"} ${
                      dragOver
                        ? theme === "dark"
                          ? "border-violet-400/70 bg-violet-500/[0.08] shadow-[inset_0_0_40px_rgba(139,92,246,0.12)] scale-[1.01]"
                          : "border-indigo-400 bg-indigo-50 scale-[1.01]"
                        : theme === "dark"
                          ? "border-white/20 hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
                          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <motion.div
                      animate={dragOver ? { scale: 1.1 } : { scale: 1 }}
                      className={`p-4 rounded-2xl transition-colors ${
                        dragOver
                          ? theme === "dark"
                            ? "bg-violet-500/20"
                            : "bg-indigo-100"
                          : theme === "dark"
                            ? "bg-gradient-to-br from-violet-500/15 to-indigo-500/15"
                            : "bg-gray-50"
                      }`}
                    >
                      <IconUpload
                        className={`w-8 h-8 ${
                          dragOver
                            ? theme === "dark"
                              ? "text-violet-300"
                              : "text-indigo-500"
                            : theme === "dark"
                              ? "text-violet-400/60"
                              : "text-gray-300"
                        }`}
                      />
                    </motion.div>
                    <div className="text-center px-6">
                      <p
                        className={`text-[15px] font-semibold ${theme === "dark" ? "text-white" : "text-gray-700"}`}
                      >
                        {dragOver ? "Suelta aquí" : "Seleccionar de galería"}
                      </p>
                      <p
                        className={`text-xs mt-1 ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
                      >
                        Fotos y videos · Máx. 25 MB fotos, 200 MB videos ·
                        Máximo 5 min por video
                      </p>
                    </div>
                  </button>
                ) : (
                  /* Has files — compact add more */
                  <button
                    type="button"
                    disabled={isPreparing}
                    onPointerEnter={preloadSharedUploadEngine}
                    onFocus={preloadSharedUploadEngine}
                    onTouchStart={preloadSharedUploadEngine}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => {
                      preloadSharedUploadEngine();
                      pickerOpenRef.current = true;
                      fileInputRef.current?.click();
                    }}
                    className={`w-full cursor-pointer border-2 border-dashed rounded-2xl py-4 flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${theme === "dark" ? "focus-visible:ring-offset-gray-950" : "focus-visible:ring-offset-white"} ${
                      dragOver
                        ? theme === "dark"
                          ? "border-violet-400/70 bg-violet-500/[0.08]"
                          : "border-indigo-400 bg-indigo-50"
                        : theme === "dark"
                          ? "border-white/15 hover:border-violet-400/40 hover:bg-violet-500/[0.04]"
                          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <svg
                      className={`w-5 h-5 ${theme === "dark" ? "text-violet-400" : "text-gray-400"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4.5v15m7.5-7.5h-15"
                      />
                    </svg>
                    <span
                      className={`text-sm font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Agregar más ({files.length}/
                      {Math.min(MAX_FILES, files.length + selectableSlots)})
                    </span>
                  </button>
                )}

                {/* Camera button */}
                <button
                  type="button"
                  disabled={isPreparing}
                  onPointerEnter={preloadSharedUploadEngine}
                  onFocus={preloadSharedUploadEngine}
                  onTouchStart={preloadSharedUploadEngine}
                  onClick={() => {
                    preloadSharedUploadEngine();
                    pickerOpenRef.current = true;
                    cameraInputRef.current?.click();
                  }}
                  className={`mt-2 w-full flex items-center justify-center gap-2.5 rounded-2xl border py-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${theme === "dark" ? "focus-visible:ring-offset-gray-950" : "focus-visible:ring-offset-white"} ${
                    theme === "dark"
                      ? "border-white/10 text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                      : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
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
              hidden
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                if (preparingTimerRef.current) {
                  clearTimeout(preparingTimerRef.current);
                  preparingTimerRef.current = null;
                }
                setIsPreparing(false);
                pickerOpenRef.current = false;
                const selected = Array.from(e.target.files ?? []);
                if (selected.length > 0) addFiles(selected);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept={CAMERA_FILE_ACCEPT}
              multiple
              hidden
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                if (preparingTimerRef.current) {
                  clearTimeout(preparingTimerRef.current);
                  preparingTimerRef.current = null;
                }
                setIsPreparing(false);
                pickerOpenRef.current = false;
                const selected = Array.from(e.target.files ?? []);
                if (selected.length > 0) addFiles(selected);
                e.target.value = "";
              }}
            />

            {/* Description */}
            {files.length > 0 && allowMessages && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <textarea
                  value={description}
                  disabled={uploading}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Escribe un mensaje (opcional)"
                  rows={2}
                  maxLength={300}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm resize-none transition-all focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-60 ${
                    theme === "dark"
                      ? "border-white/10 bg-white/[0.04] text-white placeholder:text-gray-600 focus:ring-violet-500/25 focus:border-violet-500/40"
                      : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:ring-indigo-500/30 focus:border-indigo-300"
                  }`}
                />
              </motion.div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  role="alert"
                  aria-live="assertive"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`rounded-xl px-4 py-3 flex items-start gap-2 ${
                    theme === "dark"
                      ? "bg-red-500/10 border border-red-500/20"
                      : "bg-red-50"
                  }`}
                >
                  <svg
                    className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <p
                    className={`text-sm leading-relaxed ${theme === "dark" ? "text-red-300" : "text-red-600"}`}
                  >
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Partial success banner — some uploaded, some failed */}
            <AnimatePresence>
              {!uploading && doneCount > 0 && hasErrors && (
                <motion.div
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className={`rounded-xl px-4 py-3 flex items-start gap-2.5 border ${
                    theme === "dark"
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-amber-50 border-amber-200/50"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      theme === "dark"
                        ? "bg-amber-500/40 border border-amber-400/40"
                        : "bg-amber-400"
                    }`}
                  >
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <div>
                    <p
                      className={`text-sm font-medium ${theme === "dark" ? "text-amber-300" : "text-amber-800"}`}
                    >
                      {doneCount} de {files.length}{" "}
                      {doneCount === 1 ? "se subió" : "se subieron"}{" "}
                      correctamente
                    </p>
                    <p
                      className={`text-xs mt-0.5 ${theme === "dark" ? "text-amber-400/80" : "text-amber-600"}`}
                    >
                      Puedes reintentar los que fallaron tocando el botón de
                      abajo.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress bar */}
            {uploading && (
              <motion.div
                role="progressbar"
                aria-label="Progreso de subida"
                aria-valuemin={0}
                aria-valuemax={files.length}
                aria-valuenow={uploadedCount}
                aria-valuetext={`${uploadedCount} de ${files.length} archivos completados`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-2"
              >
                <div
                  className={`h-2 rounded-full overflow-hidden ${theme === "dark" ? "bg-white/10" : "bg-gray-100"}`}
                >
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${files.length > 0 ? Math.min(100, ((uploadedCount + 0.5) / files.length) * 100) : 0}%`,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4 text-indigo-500" />
                  <p
                    className={`text-xs font-medium ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
                  >
                    Subiendo {Math.min(uploadedCount + 1, files.length)} de{" "}
                    {files.length}
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
                disabled={
                  files.length === 0 ||
                  uploading ||
                  isPreparing ||
                  files.every((e) => e.status === "done")
                }
                onClick={handleUpload}
                className={`w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-sm font-semibold text-white active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:shadow-none ${
                  theme === "dark"
                    ? "shadow-[0_8px_32px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.55)]"
                    : "shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30"
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
  publicationHint,
  onUploadMore,
}: {
  count: number;
  publicationHint: SharedUploadPublicationHint;
  onUploadMore?: () => void;
}) {
  const { theme } = useContext(ThemeCtx);
  const successMessage =
    publicationHint === "published"
      ? count === 1
        ? "Tu archivo ya está disponible en la galería del evento."
        : `Tus ${count} archivos ya están disponibles en la galería del evento.`
      : publicationHint === "processing"
        ? count === 1
          ? "Tu archivo ya fue aprobado y aparecerá en cuanto termine de procesarse."
          : `Tus ${count} archivos ya fueron aprobados y aparecerán en cuanto terminen de procesarse.`
        : count === 1
          ? "Tu foto aparecerá en la galería del evento una vez que el organizador la apruebe."
          : `Tus ${count} archivos aparecerán en la galería del evento una vez que el organizador los apruebe.`;
  return (
    <div
      className={`relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center${theme === "light" ? " bg-white" : ""}`}
    >
      <DarkBackground />
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
          transition={{
            duration: 1.5 + Math.random(),
            delay: 0.1 + Math.random() * 0.4,
            ease: "easeOut",
          }}
          className="absolute top-1/4 left-1/2 w-2 h-2 rounded-full"
          style={{
            backgroundColor: [
              "#818cf8",
              "#34d399",
              "#fbbf24",
              "#f472b6",
              "#60a5fa",
              "#a78bfa",
              "#fb923c",
              "#e879f9",
            ][i % 8],
          }}
        />
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 ${
          theme === "dark"
            ? "bg-gradient-to-br from-violet-500 to-indigo-500 shadow-[0_0_60px_rgba(139,92,246,0.55)]"
            : "bg-gradient-to-br from-green-400 to-emerald-500 shadow-lg shadow-green-500/30"
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
        <h2
          className={`text-2xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}
        >
          {count === 1
            ? "¡Momento compartido!"
            : `¡${count} momentos compartidos!`}
        </h2>
        <p
          className={`text-sm max-w-[280px] mx-auto leading-relaxed ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
        >
          {successMessage}
        </p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}
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
              theme === "dark"
                ? "shadow-[0_8px_32px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_40px_rgba(99,102,241,0.55)]"
                : "shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30"
            }`}
          >
            Subir más fotos o videos
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}

function UploadLimitReachedScreen() {
  const { theme } = useContext(ThemeCtx);
  return (
    <div
      className={`relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center${theme === "light" ? " bg-white" : ""}`}
    >
      <DarkBackground />
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 ${
          theme === "dark"
            ? "bg-gradient-to-br from-violet-500 to-indigo-500 shadow-[0_0_50px_rgba(139,92,246,0.45)]"
            : "bg-gradient-to-br from-violet-400 to-indigo-500 shadow-lg shadow-indigo-500/25"
        }`}
      >
        <IconCheck className="w-12 h-12 text-white" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4 max-w-sm"
      >
        <h2
          className={`text-2xl font-bold tracking-tight leading-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}
        >
          Gracias por compartir tus momentos
        </h2>
        <p
          className={`text-sm leading-relaxed ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
        >
          Ya registramos las contribuciones permitidas para este enlace. Tus
          archivos aparecerán en la galería cuando el organizador los apruebe.
        </p>
      </motion.div>
    </div>
  );
}

function ComingSoonScreen({
  title = "Pronto podras compartir tus mejores momentos",
  description = "El organizador esta preparando todo para que puedas subir tus fotos y videos del evento. Vuelve en un momento.",
  statusLabel = "Preparando el evento",
}: {
  title?: string;
  description?: string;
  statusLabel?: string;
}) {
  const { theme } = useContext(ThemeCtx);
  return (
    <div
      className={`relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center${theme === "light" ? " bg-white" : ""}`}
    >
      <DarkBackground />
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
            backgroundColor: [
              "#a78bfa",
              "#818cf8",
              "#c084fc",
              "#6366f1",
              "#8b5cf6",
            ][i % 5],
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
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center ${
            theme === "dark"
              ? "bg-gradient-to-br from-violet-500 to-indigo-500 shadow-[0_0_50px_rgba(139,92,246,0.45)]"
              : "bg-gradient-to-br from-violet-400 to-indigo-500 shadow-lg shadow-indigo-500/25"
          }`}
        >
          <svg
            className="w-12 h-12 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
        </div>
        {/* Pulse ring */}
        <motion.div
          className={`absolute inset-0 rounded-full border-2 ${theme === "dark" ? "border-violet-400/60" : "border-indigo-300"}`}
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
        <h2
          className={`text-2xl font-bold tracking-tight leading-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}
        >
          {title}
        </h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`text-sm leading-relaxed ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
        >
          {description}
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
              className={`w-1.5 h-1.5 rounded-full ${theme === "dark" ? "bg-violet-400" : "bg-indigo-400"}`}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
              transition={{
                repeat: Infinity,
                duration: 1.2,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
        <span className="text-xs text-gray-400 font-medium">{statusLabel}</span>
      </motion.div>
    </div>
  );
}

function ThankYouScreen({
  eventName,
  identifier,
  accessToken,
}: {
  eventName: string;
  identifier: string;
  accessToken?: string;
}) {
  const { theme } = useContext(ThemeCtx);
  const accessParams =
    typeof window === "undefined"
      ? { previewToken: "", cacheKey: "", invitationToken: "", accessToken: "" }
      : readPublicAccessParams(window.location.search);
  const momentsUrl = buildEventMomentsPath(
    identifier,
    getPublicUploadBaseUrl(),
    {
      previewToken: accessParams.previewToken,
      cacheKey: accessParams.cacheKey,
      invitationToken: accessParams.invitationToken,
      accessToken: accessToken || accessParams.accessToken,
    },
  );
  return (
    <div
      className={`relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center${theme === "light" ? " bg-white" : ""}`}
    >
      <DarkBackground />
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className={`pointer-events-none absolute ${theme === "dark" ? "text-amber-300/60" : "text-amber-500/30"}`}
          style={{ left: `${10 + i * 11}%`, top: `${15 + (i % 3) * 25}%` }}
          animate={{
            y: [0, -12, 0],
            opacity: [0.3, 0.7, 0.3],
            scale: [1, 1.2, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 2.5 + i * 0.3,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        >
          <Sparkles className="size-4" aria-hidden="true" />
        </motion.div>
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 bg-gradient-to-br from-amber-400 to-orange-400 ${
          theme === "dark"
            ? "shadow-[0_0_50px_rgba(251,146,60,0.45)]"
            : "shadow-lg shadow-amber-500/20"
        }`}
      >
        <svg
          className="w-12 h-12 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-4"
      >
        <h2
          className={`text-2xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-gray-900"}`}
        >
          Gracias por compartir tus
          <br />
          mejores momentos
        </h2>
        {eventName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={`text-lg font-medium ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}
          >
            {eventName}
          </motion.p>
        )}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-sm max-w-[300px] mx-auto leading-relaxed ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}
        >
          Estamos muy agradecidos de que hayas sido parte de este día tan
          especial
        </motion.p>
        <motion.a
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          href={momentsUrl}
          className={`inline-flex items-center gap-2 mt-4 rounded-2xl px-5 py-2.5 text-sm font-medium transition-all ${
            theme === "dark"
              ? "bg-white/10 border border-white/15 text-gray-200 hover:bg-white/20"
              : "bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Ver el muro de momentos
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
            />
          </svg>
        </motion.a>
      </motion.div>
    </div>
  );
}

// ── Dark background with ambient light blobs ──────────────────────────────────

function DarkBackground() {
  const { theme } = useContext(ThemeCtx);
  if (theme === "light") return null;
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
        transition={{
          repeat: Infinity,
          duration: 13,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute top-10 -right-16 w-[320px] h-[320px] rounded-full bg-indigo-500/15 blur-[100px]"
      />
      {/* Blob 3 — blue, bottom-center */}
      <motion.div
        animate={{ y: [0, -16, 0] }}
        transition={{
          repeat: Infinity,
          duration: 11,
          ease: "easeInOut",
          delay: 4,
        }}
        className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full bg-blue-600/10 blur-[140px]"
      />
    </div>
  );
}
