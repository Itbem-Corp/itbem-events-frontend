import type { PublicMoment } from "./publicMomentTypes";

/**
 * What the shared upload success screen tells the guest about the batch.
 * `failed` means the file arrived but processing could not start (the
 * backend sets publication_status "failed"), so it will never reach the wall.
 */
export type SharedUploadPublicationHint =
  | "published"
  | "processing"
  | "pending_review"
  | "failed";

export function uploadHintForMoment(
  moment: PublicMoment | null,
): SharedUploadPublicationHint {
  if (
    moment?.publication_status === "failed" ||
    moment?.processing_status === "failed"
  ) {
    return "failed";
  }
  if (moment?.publication_status === "published") return "published";
  if (
    moment?.publication_status === "processing" ||
    moment?.approval_status === "approved"
  ) {
    return "processing";
  }
  return "pending_review";
}

const HINT_PRIORITY: Record<SharedUploadPublicationHint, number> = {
  failed: 3,
  pending_review: 2,
  processing: 1,
  published: 0,
};

/** The batch shows the least optimistic state of any of its files. */
export function mergeUploadPublicationHint(
  current: SharedUploadPublicationHint,
  next: SharedUploadPublicationHint,
): SharedUploadPublicationHint {
  return HINT_PRIORITY[next] > HINT_PRIORITY[current] ? next : current;
}

/** Only real processing deserves the short "Optimizando…" transition. */
export function shouldShowOptimizingTransition(
  hint: SharedUploadPublicationHint,
): boolean {
  return hint === "processing";
}

export interface SharedUploadSuccessCopy {
  title: string;
  message: string;
  tone: "success" | "warning";
}

export function sharedUploadSuccessCopy(
  hint: SharedUploadPublicationHint,
  count: number,
): SharedUploadSuccessCopy {
  const one = count === 1;
  if (hint === "failed") {
    return {
      tone: "warning",
      title: one ? "Recibimos tu archivo" : "Recibimos tus archivos",
      message: one
        ? "Recibimos tu archivo, pero no pudimos procesarlo, así que no aparecerá en la galería. Puedes intentar subirlo de nuevo."
        : "Recibimos tus archivos, pero no pudimos procesar al menos uno, así que podría no aparecer en la galería. Puedes intentar subirlo de nuevo.",
    };
  }
  const title = one ? "¡Momento compartido!" : `¡${count} momentos compartidos!`;
  if (hint === "published") {
    return {
      tone: "success",
      title,
      message: one
        ? "Tu archivo ya está disponible en la galería del evento."
        : `Tus ${count} archivos ya están disponibles en la galería del evento.`,
    };
  }
  if (hint === "processing") {
    return {
      tone: "success",
      title,
      message: one
        ? "Tu archivo ya fue aprobado y aparecerá en cuanto termine de procesarse."
        : `Tus ${count} archivos ya fueron aprobados y aparecerán en cuanto terminen de procesarse.`,
    };
  }
  return {
    tone: "success",
    title,
    message: one
      ? "Tu foto aparecerá en la galería del evento una vez que el organizador la apruebe."
      : `Tus ${count} archivos aparecerán en la galería del evento una vez que el organizador los apruebe.`,
  };
}
