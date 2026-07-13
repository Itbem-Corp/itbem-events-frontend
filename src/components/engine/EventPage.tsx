"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CalendarClock, PartyPopper } from "lucide-react";
import SectionRenderer from "./SectionRenderer";
import { isRsvpSectionType } from "./registry";
import MusicWidget from "../MusicWidget";
import ShareWidget from "../ShareWidget";
import Footer from "../common/Footer";
import PublicEventPasswordGate from "../common/PublicEventPasswordGate";
import { PublicEventLoadError } from "../common/PublicEventLoadError";
import InstallPrompt from "../InstallPrompt";
import type { PageSpec } from "./types";
import { normalizeEventsUrl } from "../../lib/eventsUrl";
import { buildEventVerifyAccessUrl } from "../../lib/apiUrls";
import {
  buildTrackViewUrl,
  viewTrackingWasAccepted,
  viewTrackingSessionKey,
} from "../../lib/eventTrackingUrl";
import { fetchApiResult } from "../../lib/apiFetch";
import { fetchApiResultWithRetry as fetchPageSpecWithRetry } from "../../lib/apiRetry";
import {
  buildIdentifierPageSpecUrl,
  buildTokenPageSpecUrl,
} from "../../lib/pageSpecUrl";
import { shouldRenderFooter } from "../../lib/pageChrome";
import {
  publicAccessFetchInit,
  readPublicAccessParams,
} from "../../lib/publicPreview";
import { shouldTrackPublicView } from "../../lib/publicViewTracking";
import {
  readStoredEventAccessToken,
  removeStoredEventAccessToken,
  storeEventAccessToken,
} from "../../lib/publicEventAccessStorage";
import { normalizeEventAccessVerification } from "../../lib/eventAccess";
import { formatPublicAccessDateTime } from "../../lib/accessDates";
import {
  readPageSpecPayload,
  readPageSpecCache,
  removePageSpecCache,
  shouldRenderCachedPageSpecBeforeRevalidate,
  shouldRenderPageSpecCacheBeforeRevalidate,
  sortPageSpecSections,
  writePageSpecCache,
  type PageSpecCacheMode,
} from "../../lib/pageSpecCache";
import {
  buildPageThemeFontFaces,
  buildPageThemeStyle,
} from "../../lib/pageTheme";
import {
  resolvePublicLoadFailure,
  type PublicLoadFailure,
} from "../../lib/publicLoadFailure";

interface Props {
  EVENTS_URL: string;
  /** When set, loads page-spec by event identifier instead of ?token= query param. */
  identifier?: string;
  /** When set, opens in RSVP mode — auto-scrolls to the RSVPConfirmation section. */
  rsvpMode?: boolean;
}

// ── View Tracking ────────────────────────────────────────────────────────────
// Fires once per session per event. Uses sessionStorage so returning to the
// same tab within the session doesn't double-count.

function trackView(
  eventsUrl: string,
  identifier: string,
  invitationToken?: string | null,
  accessToken?: string | null,
) {
  const key = viewTrackingSessionKey(eventsUrl, identifier, invitationToken);
  try {
    const current = sessionStorage.getItem(key);
    if (current === "1" || current === "pending") return;
    sessionStorage.setItem(key, "pending");
  } catch {
    /* ignore */
  }

  const clearMarker = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const confirmMarker = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };

  // Fire-and-forget — never block the page
  fetch(
    buildTrackViewUrl(eventsUrl, identifier, invitationToken),
    publicAccessFetchInit(
      { invitationToken, accessToken },
      {
        method: "POST",
        keepalive: true,
      },
    ),
  )
    .then(async (response) => {
      if (!response.ok) {
        clearMarker();
        return;
      }

      let payload: unknown;
      try {
        payload = await response.clone().json();
      } catch {
        payload = undefined;
      }

      if (viewTrackingWasAccepted(payload)) {
        confirmMarker();
      } else {
        clearMarker();
      }
    })
    .catch(clearMarker);
}

function PageSkeleton() {
  return (
    <main
      className="mx-auto max-w-screen-md space-y-10 px-4 py-4 lg:max-w-[1024px] lg:space-y-16"
      aria-busy="true"
      aria-label="Preparando invitación"
    >
      <span className="sr-only">Preparando invitación…</span>
      <div className="eventi-skeleton h-[min(68svh,42rem)] rounded-[2rem]" />
      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
        <div className="eventi-skeleton h-28 rounded-3xl" />
        <div className="eventi-skeleton h-28 rounded-3xl" />
        <div className="eventi-skeleton h-28 rounded-3xl" />
      </div>
      <div className="eventi-skeleton h-72 rounded-[2rem]" />
    </main>
  );
}

// ── Date Gate ─────────────────────────────────────────────────────────────────

function PublicEventLifecycleGate({
  eyebrow,
  title,
  description,
  Icon,
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  Icon: typeof CalendarClock;
}) {
  return (
    <main className="eventi-product-canvas flex min-h-[100svh] items-center justify-center px-4 py-10 text-center">
      <section className="eventi-product-card w-full max-w-md px-6 py-9 sm:px-10 sm:py-11">
        <div className="eventi-brand-mark mx-auto" aria-hidden="true">
          <Icon className="size-5" strokeWidth={1.8} />
        </div>
        <p className="eventi-eyebrow mt-6">{eyebrow}</p>
        <h1 className="mt-3 text-balance text-2xl font-semibold tracking-[-0.025em] text-gray-950 sm:text-3xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-pretty text-sm leading-6 text-gray-600 sm:text-base sm:leading-7">
          {description}
        </p>
        <div className="mx-auto mt-8 h-px w-12 bg-gradient-to-r from-transparent via-pink-500/60 to-transparent" />
        <p className="mt-5 text-xs font-medium tracking-wide text-gray-400">
          EventiApp · Tu invitación digital
        </p>
      </section>
    </main>
  );
}

function ComingSoonGate({
  activeFrom,
  timeZone,
}: {
  activeFrom: string;
  timeZone?: string | null;
}) {
  const formatted = formatPublicAccessDateTime(activeFrom, timeZone, {
    weekday: true,
  });
  return (
    <PublicEventLifecycleGate
      eyebrow="Próximamente"
      title="Esta invitación aún no está disponible"
      description={
        <>
          Podrás abrirla el{" "}
          <strong className="font-semibold text-gray-900">{formatted}</strong>.
          Guarda este enlace para volver cuando llegue el momento.
        </>
      }
      Icon={CalendarClock}
    />
  );
}

function EventEndedGate({
  activeUntil,
  timeZone,
}: {
  activeUntil: string;
  timeZone?: string | null;
}) {
  const formatted = formatPublicAccessDateTime(activeUntil, timeZone);
  return (
    <PublicEventLifecycleGate
      eyebrow="Gracias por acompañarnos"
      title="El evento ya concluyó"
      description={
        <>
          Esta invitación estuvo disponible hasta el{" "}
          <strong className="font-semibold text-gray-900">{formatted}</strong>.
          Gracias por haber sido parte de este momento especial.
        </>
      }
      Icon={PartyPopper}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Root event page renderer — Phase 2 (SDUI dynamic).
 *
 * 1. Reads ?token= from the URL.
 * 2. Checks sessionStorage cache with mode-specific TTLs for fast but fresh renders.
 * 3. If no cache: fetches GET {EVENTS_URL}api/events/page-spec?token=...
 *    with up to 3 retries (500ms / 1000ms / 1500ms linear backoff).
 *    403/404 responses are not retried (access/token decisions).
 * 4. Stores result in cache, then renders sections via SectionRenderer.
 * 5. Each section is wrapped in SectionErrorBoundary.
 * 6. After load: tracks view (once per session) + enforces date/password gates.
 */
export default function EventPage({
  EVENTS_URL: rawEventsUrl,
  identifier: identifierProp,
  rsvpMode,
}: Props) {
  const EVENTS_URL = normalizeEventsUrl(rawEventsUrl);
  const [spec, setSpec] = useState<PageSpec | null>(null);
  const [error, setError] = useState<PublicLoadFailure | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [invitationToken, setInvitationToken] = useState("");
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [passwordAccessToken, setPasswordAccessToken] = useState("");
  const passwordAccessTokenRef = useRef("");

  // Raw preview requests skip cache while the backend validates the signed token.
  const [isPreview, setIsPreview] = useState(false);
  const previewAuthorized = Boolean(
    isPreview && spec?.meta?.access?.previewAuthorized,
  );

  const loadSpec = useCallback(
    async (
      tok: string,
      byIdentifier = false,
      skipCache = false,
      previewToken = "",
      previewCacheKey = "",
      inviteToken = "",
      accessProofToken = "",
    ) => {
      setError(null);
      const cacheMode: PageSpecCacheMode = byIdentifier
        ? "identifier"
        : "token";
      const cacheId =
        byIdentifier && inviteToken ? `${tok}:${inviteToken}` : tok;
      const scopedCacheId = accessProofToken
        ? `${cacheId}:access:${accessProofToken}`
        : cacheId;
      const canRenderCachedSpec = shouldRenderPageSpecCacheBeforeRevalidate(
        cacheMode,
        Boolean(inviteToken),
      );

      let renderedCachedSpec = false;

      // Cache hit — render immediately, then revalidate so dashboard changes
      // propagate without waiting for the full client-side TTL.
      // Full-content cached specs wait for backend access revalidation.
      if (!skipCache && canRenderCachedSpec) {
        const cached = readPageSpecCache(
          scopedCacheId,
          cacheMode,
          undefined,
          Date.now(),
          EVENTS_URL,
        );
        if (cached) {
          if (
            shouldRenderCachedPageSpecBeforeRevalidate(
              cacheMode,
              cached,
              Boolean(inviteToken),
            )
          ) {
            if (cached.meta?.pageTitle) document.title = cached.meta.pageTitle;
            setSpec(cached);
            renderedCachedSpec = true;
          }
        }
      }

      // Cache miss, preview mode, or background revalidation after a cache hit.
      try {
        const url = byIdentifier
          ? buildIdentifierPageSpecUrl(
              EVENTS_URL,
              tok,
              previewToken,
              previewCacheKey,
              inviteToken,
            )
          : buildTokenPageSpecUrl(EVENTS_URL, tok);
        const result = await fetchPageSpecWithRetry<unknown>(
          url,
          3,
          publicAccessFetchInit({
            previewToken,
            invitationToken: byIdentifier ? inviteToken : tok,
            accessToken: accessProofToken,
          }),
          byIdentifier
            ? "No pudimos cargar este evento."
            : "No pudimos cargar esta invitación.",
        );
        const clearStalePageSpecCache = () => {
          removePageSpecCache(scopedCacheId, cacheMode, undefined, EVENTS_URL);
        };
        if (result.status === 404) {
          clearStalePageSpecCache();
          setSpec(null);
          setError(
            resolvePublicLoadFailure({
              status: result.status,
              resource: byIdentifier ? "event" : "invitation",
              backendMessage: result.message,
            }),
          );
          return;
        }
        if (result.status === 401) {
          clearStalePageSpecCache();
          setSpec(null);
          setError(
            resolvePublicLoadFailure({
              status: result.status,
              resource: byIdentifier ? "event" : "invitation",
              backendMessage: result.message,
            }),
          );
          return;
        }
        if (result.status === 403) {
          clearStalePageSpecCache();
          setSpec(null);
          setError(
            resolvePublicLoadFailure({
              status: result.status,
              resource: byIdentifier ? "event" : "invitation",
              backendMessage: result.message,
            }),
          );
          return;
        }
        if (!result.ok) {
          throw new Error(
            result.message || `Error del servidor (${result.status})`,
          );
        }

        const pageSpec = readPageSpecPayload(result.data);
        if (!pageSpec) throw new Error("Respuesta de invitación inválida.");
        const access = pageSpec.meta.access;
        if (
          accessProofToken &&
          (!access?.passwordProtected ||
            access.passwordVerified ||
            access.previewAuthorized)
        ) {
          passwordAccessTokenRef.current = accessProofToken;
          setPasswordAccessToken(accessProofToken);
        }
        if (
          accessProofToken &&
          access?.passwordProtected &&
          !access.passwordVerified &&
          !access.previewAuthorized
        ) {
          const specIdentifier = pageSpec.meta.identifier ?? "";
          if (specIdentifier) {
            removeStoredEventAccessToken({
              eventsUrl: EVENTS_URL,
              identifier: specIdentifier,
              accessVersion: access.accessVersion,
              invitationToken: byIdentifier ? inviteToken : tok,
            });
          }
          passwordAccessTokenRef.current = "";
          setPasswordAccessToken("");
          setPasswordVerified(false);
        }
        if (pageSpec.meta.pageTitle) document.title = pageSpec.meta.pageTitle;
        if (!skipCache) {
          writePageSpecCache(
            scopedCacheId,
            pageSpec,
            cacheMode,
            undefined,
            Date.now(),
            EVENTS_URL,
          );
        }
        setSpec(pageSpec);
      } catch (err) {
        if (renderedCachedSpec) return;
        setError(
          resolvePublicLoadFailure({
            resource: byIdentifier ? "event" : "invitation",
            backendMessage:
              err instanceof Error
                ? err.message
                : "Error al cargar la invitación.",
          }),
        );
      }
    },
    [EVENTS_URL],
  );

  useEffect(() => {
    const accessParams = readPublicAccessParams(window.location.search);
    const initialAccessToken = accessParams.accessToken?.trim() ?? "";
    passwordAccessTokenRef.current = initialAccessToken;
    setPasswordAccessToken(initialAccessToken);
    setPasswordVerified(Boolean(initialAccessToken));
    setInvitationToken(accessParams.invitationToken);
    setIsPreview(accessParams.isPreview);

    // Identifier mode — load by event slug directly
    if (identifierProp) {
      setToken(identifierProp);
      loadSpec(
        identifierProp,
        true,
        accessParams.isPreview || Boolean(initialAccessToken),
        accessParams.previewToken,
        accessParams.cacheKey,
        accessParams.invitationToken,
        initialAccessToken,
      );
      return;
    }

    // Token mode — read from query string
    const tok = accessParams.invitationToken;
    if (!tok) {
      setError(
        resolvePublicLoadFailure({
          status: 400,
          resource: "invitation",
        }),
      );
      return;
    }
    setToken(tok);
    setInvitationToken(tok);
    loadSpec(
      tok,
      false,
      accessParams.isPreview || Boolean(initialAccessToken),
      "",
      "",
      "",
      initialAccessToken,
    );
  }, [loadSpec, identifierProp]);

  const retryLoadSpec = useCallback(() => {
    if (!token) return;
    const accessParams = readPublicAccessParams(window.location.search);
    loadSpec(
      token,
      Boolean(identifierProp),
      accessParams.isPreview ||
        Boolean(passwordAccessToken || accessParams.accessToken),
      accessParams.previewToken,
      accessParams.cacheKey,
      identifierProp ? invitationToken : "",
      passwordAccessToken || accessParams.accessToken || "",
    );
  }, [identifierProp, invitationToken, loadSpec, passwordAccessToken, token]);

  const verifyEventPassword = useCallback(
    async (password: string) => {
      const eventIdentifier = spec?.meta.identifier?.trim() ?? "";
      const currentAccessVersion =
        spec?.meta.access?.accessVersion?.trim() ?? "";
      if (!eventIdentifier || !token) {
        return {
          ok: false,
          message: "No pudimos abrir la invitación. Intenta de nuevo.",
        };
      }

      const accessParams = readPublicAccessParams(window.location.search);
      const result = await fetchApiResult<unknown>(
        buildEventVerifyAccessUrl(
          EVENTS_URL,
          eventIdentifier,
          invitationToken,
          accessParams.previewToken,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        },
        "Contraseña incorrecta. Intenta de nuevo.",
      );

      if (!result.ok) {
        return {
          ok: false,
          message: result.message || "Contraseña incorrecta. Intenta de nuevo.",
        };
      }

      const access = normalizeEventAccessVerification(result.data);
      const accessToken = access.accessToken;
      if (!accessToken) {
        return {
          ok: false,
          message: "No pudimos abrir la invitación. Intenta de nuevo.",
        };
      }

      const verifiedAccessVersion =
        access.accessVersion || currentAccessVersion;
      storeEventAccessToken(
        {
          eventsUrl: EVENTS_URL,
          identifier: eventIdentifier,
          accessVersion: verifiedAccessVersion,
          invitationToken,
        },
        accessToken,
      );
      passwordAccessTokenRef.current = accessToken;
      setPasswordAccessToken(accessToken);
      setPasswordVerified(true);

      void loadSpec(
        token,
        Boolean(identifierProp),
        true,
        accessParams.previewToken,
        accessParams.cacheKey,
        identifierProp ? invitationToken : "",
        accessToken,
      );

      return { ok: true };
    },
    [
      EVENTS_URL,
      identifierProp,
      invitationToken,
      loadSpec,
      spec?.meta.access?.accessVersion,
      spec?.meta.identifier,
      token,
    ],
  );

  // Track view + restore password verification after spec loads
  useEffect(() => {
    if (!spec?.meta?.identifier) return;

    const id = spec.meta.identifier;
    const access = spec.meta.access;

    // Restore signed password proof from sessionStorage. Legacy "1" entries
    // are ignored because the backend now requires the proof token.
    let storedAccessToken = access?.passwordProtected
      ? readStoredEventAccessToken({
          eventsUrl: EVENTS_URL,
          identifier: id,
          accessVersion: access.accessVersion,
          invitationToken,
        })
      : "";
    if (!storedAccessToken && access?.passwordVerified) {
      storedAccessToken = passwordAccessTokenRef.current;
    }
    const storedPasswordVerified = Boolean(
      access?.passwordVerified || storedAccessToken,
    );
    passwordAccessTokenRef.current = storedAccessToken;
    setPasswordAccessToken(storedAccessToken);
    setPasswordVerified(storedPasswordVerified);

    if (
      access?.passwordProtected &&
      storedAccessToken &&
      !access.passwordVerified &&
      token
    ) {
      const accessParams = readPublicAccessParams(window.location.search);
      loadSpec(
        token,
        Boolean(identifierProp),
        true,
        accessParams.previewToken,
        accessParams.cacheKey,
        identifierProp ? invitationToken : "",
        storedAccessToken,
      );
      return;
    }

    // Track view only after public gates allow real content.
    if (
      shouldTrackPublicView({
        access,
        passwordVerified: passwordVerified || storedPasswordVerified,
        previewAuthorized,
      })
    ) {
      trackView(
        EVENTS_URL,
        id,
        invitationToken,
        passwordAccessToken || storedAccessToken,
      );
    }
  }, [
    spec?.meta?.identifier,
    spec?.meta?.access?.activeFrom,
    spec?.meta?.access?.activeUntil,
    spec?.meta?.access?.accessVersion,
    spec?.meta?.access?.passwordProtected,
    spec?.meta?.access?.passwordVerified,
    EVENTS_URL,
    identifierProp,
    invitationToken,
    loadSpec,
    passwordAccessToken,
    passwordVerified,
    previewAuthorized,
    token,
  ]);

  // RSVP mode — auto-scroll to the RSVPConfirmation section after render
  useEffect(() => {
    if (!rsvpMode || !spec) return;
    const rsvpSection = spec.sections.find((s) => isRsvpSectionType(s.type));
    if (!rsvpSection) return;
    // Wait for section to render + hydrate
    const timer = setTimeout(() => {
      const el = document.getElementById(`section-${rsvpSection.sectionId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 800);
    return () => clearTimeout(timer);
  }, [rsvpMode, spec]);

  if (error) {
    return (
      <PublicEventLoadError
        title={error.title}
        message={error.message}
        supportText={error.supportText}
        onRetry={
          error.retryable && (token || identifierProp)
            ? retryLoadSpec
            : undefined
        }
      />
    );
  }

  if (!spec) return <PageSkeleton />;

  // Dashboard Studio preview bypasses gates only when the backend validated the signed token.
  if (!previewAuthorized) {
    const access = spec.meta.access;
    const now = new Date();

    // Date gate: coming soon
    if (access?.activeFrom) {
      const from = new Date(access.activeFrom);
      if (now < from)
        return (
          <ComingSoonGate
            activeFrom={access.activeFrom}
            timeZone={spec.meta.timezone}
          />
        );
    }

    // Date gate: event ended
    if (access?.activeUntil) {
      const until = new Date(access.activeUntil);
      if (now > until)
        return (
          <EventEndedGate
            activeUntil={access.activeUntil}
            timeZone={spec.meta.timezone}
          />
        );
    }

    // Password gate
    if (
      access?.passwordProtected &&
      passwordVerified &&
      !access.passwordVerified
    ) {
      return <PageSkeleton />;
    }

    if (
      access?.passwordProtected &&
      !(passwordVerified || access.passwordVerified) &&
      spec.meta.identifier
    ) {
      return (
        <PublicEventPasswordGate
          title="Esta invitación es privada"
          description="Ingresa la contraseña que recibiste junto con tu invitación."
          passwordPlaceholder="Contraseña"
          submitLabel="Acceder"
          onVerify={verifyEventPassword}
        />
      );
    }
  }

  const sorted = sortPageSpecSections(spec.sections);
  const themeStyle = buildPageThemeStyle(spec.meta.theme);
  const themeFontFaces = buildPageThemeFontFaces(spec.meta.theme, EVENTS_URL);
  const accessParams = readPublicAccessParams();
  const publicSpecCacheKey =
    spec.meta.contentVersion || spec.meta.access?.accessVersion || "";
  const sectionCacheKey = accessParams.cacheKey || publicSpecCacheKey;
  const sectionPublicAccess = {
    previewToken: accessParams.previewToken,
    cacheKey: sectionCacheKey,
    sendCacheKey: Boolean(sectionCacheKey && !accessParams.cacheKey),
    invitationToken: invitationToken || (!identifierProp && token ? token : ""),
    accessToken:
      passwordAccessToken ||
      passwordAccessTokenRef.current ||
      accessParams.accessToken ||
      "",
  };

  return (
    <div
      className="eventi-product-canvas"
      style={themeStyle as CSSProperties | undefined}
      data-design-template={spec.meta.theme?.designTemplateIdentifier}
    >
      {themeFontFaces && <style>{themeFontFaces}</style>}

      {spec.meta.musicUrl && (
        <MusicWidget audioUrl={spec.meta.musicUrl} volume={0.3} />
      )}

      <ShareWidget
        eventTitle={spec.meta.pageTitle}
        eventIdentifier={spec.meta.identifier}
      />

      <main className="eventi-event-page mx-auto max-w-screen-md space-y-10 overflow-x-hidden px-3 py-4 sm:space-y-16 sm:px-4 lg:max-w-[1024px]">
        {sorted.map((section) => (
          <SectionRenderer
            key={section.sectionId || `${section.type}-${section.order}`}
            spec={section}
            EVENTS_URL={EVENTS_URL}
            publicAccess={sectionPublicAccess}
          />
        ))}

        {shouldRenderFooter(spec.meta) && (
          <div className="overflow-x-hidden">
            <Footer contact={spec.meta.contact} />
          </div>
        )}
      </main>

      <InstallPrompt />
    </div>
  );
}
