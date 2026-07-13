#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-root.sh <deployment-base-url>}"
dashboard_url="${PUBLIC_DASHBOARD_URL:?PUBLIC_DASHBOARD_URL is required}"
dashboard_url="${dashboard_url%/}"
html_file="$(mktemp)"
trap 'rm -f "$html_file"' EXIT
max_attempts="${SMOKE_MAX_ATTEMPTS:-36}"

case "$base_url" in
  https://*) ;;
  *) echo "Root smoke target must use HTTPS" >&2; exit 1 ;;
esac

case "$dashboard_url" in
  https://*) ;;
  *) echo "PUBLIC_DASHBOARD_URL must use HTTPS" >&2; exit 1 ;;
esac

for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
  : > "$html_file"
  if curl --fail --silent --show-error --location --max-time 20 \
    --output "$html_file" \
    "${base_url%/}/" \
    && grep -Fq 'data-eventi-home' "$html_file" \
    && grep -Fq "href=\"${dashboard_url}\"" "$html_file"; then
    exit 0
  fi

  if ((attempt < max_attempts)); then
    sleep 5
  fi
done

root_errors=0
grep -Fq 'data-eventi-home' "$html_file" || {
  echo "Root page did not render the EventiApp landing marker" >&2
  root_errors=1
}
grep -Fq "href=\"${dashboard_url}\"" "$html_file" || {
  echo "Root page does not point to the configured dashboard URL" >&2
  root_errors=1
}
exit "$root_errors"
