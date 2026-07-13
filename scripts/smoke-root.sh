#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?usage: smoke-root.sh <deployment-base-url>}"
dashboard_url="${PUBLIC_DASHBOARD_URL:?PUBLIC_DASHBOARD_URL is required}"
dashboard_url="${dashboard_url%/}"
html_file="$(mktemp)"
trap 'rm -f "$html_file"' EXIT

case "$base_url" in
  https://*) ;;
  *) echo "Root smoke target must use HTTPS" >&2; exit 1 ;;
esac

case "$dashboard_url" in
  https://*) ;;
  *) echo "PUBLIC_DASHBOARD_URL must use HTTPS" >&2; exit 1 ;;
esac

curl --fail --silent --show-error --location \
  --retry 6 --retry-all-errors --retry-delay 5 --max-time 20 \
  --output "$html_file" \
  "${base_url%/}/"

grep -Fq 'data-eventi-home' "$html_file" || {
  echo "Root page did not render the EventiApp landing marker" >&2
  exit 1
}

grep -Fq "href=\"${dashboard_url}\"" "$html_file" || {
  echo "Root page does not point to the configured dashboard URL" >&2
  exit 1
}
