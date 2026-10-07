import {
  COST_BILLING_MODE,
} from "./billing-constants.js";

import {
  accountAuthAllowed,
  authNetworkIdentity,
  authRateLimited,
} from "./account-rate-limit.js";

import {
  validDisplayName,
  validPassword,
  validUsername,
} from "./account-validation.js";

import {
  constantTimeStringEqual,
  newOpaqueToken,
  newRecoveryCode,
  normalizeRecoveryCode,
  passwordMatches,
  passwordRecord,
  publicPlayerId,
  sha256Hex,
} from "./crypto.js";

import {
  fail,
  json,
  readJson,
} from "./http.js";

import {
  registrationMode,
} from "./runtime-config.js";

import {
  clearSessionCookie,
  createSession,
  sessionTokenFrom,
  withSessionCookie,
} from "./session-auth.js";

// Account credential route boundary. It owns registration, login, logout and
// recovery policy while validation, rate limiting, crypto and sessions remain
// explicit module dependencies.
const WorkerAccountAuth = (() => {
  async function authRegister(
    request,
    env,
    db
  ) {
    if (
      registrationMode(
        env
      ) ===
      "closed"
    ) {
      return fail(
        "registration_closed",
        403
      );
    }
  
    const body =
      await readJson(
        request
      );
  
    const username =
      validUsername(
        body?.username
      );
  
    const displayName =
      validDisplayName(
        body
          ?.display_name ||
        body?.username
      );
  
    const password =
      body?.password;
  
    if (
      !username ||
      !displayName ||
      !validPassword(
        password
      )
    ) {
      return fail(
        "invalid_registration",
        400,
        {
          username_rule:
            "3-32 letters/numbers/._-",
  
          password_rule:
            "10-128 characters",
        }
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "register",
          [
            "username:" +
              username,
            authNetworkIdentity(
              request
            ),
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const existing =
      await db
        .prepare(
          `
          SELECT
            account_id
  
          FROM accounts
  
          WHERE
            username = ?
  
          LIMIT 1
          `
        )
        .bind(
          username
        )
        .first();
  
    if (
      existing
    ) {
      return fail(
        "username_taken",
        409
      );
    }
  
    const playerId =
      crypto.randomUUID();
  
    const accountId =
      crypto.randomUUID();
  
    const publicId =
      publicPlayerId();
  
    const deadLegacyToken =
      newOpaqueToken(
        "bao_",
        32
      );
  
    const recoveryCode =
      newRecoveryCode();
  
    const recoveryHash =
      await sha256Hex(
        normalizeRecoveryCode(
          recoveryCode
        )
      );
  
    const pw =
      await passwordRecord(
        password
      );
  
    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO players (
              id,
              public_id,
              recovery_hash,
              token_hash,
              balance_microusd,
              daily_chat_limit,
              enabled
            )
  
            VALUES (
              ?,
              ?,
              ?,
              ?,
              0,
              200,
              1
            )
            `
          )
          .bind(
            playerId,
            publicId,
            recoveryHash,
            await sha256Hex(
              deadLegacyToken
            )
          ),
  
        db
          .prepare(
            `
            INSERT INTO wallets (
              player_id,
              balance_microusd,
              currency,
              billing_mode,
              enabled
            )
  
            VALUES (
              ?,
              0,
              'USD',
              ?,
              1
            )
            `
          )
          .bind(
            playerId,
            COST_BILLING_MODE
          ),
  
        db
          .prepare(
            `
            INSERT INTO accounts (
              account_id,
              player_id,
              username,
              display_name,
              password_hash,
              password_salt,
              password_iterations,
              enabled,
              created_at,
              updated_at
            )
  
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              1,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            `
          )
          .bind(
            accountId,
            playerId,
            username,
            displayName,
            pw.password_hash,
            pw.password_salt,
            pw
              .password_iterations
          ),
      ]
    );
  
    const session =
      await createSession(
        db,
        playerId,
        env
      );
  
    return withSessionCookie(
      json(
        {
          created:
            true,
  
          public_id:
            publicId,
  
          username,
  
          display_name:
            displayName,
  
          // Kept during the compatibility window for older cached clients.
          // Current clients authenticate through the HttpOnly cookie.
          session_token:
            session
              .sessionToken,
  
          session_expires_at:
            session
              .expiresAt,
  
          recovery_code:
            recoveryCode,
  
          wallet_balance_microusd:
            0,
  
          wallet_balance_usd:
            0,
        },
        201
      ),
      session.sessionToken,
      session.expiresAt
    );
  }
  
  async function authLogin(
    request,
    env,
    db
  ) {
    const body =
      await readJson(
        request
      );
  
    const username =
      validUsername(
        body?.username
      );
  
    const password =
      body?.password;
  
    if (
      !username ||
      !validPassword(
        password
      )
    ) {
      return fail(
        "invalid_credentials",
        401
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "login",
          [
            "username:" +
              username,
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const account =
      await db
        .prepare(
          `
          SELECT
            a.account_id,
            a.player_id,
            a.username,
            a.display_name,
            a.password_hash,
            a.password_salt,
            a.password_iterations,
  
            a.enabled
              AS account_enabled,
  
            p.public_id,
  
            p.enabled
              AS player_enabled
  
          FROM accounts a
  
          JOIN players p
            ON p.id =
              a.player_id
  
          WHERE
            a.username = ?
  
          LIMIT 1
          `
        )
        .bind(
          username
        )
        .first();
  
    if (
      !account ||
      !account
        .account_enabled ||
      !account
        .player_enabled ||
      !(
        await passwordMatches(
          password,
          account
        )
      )
    ) {
      return fail(
        "invalid_credentials",
        401
      );
    }
  
    await db
      .prepare(
        `
        UPDATE auth_sessions
  
        SET
          revoked_at =
            COALESCE(
              revoked_at,
              CURRENT_TIMESTAMP
            )
  
        WHERE
          player_id = ?
  
          AND
          revoked_at
            IS NULL
  
          AND
          datetime(
            expires_at
          ) <=
          datetime('now')
        `
      )
      .bind(
        account.player_id
      )
      .run();
  
    const session =
      await createSession(
        db,      account.player_id,
        env
      );
  
    await db
      .prepare(
        `
        UPDATE accounts
  
        SET
          last_login_at =
            CURRENT_TIMESTAMP,
  
          updated_at =
            CURRENT_TIMESTAMP
  
        WHERE
          account_id = ?
        `
      )
      .bind(
        account.account_id
      )
      .run();
  
    return withSessionCookie(
      json({
        logged_in:
          true,
  
        public_id:
          account.public_id,
  
        username:
          account.username,
  
        display_name:
          account.display_name,
  
        // Compatibility only; the new frontend never persists this value.
        session_token:
          session.sessionToken,
  
        session_expires_at:
          session.expiresAt,
      }),
      session.sessionToken,
      session.expiresAt
    );
  }
  
  async function authLogout(
    request,
    db
  ) {
    const token =
      sessionTokenFrom(
        request
      );
  
    if (!token) {
      return clearSessionCookie(
        json({
          logged_out:
            true,
        })
      );
    }
  
    const tokenHash =
      await sha256Hex(
        token
      );
  
    await db
      .prepare(
        `
        UPDATE auth_sessions
  
        SET
          revoked_at =
            COALESCE(
              revoked_at,
              CURRENT_TIMESTAMP
            )
  
        WHERE
          token_hash = ?
        `
      )
      .bind(
        tokenHash
      )
      .run();
  
    return clearSessionCookie(
      json({
        logged_out:
          true,
      })
    );
  }
  
  async function authRecover(
    request,
    env,
    db
  ) {
    const body =
      await readJson(
        request
      );
  
    const publicId =
      String(
        body?.public_id ||
        ""
      )
        .trim()
        .toUpperCase();
  
    const recovery =
      normalizeRecoveryCode(
        body
          ?.recovery_code
      );
  
    const newPassword =
      body
        ?.new_password;
  
    if (
      !/^YR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(
        publicId
      ) ||
      recovery.length <
        20 ||
      !validPassword(
        newPassword
      )
    ) {
      return fail(
        "invalid_recovery_request",
        400
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "recover",
          [
            "public_id:" +
              publicId,
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const row =
      await db
        .prepare(
          `
          SELECT
            p.id
              AS player_id,
  
            p.recovery_hash,
  
            a.account_id,
            a.username,
            a.display_name
  
          FROM players p
  
          JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            p.public_id = ?
  
            AND
            p.enabled = 1
  
            AND
            a.enabled = 1
  
          LIMIT 1
          `
        )
        .bind(
          publicId
        )
        .first();
  
    if (
      !row ||
      !constantTimeStringEqual(
        await sha256Hex(
          recovery
        ),
        row.recovery_hash
      )
    ) {
      return fail(
        "invalid_recovery_credentials",
        401
      );
    }
  
    const pw =
      await passwordRecord(
        newPassword
      );
  
    const newRecovery =
      newRecoveryCode();
  
    const newRecoveryHash =
      await sha256Hex(
        normalizeRecoveryCode(
          newRecovery
        )
      );
  
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE accounts
  
            SET
              password_hash = ?,
              password_salt = ?,
              password_iterations = ?,
              updated_at =
                CURRENT_TIMESTAMP
  
            WHERE
              account_id = ?
            `
          )
          .bind(
            pw.password_hash,
            pw.password_salt,
            pw
              .password_iterations,
            row.account_id
          ),
  
        db
          .prepare(
            `
            UPDATE players
  
            SET
              recovery_hash = ?
  
            WHERE
              id = ?
            `
          )
          .bind(
            newRecoveryHash,
            row.player_id
          ),
  
        db
          .prepare(
            `
            UPDATE auth_sessions
  
            SET
              revoked_at =
                COALESCE(
                  revoked_at,
                  CURRENT_TIMESTAMP
                )
  
            WHERE
              player_id = ?
  
              AND
              revoked_at
                IS NULL
            `
          )
          .bind(
            row.player_id
          ),
      ]
    );
  
    const session =
      await createSession(
        db,
        row.player_id,
        env
      );
  
    return withSessionCookie(
      json({
        recovered:
          true,
  
        public_id:
          publicId,
  
        username:
          row.username,
  
        display_name:
          row.display_name,
  
        // Compatibility only; the new frontend never persists this value.
        session_token:
          session.sessionToken,
  
        session_expires_at:
          session.expiresAt,
  
        recovery_code:
          newRecovery,
      }),
      session.sessionToken,
      session.expiresAt
    );
  }

  return Object.freeze({
    authRegister,
    authLogin,
    authLogout,
    authRecover,
  });
})();

const {
  authRegister,
  authLogin,
  authLogout,
  authRecover,
} = WorkerAccountAuth;

export {
  WorkerAccountAuth,
  authLogin,
  authLogout,
  authRecover,
  authRegister,
};

