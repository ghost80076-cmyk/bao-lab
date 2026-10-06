import {
  newOpaqueToken,
  sha256Hex,
} from "./crypto.js";

import {
  SESSION_COOKIE_NAME,
} from "./http.js";

import {
  sessionTtlDays,
} from "./runtime-config.js";

const SESSION_COOKIE_FALLBACK_TTL_DAYS = 30;

// Internal session/authentication boundary. It owns credential extraction,
// session-cookie handling, authenticated player lookup and session creation.
// Registration/login/recovery route policy stays outside this block.
const WorkerSessionAuth = (() => {
  function tokenFrom(
    request
  ) {
    const header =
      request.headers.get(
        "authorization"
      ) || "";
  
    return header.startsWith(
      "Bearer "
    )
      ? header.slice(7)
      : "";
  }
  
  function cookieFrom(
    request,
    name
  ) {
    const raw =
      request.headers.get(
        "cookie"
      ) || "";
  
    for (
      const part of
        raw.split(";")
    ) {
      const item =
        part.trim();
  
      const prefix =
        `${name}=`;
  
      if (
        item.startsWith(
          prefix
        )
      ) {
        try {
          return decodeURIComponent(
            item.slice(
              prefix.length
            )
          );
        } catch (_) {
          return "";
        }
      }
    }
  
    return "";
  }
  
  function sessionTokenFrom(
    request
  ) {
    return (
      tokenFrom(
        request
      ) ||
      cookieFrom(
        request,
        SESSION_COOKIE_NAME
      )
    );
  }
  
  function responseWithCookie(
    response,
    cookie
  ) {
    const headers =
      new Headers(
        response.headers
      );
  
    headers.append(
      "set-cookie",
      cookie
    );
  
    return new Response(
      response.body,
      {
        status:
          response.status,
  
        headers,
      }
    );
  }
  
  function withSessionCookie(
    response,
    token,
    expiresAt
  ) {
    const expires =
      new Date(
        expiresAt
      );
  
    const maxAge =
      Number.isFinite(
        expires.getTime()
      )
        ? Math.max(
            0,
            Math.floor(
              (
                expires.getTime() -
                Date.now()
              ) /
                1000
            )
          )
        : SESSION_COOKIE_FALLBACK_TTL_DAYS *
          86400;
  
    return responseWithCookie(
      response,
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
    );
  }
  
  function clearSessionCookie(
    response
  ) {
    return responseWithCookie(
      response,
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    );
  }

  async function playerFor(
    request,
    db
  ) {
    const token =
      sessionTokenFrom(
        request
      );
  
    if (
      !token ||
      token.length >
        512
    ) {
      return null;
    }
  
    const tokenHash =
      await sha256Hex(
        token
      );
  
    const sessionPlayer =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
  
            w.balance_microusd
              AS wallet_balance_microusd,
  
            w.currency
              AS wallet_currency,
  
            w.billing_mode
              AS wallet_billing_mode,
  
            w.enabled
              AS wallet_enabled,
  
            a.username,
            a.display_name,
  
            s.session_id,
            s.expires_at
  
          FROM auth_sessions s
  
          JOIN players p
            ON p.id =
              s.player_id
  
          LEFT JOIN wallets w
            ON w.player_id =
              p.id
  
          LEFT JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            s.token_hash = ?
  
            AND
            s.revoked_at
              IS NULL
  
            AND
            datetime(
              s.expires_at
            ) >
            datetime('now')
  
          LIMIT 1
          `
        )
        .bind(
          tokenHash
        )
        .first();
  
    if (
      sessionPlayer
    ) {
      return {
        ...sessionPlayer,
  
        auth_type:
          "session",
      };
    }
  
    const legacyPlayer =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
  
            w.balance_microusd
              AS wallet_balance_microusd,
  
            w.currency
              AS wallet_currency,
  
            w.billing_mode
              AS wallet_billing_mode,
  
            w.enabled
              AS wallet_enabled,
  
            a.username,
            a.display_name
  
          FROM players p
  
          LEFT JOIN wallets w
            ON w.player_id =
              p.id
  
          LEFT JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            p.token_hash = ?
  
          LIMIT 1
          `
        )
        .bind(
          tokenHash
        )
        .first();
  
    return legacyPlayer
      ? {
          ...legacyPlayer,
  
          auth_type:
            "legacy",
        }
      : null;
  }
  
  async function createSession(
    db,
    playerId,
    env
  ) {
    const sessionToken =
      newOpaqueToken(
        "yb_s_",
        32
      );
  
    const sessionId =
      crypto.randomUUID();
  
    const expires =
      new Date(
        Date.now() +
        sessionTtlDays(
          env
        ) *
        86400_000
      ).toISOString();
  
    await db
      .prepare(
        `
        INSERT INTO auth_sessions (
          session_id,
          player_id,
          token_hash,
          expires_at,
          created_at,
          last_seen_at
        )
  
        VALUES (
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        `
      )
      .bind(
        sessionId,
        playerId,
        await sha256Hex(
          sessionToken
        ),
        expires
      )
      .run();
  
    return {
      sessionToken,
      sessionId,
  
      expiresAt:
        expires,
    };
  }

  return Object.freeze({
    tokenFrom,
    cookieFrom,
    sessionTokenFrom,
    responseWithCookie,
    withSessionCookie,
    clearSessionCookie,
    playerFor,
    createSession,
  });
})();

const {
  tokenFrom,
  cookieFrom,
  sessionTokenFrom,
  responseWithCookie,
  withSessionCookie,
  clearSessionCookie,
  playerFor,
  createSession,
} = WorkerSessionAuth;

export {
  WorkerSessionAuth,
  clearSessionCookie,
  cookieFrom,
  createSession,
  playerFor,
  responseWithCookie,
  sessionTokenFrom,
  tokenFrom,
  withSessionCookie,
};

