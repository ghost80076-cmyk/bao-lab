import {
  fail,
  json,
  readJson,
} from "./http.js";

// Existing-player admin mutations: legacy credit, wallet top-up and enable/disable.
const adminPlayerMutationInteger = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const adminPlayerMutationSafeMoneyInt = (n) =>
  adminPlayerMutationInteger(
    n,
    0,
    9_000_000_000_000
  )
    ? n
    : 0;

const WorkerAdminPlayerMutationRoutes = (() => {
async function adminPlayerMutationRoute(
  request,
  path,
  db
) {
  const match =
    path.match(
      /^\/admin\/players\/([0-9a-f-]{36})\/(credit|wallet-credit|disable|enable)$/
    );

  if (
    match &&
    request.method ===
      "POST"
  ) {
    const playerId =
      match[1];

    const action =
      match[2];

    if (
      action ===
        "disable" ||
      action ===
        "enable"
    ) {
      const body =
        await readJson(
          request
        );

      const reason =
        String(
          body?.reason ||
          ""
        )
          .trim()
          .slice(
            0,
            300
          );

      const enabling =
        action ===
          "enable";

      const nextEnabled =
        enabling
          ? 1
          : 0;

      const result =
        await db
          .prepare(
            `
            UPDATE players

            SET
              enabled = ?

            WHERE
              id = ?

              AND enabled != ?
            `
          )
          .bind(
            nextEnabled,
            playerId,
            nextEnabled
          )
          .run();

      if (
        !result
          .meta
          .changes
      ) {
        const exists =
          await db
            .prepare(
              `
              SELECT
                id,
                enabled

              FROM players

              WHERE
                id = ?

              LIMIT 1
              `
            )
            .bind(
              playerId
            )
            .first();

        if (!exists) {
          return fail(
            "player_not_found",
            404
          );
        }

        return json({
          enabled:
            Boolean(
              exists.enabled
            ),

          unchanged:
            true,
        });
      }

      const statements = [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              enabled = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            nextEnabled,
            playerId
          ),

        db
          .prepare(
            `
            UPDATE accounts

            SET
              enabled = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            nextEnabled,
            playerId
          ),

        db
          .prepare(
            `
            INSERT INTO admin_player_events (
              event_id,
              player_id,
              action,
              reason
            )

            VALUES (
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            crypto.randomUUID(),
            playerId,
            action,
            reason ||
              null
          ),
      ];

      if (!enabling) {
        statements.push(
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
              playerId
            )
        );
      }

      await db.batch(
        statements
      );

      return json({
        enabled:
          enabling,

        action,

        reason:
          reason ||
          null,

        session_relogin_required:
          enabling,
      });
    }

    const body =
      await readJson(
        request
      );

    if (
      action ===
      "credit"
    ) {
      const amount =
        body
          ?.amount_credits ??
        body
          ?.amount_microusd;

      if (
        !adminPlayerMutationInteger(
          amount,
          1,
          100_000_000
        )
      ) {
        return fail(
          "invalid_credit_amount"
        );
      }

      const result =
        await db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?

              AND
              balance_microusd <=
                1000000000 -
                ?
            `
          )
          .bind(
            amount,
            playerId,
            amount
          )
          .run();

      return result
        .meta
        .changes
        ? json({
            credited_legacy_credits:
              amount,
          })
        : fail(
            "player_not_found_or_balance_limit",
            404
          );
    }

    const creditMicrousd =
      body
        ?.credit_added_microusd ??
      body
        ?.amount_microusd;

    const paymentCurrency =
      String(
        body
          ?.payment_currency ||
        "USD"
      )
        .trim()
        .toUpperCase();

    const paymentMinor =
      Number(
        body
          ?.payment_amount_minor ??
        0
      );

    const processorFeeMinor =
      Number(
        body
          ?.processor_fee_minor ??
        0
      );

    const netReceivedMinor =
      Number(
        body
          ?.net_received_minor ??
        Math.max(
          0,
          paymentMinor -
          processorFeeMinor
        )
      );

    if (
      !adminPlayerMutationInteger(
        creditMicrousd,
        1,
        1_000_000_000_000
      ) ||
      ![
        "TWD",
        "USD",
      ].includes(
        paymentCurrency
      ) ||
      !adminPlayerMutationInteger(
        paymentMinor,
        0,
        1_000_000_000
      ) ||
      !adminPlayerMutationInteger(
        processorFeeMinor,
        0,
        1_000_000_000
      ) ||
      !adminPlayerMutationInteger(
        netReceivedMinor,
        0,
        1_000_000_000
      ) ||
      processorFeeMinor >
        paymentMinor ||
      netReceivedMinor >
        paymentMinor
    ) {
      return fail(
        "invalid_wallet_credit_amount"
      );
    }

    // Reuse the same operation key on retries, including after an HTTP timeout.
    const requestKey = body?.idempotency_key;
    if (typeof requestKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
      return fail("invalid_idempotency_key", 400);
    }
    const paymentMethod = String(body?.payment_method || "manual").slice(0, 80);
    const paymentReference = String(body?.payment_reference || "").trim().slice(0, 200);
    const note = String(body?.note || "").slice(0, 500);
    const requestPayload = JSON.stringify([
      playerId, creditMicrousd, paymentCurrency, paymentMinor,
      processorFeeMinor, netReceivedMinor, paymentMethod, paymentReference, note,
    ]);
    const topupId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const legacyPaymentMicrousd =
      paymentCurrency === "USD" ? paymentMinor * 10_000 : 0;

    // No historical wallet_topups schema migration required.
    await db.prepare(`CREATE TABLE IF NOT EXISTS wallet_topup_requests (
      request_key TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      topup_id TEXT NOT NULL UNIQUE,
      request_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Atomic D1 batch: claim the unique request first. Subsequent updates
    // execute only for the newly claimed topup_id, so retries are read-only.
    const results = await db.batch([
      db.prepare(`INSERT INTO wallet_topup_requests
        (request_key, player_id, topup_id, request_payload)
        SELECT ?, w.player_id, ?, ? FROM wallets w
        WHERE w.player_id = ? AND w.enabled = 1
          AND w.balance_microusd BETWEEN 0 AND 9000000000000 - ?
          AND (? = '' OR NOT EXISTS (
            SELECT 1 FROM wallet_topups t
            WHERE t.payment_method = ? AND t.payment_reference = ?
          ))
        ON CONFLICT(request_key) DO NOTHING`)
        .bind(requestKey, topupId, requestPayload, playerId, creditMicrousd,
          paymentReference, paymentMethod, paymentReference),
      db.prepare(`UPDATE wallets
        SET balance_microusd = balance_microusd + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE player_id = ? AND enabled = 1
          AND balance_microusd BETWEEN 0 AND 9000000000000 - ?
          AND EXISTS (SELECT 1 FROM wallet_topup_requests
            WHERE request_key = ? AND topup_id = ?)`)
        .bind(creditMicrousd, playerId, creditMicrousd, requestKey, topupId),
      db.prepare(`INSERT INTO wallet_topups (
        topup_id, player_id, payment_amount_microusd, credit_added_microusd,
        payment_method, payment_reference, note,
        payment_amount_minor, payment_currency, processor_fee_minor, net_received_minor
      ) SELECT ?, r.player_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM wallet_topup_requests r
        WHERE r.request_key = ? AND r.topup_id = ?`)
        .bind(topupId, legacyPaymentMicrousd, creditMicrousd,
          paymentMethod, paymentReference, note, paymentMinor, paymentCurrency,
          processorFeeMinor, netReceivedMinor, requestKey, topupId),
      db.prepare(`INSERT INTO wallet_ledger (
        ledger_id, player_id, entry_type, amount_microusd,
        balance_before_microusd, balance_after_microusd, reference_id, note
      ) SELECT ?, r.player_id, 'topup', ?, w.balance_microusd - ?,
          w.balance_microusd, r.topup_id, ?
        FROM wallet_topup_requests r
        JOIN wallets w ON w.player_id = r.player_id
        WHERE r.request_key = ? AND r.topup_id = ?`)
        .bind(ledgerId, creditMicrousd, creditMicrousd, note, requestKey, topupId),
    ]);
    const existing = await db.prepare(`SELECT r.topup_id, r.player_id,
        r.request_payload, l.balance_after_microusd
      FROM wallet_topup_requests r
      JOIN wallet_ledger l ON l.reference_id = r.topup_id
      WHERE r.request_key = ?`).bind(requestKey).first();
    if (existing && existing.request_payload !== requestPayload)
      return fail("idempotency_key_conflict", 409);
    if (results[0].meta.changes > 0 && (
      results[1].meta.changes !== 1 ||
      results[2].meta.changes !== 1 ||
      results[3].meta.changes !== 1
    )) return fail("wallet_topup_invariant_failed", 500);
    if (!existing) {
      if (paymentReference) {
        const duplicate = await db.prepare(`SELECT topup_id FROM wallet_topups
          WHERE payment_method = ? AND payment_reference = ? LIMIT 1`)
          .bind(paymentMethod, paymentReference).first();
        if (duplicate) return fail("duplicate_payment_reference", 409);
      }
      return fail("player_wallet_not_found_or_balance_limit", 409);
    }
    const wallet = await db.prepare(`SELECT balance_microusd FROM wallets
      WHERE player_id = ?`).bind(playerId).first();
    const balance = adminPlayerMutationSafeMoneyInt(wallet?.balance_microusd);
    return json({
      topup_id: existing.topup_id,
      replayed: results[0].meta.changes === 0,
      payment_currency: paymentCurrency,
      payment_amount_minor: paymentMinor,
      processor_fee_minor: processorFeeMinor,
      net_received_minor: netReceivedMinor,
      credited_microusd: creditMicrousd,
      credited_usd: creditMicrousd / 1_000_000,
      wallet_balance_microusd: balance,
      wallet_balance_usd: balance / 1_000_000,
    });
  }

  return null;
}

  return Object.freeze({
    adminPlayerMutationRoute,
  });
})();

const {
  adminPlayerMutationRoute,
} = WorkerAdminPlayerMutationRoutes;

export {
  WorkerAdminPlayerMutationRoutes,
  adminPlayerMutationRoute,
};
