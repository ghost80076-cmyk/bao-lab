#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const geminiAudit = fs.readFileSync(path.join(__dirname, "audit-gemini-relay-env.py"), "utf8");
const commands = [
  String.raw`set -eu`,
  String.raw`UNIT=bao-backend.service`,
  String.raw`PID="$(systemctl show "$UNIT" -p MainPID --value)"`,
  String.raw`test -n "$PID" && test "$PID" != "0"`,
  `python3 - "$PID" <<'YORUBAY_GEMINI_AUDIT'\n${geminiAudit}\nYORUBAY_GEMINI_AUDIT`,
  String.raw`ACTUAL="$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^OPENROUTER_MODELS=//p')"`,
  String.raw`printf 'ACTUAL_OPENROUTER_MODELS=%s\n' "$ACTUAL"`,
  String.raw`FRAGMENT="$(systemctl show "$UNIT" -p FragmentPath --value)"`,
  String.raw`printf 'FRAGMENT_PATH=%s\n' "$FRAGMENT"`,
  String.raw`printf 'ENVIRONMENT_FILES=%s\n' "$(systemctl show "$UNIT" -p EnvironmentFiles --value)"`,
  String.raw`if [ -n "$FRAGMENT" ] && [ -f "$FRAGMENT" ]; then grep -nE '^[[:space:]]*EnvironmentFile=' "$FRAGMENT" || true; sed -nE 's/.*OPENROUTER_MODELS=([^" ]*).*/UNIT_OPENROUTER_MODELS=\1/p' "$FRAGMENT" || true; fi`,
  String.raw`for DROPIN in $(systemctl show "$UNIT" -p DropInPaths --value); do printf 'DROPIN_PATH=%s\n' "$DROPIN"; grep -nE '^[[:space:]]*EnvironmentFile=' "$DROPIN" || true; sed -nE 's/.*OPENROUTER_MODELS=([^" ]*).*/DROPIN_OPENROUTER_MODELS=\1/p' "$DROPIN" || true; done`,
];

process.stdout.write(JSON.stringify({ commands }));
