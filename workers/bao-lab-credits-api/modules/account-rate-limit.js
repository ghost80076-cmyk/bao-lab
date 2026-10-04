import {
  sha256Hex,
} from "./crypto.js";

import {
  fail,
} from "./http.js";

// Account credential rate-limit boundary.
const WorkerAccountRateLimit = (() => {
  function authRateLimitConfigured(
    env
  ) {
    return (
      typeof env
        ?.AUTH_RATE_LIMITER
        ?.limit ===
      "function"
    );
  }

  function authNetworkIdentity(
    request
  ) {
    const ip =
      String(
        request.headers.get(
          "cf-connecting-ip"
        ) ||
        ""
      ).trim();

    return ip
      ? "network:" + ip
      : "";
  }

  async function authRateLimitKey(
    action,
    identity
  ) {
    return (
      "yorubay-auth-v1:" +
      action +
      ":" +
      await sha256Hex(
        String(
          identity ||
          ""
        )
          .trim()
          .toLowerCase()
      )
    );
  }

  async function accountAuthAllowed(
    env,
    action,
    identities
  ) {
    if (
      !authRateLimitConfigured(
        env
      )
    ) {
      return true;
    }

    const unique =
      [
        ...new Set(
          identities
            .map(
              (value) =>
                String(
                  value ||
                  ""
                ).trim()
            )
            .filter(Boolean)
        ),
      ];

    try {
      for (
        const identity
        of unique
      ) {
        const result =
          await env
            .AUTH_RATE_LIMITER
            .limit({
              key:
                await authRateLimitKey(
                  action,
                  identity
                ),
            });

        if (
          !result
            ?.success
        ) {
          return false;
        }
      }

      return true;
    }

    catch (error) {
      console.error(
        "auth_rate_limit_error",
        String(
          error?.message ||
          error
        ).slice(
          0,
          200
        )
      );

      return (
        String(
          env
            .AUTH_RATE_LIMIT_FAIL_CLOSED ||
          ""
        ) !==
        "1"
      );
    }
  }

  function authRateLimited() {
    return fail(
      "auth_rate_limited",
      429
    );
  }

  return Object.freeze({
    authRateLimitConfigured,
    authNetworkIdentity,
    authRateLimitKey,
    accountAuthAllowed,
    authRateLimited,
  });
})();

const {
  authRateLimitConfigured,
  authNetworkIdentity,
  authRateLimitKey,
  accountAuthAllowed,
  authRateLimited,
} = WorkerAccountRateLimit;

export {
  WorkerAccountRateLimit,
  accountAuthAllowed,
  authNetworkIdentity,
  authRateLimitConfigured,
  authRateLimitKey,
  authRateLimited,
};
