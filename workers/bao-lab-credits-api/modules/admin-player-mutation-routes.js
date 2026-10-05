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

    const current =
      await db
        .prepare(
          `
          SELECT
            balance_microusd

          FROM wallets

          WHERE
            player_id = ?

            AND
            enabled = 1
          `
        )
        .bind(
          playerId
        )
        .first();

    if (
      !current
    ) {
      return fail(
        "player_wallet_not_found",
        404
      );
    }

    const before =
      adminPlayerMutationSafeMoneyInt(
        current
          .balance_microusd
      );

    const after =
      before +
      creditMicrousd;

    if (
      !Number.isSafeInteger(
        after
      )
    ) {
      return fail(
        "wallet_balance_limit"
      );
    }

    const topupId =
      crypto.randomUUID();

    const ledgerId =
      crypto.randomUUID();

    const paymentMethod =
      String(
        body
          ?.payment_method ||
        "manual"
      ).slice(
        0,
        80
      );

    const paymentReference =
      String(
        body
          ?.payment_reference ||
        ""
      ).slice(
        0,
        200
      );
    const note =
      String(
        body?.note ||
        ""
      ).slice(
        0,
        500
      );

    const legacyPaymentMicrousd =
      paymentCurrency ===
      "USD"
        ? paymentMinor *
          10_000
        : 0;

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            after,
            playerId
          ),

        db
          .prepare(
            `
            INSERT INTO wallet_topups (
              topup_id,
              player_id,

              payment_amount_microusd,

              credit_added_microusd,

              payment_method,
              payment_reference,
              note,

              payment_amount_minor,
              payment_currency,

              processor_fee_minor,
              net_received_minor
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            topupId,
            playerId,

            legacyPaymentMicrousd,

            creditMicrousd,

            paymentMethod,
            paymentReference,
            note,

            paymentMinor,
            paymentCurrency,

            processorFeeMinor,
            netReceivedMinor
          ),

        db
          .prepare(
            `
            INSERT INTO wallet_ledger (
              ledger_id,
              player_id,
              entry_type,
              amount_microusd,

              balance_before_microusd,
              balance_after_microusd,

              reference_id,
              note
            )

            VALUES (
              ?,
              ?,
              'topup',
              ?,
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            ledgerId,
            playerId,
            creditMicrousd,
            before,
            after,
            topupId,
            note
          ),
      ]
    );

    return json({
      topup_id:
        topupId,

      payment_currency:
        paymentCurrency,

      payment_amount_minor:
        paymentMinor,

      processor_fee_minor:
        processorFeeMinor,

      net_received_minor:
        netReceivedMinor,

      credited_microusd:
        creditMicrousd,

      credited_usd:
        creditMicrousd /
        1_000_000,

      wallet_balance_microusd:
        after,

      wallet_balance_usd:
        after /
        1_000_000,
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
