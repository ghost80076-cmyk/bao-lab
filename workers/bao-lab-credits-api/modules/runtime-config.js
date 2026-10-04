// Runtime binding/config parsing shared by account, billing and routing callers.
// This module reads values only; it performs no storage, settlement or provider I/O.
const RUNTIME_LEGACY_BILLING_MODE = "raw_tokens_v1";
const RUNTIME_COST_BILLING_MODE = "cost_usd_v2";
const RUNTIME_DEFAULT_SESSION_TTL_DAYS = 30;

const runtimeInteger = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const WorkerRuntimeConfig = (() => {
function getDb(
  env
) {
  return (
    env["資料庫"] ||
    env.DB
  );
}

function globalBillingMode(
  env
) {
  return (
    env.BILLING_MODE ===
    RUNTIME_COST_BILLING_MODE
  )
    ? RUNTIME_COST_BILLING_MODE
    : RUNTIME_LEGACY_BILLING_MODE;
}

function billingV2TestPlayers(
  env
) {
  return new Set(
    String(
      env.BILLING_V2_TEST_PLAYERS ||
      ""
    )
      .split(",")
      .map(
        (x) =>
          x
            .trim()
            .toUpperCase()
      )
      .filter(Boolean)
  );
}

function awsOpenRouterPlayers(
  env
) {
  return new Set(
    String(
      env.AWS_OPENROUTER_PLAYERS ||
      ""
    )
      .split(",")
      .map(
        (x) =>
          x
            .trim()
            .toUpperCase()
      )
      .filter(Boolean)
  );
}

function playerUsesAwsOpenRouter(
  env,
  player
) {
  const allowed =
    awsOpenRouterPlayers(
      env
    );

  if (
    !allowed.size ||
    !player
  ) {
    return false;
  }

  return [
    player.id,
    player.public_id,
    player.username,
  ]
    .map(
      (value) =>
        String(
          value || ""
        )
          .trim()
          .toUpperCase()
    )
    .some(
      (value) =>
        value &&
        allowed.has(
          value
        )
    );
}

function billingModeForPlayer(
  env,
  player
) {
  // Account sessions have a dedicated USD wallet.
  // Keep legacy bao_ tokens on the existing billing path.
  if (
    player.auth_type ===
      "session" &&
    player.wallet_billing_mode ===
      RUNTIME_COST_BILLING_MODE
  ) {
    return RUNTIME_COST_BILLING_MODE;
  }

  if (
    globalBillingMode(
      env
    ) ===
    RUNTIME_COST_BILLING_MODE
  ) {
    return (
      RUNTIME_COST_BILLING_MODE
    );
  }

  const test =
    billingV2TestPlayers(
      env
    );

  if (!test.size) {
    return (
      RUNTIME_LEGACY_BILLING_MODE
    );
  }

  return (
    test.has(
      String(
        player.id ||
        ""
      ).toUpperCase()
    ) ||
    test.has(
      String(
        player.public_id ||
        ""
      ).toUpperCase()
    )
  )
    ? RUNTIME_COST_BILLING_MODE
    : RUNTIME_LEGACY_BILLING_MODE;
}

function registrationMode(
  env
) {
  const mode =
    String(
      env.REGISTRATION_MODE ||
      "open"
    ).toLowerCase();

  if (mode === "invite") {
    return "open";
  }

  return [
    "closed",
    "open",
  ].includes(
    mode
  )
    ? mode
    : "closed";
}

function sessionTtlDays(
  env
) {
  const n =
    Number(
      env.SESSION_TTL_DAYS ||
      RUNTIME_DEFAULT_SESSION_TTL_DAYS
    );

  return runtimeInteger(
    n,
    1,
    365
  )
    ? n
    : RUNTIME_DEFAULT_SESSION_TTL_DAYS;
}

  return Object.freeze({
    getDb,
    globalBillingMode,
    billingV2TestPlayers,
    awsOpenRouterPlayers,
    playerUsesAwsOpenRouter,
    billingModeForPlayer,
    registrationMode,
    sessionTtlDays,
  });
})();

const {
  getDb,
  globalBillingMode,
  billingV2TestPlayers,
  awsOpenRouterPlayers,
  playerUsesAwsOpenRouter,
  billingModeForPlayer,
  registrationMode,
  sessionTtlDays,
} = WorkerRuntimeConfig;

export {
  WorkerRuntimeConfig,
  awsOpenRouterPlayers,
  billingModeForPlayer,
  billingV2TestPlayers,
  getDb,
  globalBillingMode,
  playerUsesAwsOpenRouter,
  registrationMode,
  sessionTtlDays,
};
