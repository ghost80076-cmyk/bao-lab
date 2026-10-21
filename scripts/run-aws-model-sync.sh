#!/usr/bin/env bash
# Dispatch one guarded AWS SSM model allowlist sync and report its remote result.
set -euo pipefail

mode="${1:?expected mode}"
expected_sha="${2:-}"
case "$mode" in dry-run|apply|rollback) ;; *) echo 'Invalid model sync mode' >&2; exit 2 ;; esac

parameters="$(mktemp)"
trap 'rm -f "$parameters"' EXIT
node scripts/build-aws-model-sync-parameters.cjs "$mode" "$expected_sha" > "$parameters"

command_id="$(aws ssm send-command \
  --instance-ids i-00a22eb7d55a6ea30 \
  --document-name AWS-RunShellScript \
  --comment "YoruBay model allowlist sync ($mode)" \
  --parameters "file://$parameters" \
  --query 'Command.CommandId' --output text)"
if [[ ! "$command_id" =~ ^[a-f0-9-]{36}$ ]]; then
  echo 'SSM did not return a valid command id' >&2
  exit 1
fi

for attempt in $(seq 1 45); do
  status="$(aws ssm get-command-invocation \
    --command-id "$command_id" --instance-id i-00a22eb7d55a6ea30 \
    --query 'Status' --output text 2>/dev/null || true)"
  case "$status" in
    Success)
      output="$(aws ssm get-command-invocation \
        --command-id "$command_id" --instance-id i-00a22eb7d55a6ea30 \
        --query 'StandardOutputContent' --output text)"
      printf '%s\n' "$output"
      grep -Eq '^RESULT=(dry-run|changed|unchanged|rolled-back)$' <<< "$output" || {
        echo 'SSM succeeded but did not emit a valid model sync result' >&2
        exit 1
      }
      exit 0
      ;;
    Pending|InProgress|Delayed|"") sleep 2 ;;
    *)
      aws ssm get-command-invocation --command-id "$command_id" \
        --instance-id i-00a22eb7d55a6ea30 \
        --query '{Status:Status,Error:StandardErrorContent,Output:StandardOutputContent}' --output json || true
      exit 1
      ;;
  esac
done

echo 'SSM sync timed out; check the remote relay before any further apply.' >&2
exit 1
