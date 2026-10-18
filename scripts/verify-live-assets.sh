#!/usr/bin/env bash
# Run from the checked-out repository. Every asset must match in the same attempt.
set -euo pipefail
: "${SITE_URL:?SITE_URL is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
attempts="${LIVE_VERIFY_ATTEMPTS:-36}"
timeout="${LIVE_VERIFY_TIMEOUT:-15}"
delay="${LIVE_VERIFY_DELAY:-5}"
query="${LIVE_VERIFY_QUERY:-commit}"
for number in "$attempts" "$timeout"; do
  [[ "$number" =~ ^[1-9][0-9]*$ ]] || { echo 'Attempts and timeout must be positive integers.' >&2; exit 2; }
done
[[ "$delay" =~ ^[0-9]+$ ]] || { echo 'Delay must be a nonnegative integer.' >&2; exit 2; }
[[ "$query" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]] || { echo 'Invalid cache query key.' >&2; exit 2; }
(( $# > 0 )) || { echo 'Supply at least one checked-out asset path.' >&2; exit 2; }
for asset in "$@"; do
  [[ -f "$asset" ]] || { printf 'Missing checked-out asset: %s\n' "$asset" >&2; exit 2; }
done
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT
for (( attempt=1; attempt<=attempts; attempt++ )); do
  matched=true
  index=0
  for asset in "$@"; do
    downloaded="$scratch_dir/$index"
    if ! curl --fail --silent --show-error --location --max-time "$timeout" \
      -H 'Cache-Control: no-cache' \
      "${SITE_URL%/}/${asset}?${query}=${GITHUB_SHA}" --output "$downloaded"; then
      printf 'Download failed: %s (attempt %s/%s).\n' "$asset" "$attempt" "$attempts" >&2
      matched=false
    elif ! cmp -s "$asset" "$downloaded"; then
      printf 'Content differs: %s (attempt %s/%s).\n' "$asset" "$attempt" "$attempts" >&2
      matched=false
    fi
    index=$((index + 1))
  done
  if "$matched"; then
    printf 'All %s live assets match commit %s (attempt %s/%s).\n' "$#" "$GITHUB_SHA" "$attempt" "$attempts"
    exit 0
  fi
  if (( attempt < attempts )); then sleep "$delay"; fi
done
echo 'Live assets did not match the checked-out commit within the retry limit.' >&2
exit 1
