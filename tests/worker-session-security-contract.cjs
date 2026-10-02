const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const SESSION_COOKIE_NAME\s*=\s*"__Host-yorubay_session"/,
  "session cookie must keep the __Host- prefix"
);

for (const cookieTemplate of source.matchAll(/\$\{SESSION_COOKIE_NAME\}[^\n`]+/g)) {
  const value = cookieTemplate[0];
  assert.match(value, /Path=\//, "session cookie must be host-root scoped");
  assert.match(value, /HttpOnly/, "session cookie must stay HttpOnly");
  assert.match(value, /Secure/, "session cookie must stay Secure");
  assert.match(value, /SameSite=Lax/, "session cookie must retain SameSite protection");
  assert.doesNotMatch(value, /Domain=/i, "__Host- cookies must not set Domain");
}

assert.match(
  source,
  /const PASSWORD_ITERATIONS\s*=\s*100_000/,
  "password hashing work factor changed unexpectedly"
);
assert.match(source, /name:\s*"PBKDF2"/, "password hashing must use PBKDF2");
assert.match(source, /hash:\s*"SHA-256"/, "PBKDF2 must use SHA-256");

assert.match(
  source,
  /INSERT INTO auth_sessions[\s\S]*token_hash[\s\S]*await sha256Hex\(\s*sessionToken\s*\)/,
  "raw session tokens must not be stored in auth_sessions"
);
assert.match(
  source,
  /WHERE\s+s\.token_hash\s*=\s*\?[\s\S]*\.bind\(\s*tokenHash\s*\)/,
  "session lookup must compare the hashed token"
);

assert.match(
  source,
  /env\.ALLOWED_ORIGIN[\s\S]*allowed\.includes\(\s*origin\s*\)/,
  "CORS must continue to use the configured origin allowlist"
);
assert.match(
  source,
  /"access-control-allow-credentials"[\s\S]*"true"/,
  "credentialed session requests must retain explicit CORS credentials"
);

console.log("worker-session-security-contract: ok");
