const base = String(
  process.env.YORUBAY_API_BASE ||
  "https://api.yorubay.com"
).replace(/\/+$/, "");

const allowedOrigin = String(
  process.env.YORUBAY_ALLOWED_ORIGIN ||
  "https://yorubay.com"
);

const issues = [];

function check(condition, message) {
  if (!condition) issues.push(message);
}

function header(response, name) {
  return response.headers.get(name) || "";
}

(async () => {
  const health = await fetch(`${base}/health`, {
    headers: { origin: allowedOrigin },
  });

  check(health.status === 200, `health returned ${health.status}`);
  check(header(health, "cache-control") === "no-store", "cache-control must be no-store");
  check(header(health, "x-content-type-options") === "nosniff", "x-content-type-options must be nosniff");
  check(header(health, "x-frame-options") === "DENY", "x-frame-options must be DENY");
  check(header(health, "referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
  check(/camera=\(\)/.test(header(health, "permissions-policy")), "permissions-policy must disable camera");
  check(/default-src 'none'/.test(header(health, "content-security-policy")), "content-security-policy must default to none");
  check(/max-age=31536000/.test(header(health, "strict-transport-security")), "strict-transport-security must pin HTTPS for one year");
  check(header(health, "access-control-allow-origin") === allowedOrigin, "credentialed CORS must echo the allowed origin");
  check(header(health, "access-control-allow-credentials") === "true", "credentialed CORS must remain enabled");

  const body = await health.json();
  check(body.ok === true, "health payload is not ok");
  check(body.security_contract_version === "2026-10-04-1", "production Worker source is not on the reviewed security contract");
  check(body.auth_rate_limit_configured === true, "AUTH_RATE_LIMITER is not bound in production");
  check(body.public_registration_protected === true, "public registration is open without account rate limiting");

  const blockedOrigin = await fetch(`${base}/health`, {
    headers: { origin: "https://security-audit.invalid" },
  });
  check(blockedOrigin.status === 403, `foreign Origin returned ${blockedOrigin.status}, expected 403`);
  check(blockedOrigin.headers.get("access-control-allow-origin") === null, "blocked origins must not receive an allow-origin header");

  const preflight = await fetch(`${base}/auth/logout`, {
    method: "OPTIONS",
    headers: {
      origin: allowedOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  check(preflight.status === 204, `preflight returned ${preflight.status}, expected 204`);
  check(preflight.headers.get("access-control-allow-origin") === allowedOrigin, "preflight must echo the allowed origin");

  if (issues.length) {
    throw new Error("\n- " + issues.join("\n- "));
  }

  console.log(`production security audit passed: ${base}`);
})().catch((error) => {
  console.error(`production security audit failed: ${error.message}`);
  process.exitCode = 1;
});
