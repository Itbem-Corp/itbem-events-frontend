#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-security-headers.sh <deployment-base-url>}"
headers_file="$(mktemp)"
normalized_file="$(mktemp)"
trap 'rm -f "$headers_file" "$normalized_file"' EXIT
max_attempts="${SMOKE_MAX_ATTEMPTS:-36}"

# The value is intentionally synthetic. This exercises the same SSR branch as
# a credential-bearing preview without putting a real bearer token in CI logs.
for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  : > "$headers_file"
  : > "$normalized_file"

  if curl --fail --silent --show-error --location --max-time 20 \
    --dump-header "$headers_file" --output /dev/null \
    "${base_url%/}/e/security-header-smoke?preview_token=synthetic-smoke-token"; then
    tr -d '\r' < "$headers_file" > "$normalized_file"
    if grep -Eqi '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$' "$normalized_file" \
      && grep -Eqi '^cache-control:.*no-store' "$normalized_file" \
      && grep -Eqi '^pragma:[[:space:]]*no-cache[[:space:]]*$' "$normalized_file"; then
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
exit "$missing_headers"
