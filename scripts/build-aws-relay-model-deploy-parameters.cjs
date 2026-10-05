#!/usr/bin/env node

const {
  buildModelDeploymentPlan,
  loadRegistry,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");

const plan = buildModelDeploymentPlan(loadRegistry());
const expected = String(plan?.aws?.value_csv || "").trim();

if (!expected) {
  throw new Error("registry generated an empty AWS OPENROUTER_MODELS value");
}

const expectedBase64 = Buffer.from(expected, "utf8").toString("base64");

const lines = [
  "set -eu",
  "ENV_FILE=/etc/bao-backend.env",
  "SERVICE=bao-backend.service",
  "BACKUP=/etc/bao-backend.env.yorubay-prev",
  "HEALTH_FILE=/tmp/yorubay-backend-health.$$",
  `EXPECTED_B64='${expectedBase64}'`,
  String.raw`EXPECTED="$(printf '%s' "$EXPECTED_B64" | base64 -d)"`,
  String.raw`test -f "$ENV_FILE"`,
  String.raw`COUNT="$(grep -c '^OPENROUTER_MODELS=' "$ENV_FILE" || true)"`,
  String.raw`if [ "$COUNT" != "1" ]; then echo "Expected exactly one OPENROUTER_MODELS assignment in $ENV_FILE; found $COUNT" >&2; exit 1; fi`,
  String.raw`CURRENT="$(sed -n 's/^OPENROUTER_MODELS=//p' "$ENV_FILE")"`,
  String.raw`if [ "$CURRENT" = "$EXPECTED" ]; then echo "AWS relay OPENROUTER_MODELS is already in sync."; exit 0; fi`,
  String.raw`rollback() { echo "ROLLBACK_START"; if [ -f "$BACKUP" ]; then cp -a "$BACKUP" "$ENV_FILE" || true; systemctl restart "$SERVICE" || true; fi; rm -f "$HEALTH_FILE"; echo "ROLLBACK_DONE"; }`,
  String.raw`cp -a "$ENV_FILE" "$BACKUP"`,
  String.raw`TMP="$(mktemp /etc/bao-backend.env.yorubay.XXXXXX)"`,
  String.raw`if ! awk -v value="$EXPECTED" 'BEGIN{done=0} /^OPENROUTER_MODELS=/{print "OPENROUTER_MODELS=" value; done=1; next} {print} END{if(!done) exit 42}' "$ENV_FILE" > "$TMP"; then rm -f "$TMP"; exit 1; fi`,
  String.raw`chown --reference="$ENV_FILE" "$TMP"`,
  String.raw`chmod --reference="$ENV_FILE" "$TMP"`,
  String.raw`if ! mv "$TMP" "$ENV_FILE"; then rm -f "$TMP"; rollback; exit 1; fi`,
  String.raw`if ! systemctl restart "$SERVICE"; then rollback; exit 1; fi`,
  String.raw`ACTIVE_OK=0; for attempt in $(seq 1 30); do if [ "$(systemctl is-active "$SERVICE" || true)" = "active" ]; then ACTIVE_OK=1; break; fi; sleep 1; done; if [ "$ACTIVE_OK" != "1" ]; then echo "$SERVICE did not become active" >&2; rollback; exit 1; fi`,
  String.raw`HEALTH_OK=0; for attempt in $(seq 1 30); do if curl -fsS --max-time 3 http://127.0.0.1:8080/health > "$HEALTH_FILE"; then HEALTH_OK=1; break; fi; sleep 1; done; if [ "$HEALTH_OK" != "1" ]; then echo "Backend health check failed" >&2; rollback; exit 1; fi`,
  String.raw`PID="$(systemctl show "$SERVICE" -p MainPID --value)"`,
  String.raw`ACTUAL="$(tr '\0' '\n' < "/proc/$PID/environ" | sed -n 's/^OPENROUTER_MODELS=//p')"`,
  String.raw`if [ "$ACTUAL" != "$EXPECTED" ]; then echo "Running backend did not load the expected OPENROUTER_MODELS value" >&2; rollback; exit 1; fi`,
  String.raw`rm -f "$HEALTH_FILE" "$BACKUP"`,
  String.raw`echo "AWS relay OPENROUTER_MODELS updated and verified."`,
];

process.stdout.write(JSON.stringify({ commands: [lines.join("\n")] }));
