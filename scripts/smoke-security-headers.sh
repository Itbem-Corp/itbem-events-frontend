#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-security-headers.sh <deployment-base-url>}"
headers_file="$(mktemp)"
normalized_file="$(mktemp)"
body_file="$(mktemp)"
trap 'rm -f "$headers_file" "$normalized_file" "$body_file"' EXIT
max_attempts="${SMOKE_MAX_ATTEMPTS:-36}"
preview_token="synthetic-preview-token"
invitation_token="synthetic-invitation-token"
access_token="synthetic-access-token"
probe_path="/e/security-header-smoke"
probe_url="${base_url%/}${probe_path}?preview_token=${preview_token}&token=${invitation_token}&access_token=${access_token}&utm_source=security-smoke"
expected_og_url="${base_url%/}${probe_path}?utm_source=security-smoke"

# The value is intentionally synthetic. This exercises the same SSR branch as
# a credential-bearing preview without putting a real bearer token in CI logs.
for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  : > "$headers_file"
  : > "$normalized_file"
  : > "$body_file"

  if curl --fail --silent --show-error --location --max-time 20 \
    --dump-header "$headers_file" --output "$body_file" \
    "$probe_url"; then
    tr -d '\r' < "$headers_file" > "$normalized_file"
    if grep -Eqi '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$' "$normalized_file" \
      && grep -Eqi '^cache-control:.*no-store' "$normalized_file" \
      && grep -Eqi '^pragma:[[:space:]]*no-cache[[:space:]]*$' "$normalized_file" \
      && ! grep -Fq "$preview_token" "$body_file" \
      && ! grep -Fq "$invitation_token" "$body_file" \
      && ! grep -Fq "$access_token" "$body_file" \
      && grep -Fq "content=\"${expected_og_url}\"" "$body_file"; then
      exit 0
    fi
  fi

  if ((attempt < max_attempts)); then
    sleep 5
  fi
done

missing_headers=0
grep -Eqi '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$' "$normalized_file" || {
  echo "Scoped public response is missing Referrer-Policy: no-referrer" >&2
  missing_headers=1
}
grep -Eqi '^cache-control:.*no-store' "$normalized_file" || {
  echo "Scoped public response is missing Cache-Control: no-store" >&2
  missing_headers=1
}
grep -Eqi '^pragma:[[:space:]]*no-cache[[:space:]]*$' "$normalized_file" || {
  echo "Scoped public response is missing Pragma: no-cache" >&2
  missing_headers=1
}
for sensitive_value in "$preview_token" "$invitation_token" "$access_token"; do
  if grep -Fq "$sensitive_value" "$body_file"; then
    echo "Scoped public HTML leaked a synthetic access credential" >&2
    missing_headers=1
  fi
done
grep -Fq "content=\"${expected_og_url}\"" "$body_file" || {
  echo "Scoped public Open Graph URL is missing or still contains access credentials" >&2
  missing_headers=1
}
exit "$missing_headers"
