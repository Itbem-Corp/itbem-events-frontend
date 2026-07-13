#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-security-headers.sh <deployment-base-url>}"
headers_file="$(mktemp)"
normalized_file="$(mktemp)"
trap 'rm -f "$headers_file" "$normalized_file"' EXIT

# The value is intentionally synthetic. This exercises the same SSR branch as
# a credential-bearing preview without putting a real bearer token in CI logs.
curl --fail --silent --show-error --location \
  --retry 6 --retry-all-errors --retry-delay 5 --max-time 20 \
  --dump-header "$headers_file" --output /dev/null \
  "${base_url%/}/e/security-header-smoke?preview_token=synthetic-smoke-token"

tr -d '\r' < "$headers_file" > "$normalized_file"
grep -Eqi '^referrer-policy:[[:space:]]*no-referrer[[:space:]]*$' "$normalized_file" || {
  echo "Scoped public response is missing Referrer-Policy: no-referrer" >&2
  exit 1
}
grep -Eqi '^cache-control:.*no-store' "$normalized_file" || {
  echo "Scoped public response is missing Cache-Control: no-store" >&2
  exit 1
}
grep -Eqi '^pragma:[[:space:]]*no-cache[[:space:]]*$' "$normalized_file" || {
  echo "Scoped public response is missing Pragma: no-cache" >&2
  exit 1
}
