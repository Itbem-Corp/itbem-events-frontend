import { PUBLIC_INVITATION_TOKEN_QUERY_KEYS } from "./publicAccessParams";
import { publicQueryParams } from "./publicQueryParams";

export function readPublicInvitationToken(search?: string): string {
  const params = publicQueryParams(search);

  for (const key of PUBLIC_INVITATION_TOKEN_QUERY_KEYS) {
    const token = params.get(key)?.trim();
    if (token) return token;
  }

  return "";
}
