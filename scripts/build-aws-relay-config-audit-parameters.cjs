#!/usr/bin/env node

const commands = [
  "set -eu",
  "UNIT=bao-backend.service",
  "PID=\$(systemctl show \"\$UNIT\" -p MainPID --value)",
  "test -n \"\$PID\" && test \"\$PID\" != \"0\"",
  "ACTUAL=\$(tr '\\0' '\\n' < \"/proc/\$PID/environ\" | sed -n 's/^OPENROUTER_MODELS=//p')",
  "printf 'ACTUAL_OPENROUTER_MODELS=%s\\n' \"\$ACTUAL\"",
  "FRAGMENT=\$(systemctl show \"\$UNIT\" -p FragmentPath --value)",
  "printf 'FRAGMENT_PATH=%s\\n' \"\$FRAGMENT\"",
  "printf 'ENVIRONMENT_FILES=%s\\n' \"\$(systemctl show \"\$UNIT\" -p EnvironmentFiles --value)\"",
  "if [ -n \"\$FRAGMENT\" ] && [ -f \"\$FRAGMENT\" ]; then grep -nE '^[[:space:]]*EnvironmentFile=' \"\$FRAGMENT\" || true; sed -nE 's/.*OPENROUTER_MODELS=([^\\" ]*).*/UNIT_OPENROUTER_MODELS=\\1/p' \"\$FRAGMENT\" || true; fi",
  "for DROPIN in \$(systemctl show \"\$UNIT\" -p DropInPaths --value); do printf 'DROPIN_PATH=%s\\n' \"\$DROPIN\"; grep -nE '^[[:space:]]*EnvironmentFile=' \"\$DROPIN\" || true; sed -nE 's/.*OPENROUTER_MODELS=([^\\" ]*).*/DROPIN_OPENROUTER_MODELS=\\1/p' \"\$DROPIN\" || true; done",
];

process.stdout.write(JSON.stringify({ commands }));
