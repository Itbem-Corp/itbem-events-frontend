export type PublicLoadResource = "event" | "invitation" | "moments";

export interface PublicLoadFailure {
  message: string;
  retryable: boolean;
  status: number | null;
  supportText: string;
  title: string;
}

interface ResolvePublicLoadFailureOptions {
  backendMessage?: string;
  /** Machine-readable backend code (`invitation_token_expired`, `event_gone`…). */
  code?: string | null;
  resource: PublicLoadResource;
  status?: number | null;
}

/** Backend codes for an invitation link that no longer opens the event. */
const INVALID_LINK_CODES = new Set([
  "invitation_token_invalid",
  "invitation_token_expired",
  "invalid_token",
  "token_expired",
]);

/**
 * True when a refusal is about the guest's own link (expired, revoked, from
 * another event) rather than the event itself. The token route still answers
 * a bare 401 "token expired" without a code.
 */
export function isInvalidInvitationLinkFailure(
  status: number | null | undefined,
  code: string | null | undefined,
  backendMessage?: string,
): boolean {
  const normalizedCode = code?.trim().toLowerCase() ?? "";
  if (INVALID_LINK_CODES.has(normalizedCode)) return true;
  if (status !== 401 || normalizedCode) return false;
  return /token\W+(is\W+)?(expired|invalid)|(expired|invalid)\W+token/i.test(
    backendMessage ?? "",
  );
}

const INVALID_LINK_FAILURE = {
  retryable: false,
  title: "Este enlace ya no es válido o expiró",
  message: "Tu invitación no pudo abrirse con este enlace.",
  supportText: "Pide al organizador que te comparta un enlace nuevo.",
} as const;

const EVENT_GONE_FAILURE = {
  retryable: false,
  title: "Este evento ya no está disponible",
  message: "El organizador lo retiró y ya no puede consultarse.",
  supportText: "Si crees que es un error, contacta al organizador.",
} as const;

function fallbackTitle(resource: PublicLoadResource): string {
  if (resource === "moments") return "No pudimos cargar los momentos";
  if (resource === "event") return "No pudimos abrir el evento";
  return "No pudimos abrir la invitación";
}

function fallbackMessage(resource: PublicLoadResource): string {
  if (resource === "moments") {
    return "La conexión no respondió. Tus fotos siguen intactas.";
  }
  return "La conexión no respondió. Verifica tu señal e intenta de nuevo.";
}

function safeTransientMessage(
  backendMessage: string | undefined,
  resource: PublicLoadResource,
): string {
  const message = backendMessage?.trim() ?? "";
  if (
    !message ||
    /^(failed to fetch|fetch failed|load failed|network ?error|api error)/i.test(
      message,
    )
  ) {
    return fallbackMessage(resource);
  }
  return message;
}

export function resolvePublicLoadFailure({
  backendMessage,
  code = null,
  resource,
  status = null,
}: ResolvePublicLoadFailureOptions): PublicLoadFailure {
  const normalizedCode = code?.trim().toLowerCase() ?? "";
  if (status === 410 || normalizedCode === "event_gone") {
    return { status, ...EVENT_GONE_FAILURE };
  }

  if (
    resource !== "moments" &&
    isInvalidInvitationLinkFailure(status, normalizedCode, backendMessage)
  ) {
    return { status, ...INVALID_LINK_FAILURE };
  }

  if (status === 400 && resource === "invitation") {
    return {
      status,
      retryable: false,
      title: "Este enlace está incompleto",
      message: "Falta el identificador de la invitación.",
      supportText: "Abre el enlace completo que recibiste del organizador.",
    };
  }

  if (status === 401) {
    if (resource === "moments") {
      return {
        status,
        retryable: false,
        title: "Este muro es privado",
        message:
          "Abre el enlace original que recibiste para validar tu acceso.",
        supportText: "Si el enlace expiró, pide uno nuevo al organizador.",
      };
    }
    return {
      status,
      retryable: false,
      title:
        resource === "event"
          ? "Este evento requiere acceso"
          : "Este enlace ya no es válido",
      message: "Tu acceso no pudo validarse con este enlace.",
      supportText: "Pide al organizador que te comparta un enlace nuevo.",
    };
  }

  if (status === 403) {
    if (resource === "moments") {
      return {
        status,
        retryable: false,
        title: "Este muro aún no está disponible",
        message: "El organizador todavía no lo ha publicado para invitados.",
        supportText:
          "Cuando esté listo, podrás volver desde el enlace del evento.",
      };
    }
    return {
      status,
      retryable: false,
      title:
        resource === "event"
          ? "Este evento aún no está disponible"
          : "Esta invitación no está disponible",
      message:
        resource === "event"
          ? "El organizador todavía no lo ha publicado para invitados."
          : "El organizador todavía no la ha publicado para invitados.",
      supportText: "Pide al organizador que confirme o actualice tu enlace.",
    };
  }

  if (status === 404) {
    return {
      status,
      retryable: false,
      title:
        resource === "moments"
          ? "No encontramos este muro"
          : resource === "event"
            ? "No encontramos este evento"
            : "No encontramos esta invitación",
      message: "El enlace puede estar incompleto, vencido o haber cambiado.",
      supportText:
        "Pide al organizador que te comparta el enlace más reciente.",
    };
  }

  if (status === 429) {
    return {
      status,
      retryable: true,
      title: "El servicio está recibiendo muchas visitas",
      message: "Espera unos segundos antes de volver a intentarlo.",
      supportText: "No necesitas salir de esta pantalla.",
    };
  }

  return {
    status,
    retryable: true,
    title: fallbackTitle(resource),
    message: safeTransientMessage(backendMessage, resource),
    supportText:
      resource === "moments"
        ? "Tus fotos no se ven afectadas. Puedes volver a intentarlo."
        : "Puedes volver a intentarlo sin perder tu lugar.",
  };
}
