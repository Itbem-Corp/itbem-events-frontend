import { useCallback, useEffect, useState } from "react";

import { buildEventVerifyAccessUrl } from "../lib/apiUrls";
import { fetchApiResult } from "../lib/apiFetch";
import {
  readStoredEventAccessToken,
  removeStoredEventAccessToken,
  storeEventAccessToken,
  storeVerifiedEventAccessToken,
} from "../lib/publicEventAccessStorage";
import { fetchPublicEventAccessSpec } from "../lib/publicEventAccessSpec";
import { normalizeEventAccessVerification } from "../lib/eventAccess";
import type { PageSpec } from "../components/engine/types";

interface UsePublicEventAccessOptions {
  eventsUrl: string;
  identifier: string;
  previewToken?: string | null;
  previewCacheKey?: string | null;
  sendCacheKey?: boolean | null;
  invitationToken?: string | null;
  accessToken?: string | null;
  enabled?: boolean;
}

interface VerifyResult {
  ok: boolean;
  message?: string;
}

interface PublicEventAccessState {
  ready: boolean;
  loading: boolean;
  passwordRequired: boolean;
  passwordVerified: boolean;
  accessToken: string;
  accessVersion: string;
  pageSpec: PageSpec | null;
  error: string;
  verifyPassword: (password: string) => Promise<VerifyResult>;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

async function readPublicPageSpec(payload: unknown): Promise<PageSpec | null> {
  // This normalizer accepts historical API aliases. Loading it on demand keeps
  // the Moments/QR access path from paying for it before a response exists.
  const { readPageSpecPayload } = await import("../lib/pageSpecCache");
  return readPageSpecPayload(payload);
}

export function usePublicEventAccess({
  eventsUrl,
  identifier,
  previewToken,
  previewCacheKey,
  sendCacheKey,
  invitationToken,
  accessToken: initialAccessToken,
  enabled = true,
}: UsePublicEventAccessOptions): PublicEventAccessState {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [accessVersion, setAccessVersion] = useState("");
  const [pageSpec, setPageSpec] = useState<PageSpec | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const id = clean(identifier);
    if (!enabled || !id) {
      setReady(false);
      setLoading(false);
      setPasswordRequired(false);
      setPasswordVerified(false);
      setAccessToken("");
      setAccessVersion("");
      setPageSpec(null);
      setError("");
      return;
    }

    setReady(false);
    setLoading(true);
    setPasswordRequired(false);
    setPasswordVerified(false);
    const queryAccessToken = clean(initialAccessToken);
    setAccessToken(queryAccessToken);
    setAccessVersion("");
    setPageSpec(null);
    setError("");

    const fetchAccessSpec = (proofToken = "") =>
      fetchPublicEventAccessSpec({
        eventsUrl,
        identifier: id,
        previewToken,
        previewCacheKey,
        sendCacheKey,
        invitationToken,
        accessToken: proofToken,
      });

    fetchAccessSpec(queryAccessToken)
      .then(async (payload) => {
        if (cancelled) return;
        const spec = await readPublicPageSpec(payload);
        const access = spec?.meta.access;
        const version = clean(access?.accessVersion);
        setPageSpec(spec);
        setAccessVersion(version);

        if (
          !access?.passwordProtected ||
          access.previewAuthorized ||
          access.passwordVerified
        ) {
          setPasswordRequired(false);
          setPasswordVerified(access?.passwordProtected ? true : false);
          if (queryAccessToken) {
            storeVerifiedEventAccessToken({
              eventsUrl,
              identifier: id,
              accessVersion: version,
              invitationToken,
              accessToken: queryAccessToken,
              passwordProtected: access?.passwordProtected,
              passwordVerified: access?.passwordVerified,
              previewAuthorized: access?.previewAuthorized,
            });
            setAccessToken(queryAccessToken);
          }
          setReady(true);
          return;
        }

        const storedToken = readStoredEventAccessToken({
          eventsUrl,
          identifier: id,
          accessVersion: version,
          invitationToken,
        });
        if (storedToken) {
          const verifiedPayload = await fetchAccessSpec(storedToken);
          if (cancelled) return;
          const verifiedSpec = await readPublicPageSpec(verifiedPayload);
          const verifiedAccess = verifiedSpec?.meta.access;
          const verifiedVersion =
            clean(verifiedAccess?.accessVersion) || version;

          if (
            verifiedSpec &&
            (!verifiedAccess?.passwordProtected ||
              verifiedAccess.previewAuthorized ||
              verifiedAccess.passwordVerified)
          ) {
            setPageSpec(verifiedSpec);
            setAccessVersion(verifiedVersion);
            setAccessToken(storedToken);
            setPasswordVerified(
              verifiedAccess?.passwordProtected ? true : false,
            );
            setPasswordRequired(false);
            setReady(true);
            return;
          }

          removeStoredEventAccessToken({
            eventsUrl,
            identifier: id,
            accessVersion: version,
            invitationToken,
          });
          if (verifiedVersion && verifiedVersion !== version) {
            removeStoredEventAccessToken({
              eventsUrl,
              identifier: id,
              accessVersion: verifiedVersion,
              invitationToken,
            });
          }
          setPageSpec(verifiedSpec ?? spec);
          setAccessVersion(verifiedVersion);
          setAccessToken("");
          setPasswordRequired(true);
          setPasswordVerified(false);
          setReady(true);
        } else {
          setAccessToken("");
          setPasswordRequired(true);
          setPasswordVerified(false);
          setReady(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el evento",
        );
        setReady(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    eventsUrl,
    identifier,
    invitationToken,
    initialAccessToken,
    previewCacheKey,
    previewToken,
    sendCacheKey,
  ]);

  const verifyPassword = useCallback(
    async (password: string): Promise<VerifyResult> => {
      const id = clean(identifier);
      const value = clean(password);
      if (!id || !value) {
        return { ok: false, message: "Ingresa la contrasena." };
      }

      try {
        const result = await fetchApiResult<unknown>(
          buildEventVerifyAccessUrl(
            eventsUrl,
            id,
            invitationToken,
            previewToken,
          ),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: value }),
          },
          "Contrasena incorrecta. Intenta de nuevo.",
        );
        if (!result.ok) {
          return {
            ok: false,
            message:
              result.message || "Contrasena incorrecta. Intenta de nuevo.",
          };
        }

        const access = normalizeEventAccessVerification(result.data);
        if (!access.accessToken && access.passwordProtected) {
          return {
            ok: false,
            message: "No pudimos abrir esta pagina. Intenta de nuevo.",
          };
        }

        const verifiedAccessVersion =
          clean(access.accessVersion) || accessVersion;
        if (verifiedAccessVersion && verifiedAccessVersion !== accessVersion) {
          setAccessVersion(verifiedAccessVersion);
        }

        if (access.accessToken) {
          storeEventAccessToken(
            {
              eventsUrl,
              identifier: id,
              accessVersion: verifiedAccessVersion,
              invitationToken,
            },
            access.accessToken,
          );
          setAccessToken(access.accessToken);

          try {
            const verifiedPayload = await fetchPublicEventAccessSpec({
              eventsUrl,
              identifier: id,
              previewToken,
              previewCacheKey,
              sendCacheKey,
              invitationToken,
              accessToken: access.accessToken,
            });
            const verifiedSpec = await readPublicPageSpec(verifiedPayload);
            const verifiedAccess = verifiedSpec?.meta.access;
            const nextAccessVersion =
              clean(verifiedAccess?.accessVersion) || verifiedAccessVersion;

            if (
              verifiedSpec &&
              (!verifiedAccess?.passwordProtected ||
                verifiedAccess.previewAuthorized ||
                verifiedAccess.passwordVerified)
            ) {
              setPageSpec(verifiedSpec);
              if (nextAccessVersion) setAccessVersion(nextAccessVersion);
            } else if (
              verifiedSpec &&
              verifiedAccess?.passwordProtected &&
              !verifiedAccess.previewAuthorized &&
              !verifiedAccess.passwordVerified
            ) {
              removeStoredEventAccessToken({
                eventsUrl,
                identifier: id,
                accessVersion: verifiedAccessVersion,
                invitationToken,
              });
              if (
                nextAccessVersion &&
                nextAccessVersion !== verifiedAccessVersion
              ) {
                removeStoredEventAccessToken({
                  eventsUrl,
                  identifier: id,
                  accessVersion: nextAccessVersion,
                  invitationToken,
                });
              }
              setAccessToken("");
              setPasswordRequired(true);
              setPasswordVerified(false);
              return {
                ok: false,
                message: "No pudimos abrir esta pagina. Intenta de nuevo.",
              };
            }
          } catch {
            // Password verification already succeeded. Keep the proof and let
            // section-level requests use it even if PageSpec refresh is flaky.
          }
        }
        setPasswordRequired(false);
        setPasswordVerified(true);
        setReady(true);
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: "Error al verificar. Intenta de nuevo.",
        };
      }
    },
    [
      accessVersion,
      eventsUrl,
      identifier,
      invitationToken,
      previewCacheKey,
      previewToken,
      sendCacheKey,
    ],
  );

  return {
    ready,
    loading,
    passwordRequired,
    passwordVerified,
    accessToken,
    accessVersion,
    pageSpec,
    error,
    verifyPassword,
  };
}
