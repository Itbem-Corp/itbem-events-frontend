import type { PageSpec } from "../components/engine/types";
import { buildIdentifierPageSpecUrl } from "./pageSpecUrl";
import { readPageSpecPayload } from "./pageSpecCache";
import { publicAccessFetchInit } from "./publicPreview";

interface PublicEventShellInput {
  eventsUrl: string;
  identifier: string;
  previewToken?: string;
  cacheKey?: string;
  invitationToken?: string;
  accessToken?: string;
}

/**
 * Fetches only the safe SSR shell for an invitation. Password-protected pages
 * deliberately return null: their PageSpec must never be serialized into the
 * shareable HTML response, even for a valid browser-session proof.
 */
export async function fetchPublicEventShell(
  input: PublicEventShellInput,
): Promise<PageSpec | null> {
  if (!input.identifier) return null;

  // Credential-bearing pages are intentionally client-only. Even though the
  // middleware marks them no-store, keeping their data out of HTML entirely
  // prevents an intermediary or future cache-rule regression from exposing it.
  if (
    input.previewToken ||
    input.cacheKey ||
    input.invitationToken ||
    input.accessToken
  ) {
    return null;
  }

  try {
    const response = await fetch(
      buildIdentifierPageSpecUrl(
        input.eventsUrl,
        input.identifier,
        input.previewToken,
        input.cacheKey,
        input.invitationToken,
      ),
      publicAccessFetchInit(
        {
          previewToken: input.previewToken,
          invitationToken: input.invitationToken,
          accessToken: input.accessToken,
        },
        // Never make the public HTML wait materially longer for this optional
        // enhancement; the client renderer remains available as a fallback.
        { signal: AbortSignal.timeout(1200) },
      ),
    );
    if (!response.ok) return null;

    const spec = readPageSpecPayload(await response.json());
    return spec && !spec.meta.access?.passwordProtected ? spec : null;
  } catch {
    // The interactive client remains the resilient fallback if the edge/API is slow.
    return null;
  }
}
