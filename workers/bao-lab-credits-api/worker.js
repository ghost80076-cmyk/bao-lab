const MAX_BODY_BYTES = 110_000;
const MAX_PROMPT_BYTES = 96_000;
const MAX_OUTPUT = 8192;
const MAX_MESSAGES = 100;

const LEGACY_CREDIT_TOKEN_UNIT = 100;
const LEGACY_BILLING_MODE = "raw_tokens_v1";
const COST_BILLING_MODE = "cost_usd_v2";
const DEFAULT_PRICING_VERSION = "2026-09-25-v1";
const PASSWORD_ITERATIONS = 100_000;
const DEFAULT_SESSION_TTL_DAYS = 30;
const MIN_AFFORDABLE_OUTPUT_TOKENS = 64;

const enc = new TextEncoder();

const integer = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const safeInt = (n) =>
  integer(n, 0, 1_000_000_000)
    ? n
    : 0;

const safeMoneyInt = (n) =>
  integer(n, 0, 9_000_000_000_000)
    ? n
    : 0;

const json = (
  data,
  status = 200
) =>
  new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store",

        "x-content-type-options":
          "nosniff",
      },
    }
  );

const fail = (
  error,
  status = 400,
  extra = {}
) =>
  json(
    {
      error,
      ...extra,
    },
    status
  );

function bytesToB64Url(
  bytes
) {
  let s = "";

  for (
    const b
    of bytes
  ) {
    s +=
      String.fromCharCode(
        b
      );
  }

  return btoa(s)
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/g,
      ""
    );
}

function b64UrlToBytes(
  value
) {
  const padded =
    value
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      ) +
    "===".slice(
      (value.length + 3) %
        4
    );

  const raw =
    atob(
      padded
    );

  return Uint8Array.from(
    raw,
    (c) =>
      c.charCodeAt(0)
  );
}

function randomBytes(
  size
) {
  return crypto
    .getRandomValues(
      new Uint8Array(
        size
      )
    );
}

function newOpaqueToken(
  prefix,
  size = 32
) {
  return (
    prefix +
    bytesToB64Url(
      randomBytes(
        size
      )
    )
  );
}

function publicPlayerId() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const bytes =
    randomBytes(8);

  let code =
    "";

  for (
    let i = 0;
    i < bytes.length;
    i += 1
  ) {
    code +=
      alphabet[
        bytes[i] %
          alphabet.length
      ];
  }

  return (
    `YR-${code.slice(
      0,
      4
    )}-${code.slice(4)}`
  );
}

function newRecoveryCode() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const bytes =
    randomBytes(20);

  let code =
    "";

  for (
    let i = 0;
    i < bytes.length;
    i += 1
  ) {
    code +=
      alphabet[
        bytes[i] %
          alphabet.length
      ];
  }

  return (
    `YBRC-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}-${code.slice(16, 20)}`
  );
}

function normalizeRecoveryCode(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
}

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

async function sha256Hex(
  value
) {
  const bytes =
    await crypto.subtle.digest(
      "SHA-256",
      enc.encode(
        value
      )
    );

  return [
    ...new Uint8Array(
      bytes
    ),
  ]
    .map(
      (n) =>
        n
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}

async function derivePasswordHash(
  password,
  saltBytes,
  iterations =
    PASSWORD_ITERATIONS
) {
  const key =
    await crypto.subtle.importKey(
      "raw",
      enc.encode(
        password
      ),
      "PBKDF2",
      false,
      [
        "deriveBits",
      ]
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name:
          "PBKDF2",

        hash:
          "SHA-256",

        salt:
          saltBytes,

        iterations,
      },

      key,

      256
    );

  return bytesToB64Url(
    new Uint8Array(
      bits
    )
  );
}

function constantTimeStringEqual(
  a,
  b
) {
  a =
    String(
      a || ""
    );

  b =
    String(
      b || ""
    );

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  let diff =
    0;

  for (
    let i = 0;
    i < a.length;
    i += 1
  ) {
    diff |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return (
    diff === 0
  );
}

async function passwordRecord(
  password
) {
  const salt =
    randomBytes(16);

  const hash =
    await derivePasswordHash(
      password,
      salt,
      PASSWORD_ITERATIONS
    );

  return {
    password_hash:
      hash,

    password_salt:
      bytesToB64Url(
        salt
      ),

    password_iterations:
      PASSWORD_ITERATIONS,
  };
}

async function passwordMatches(
  password,
  account
) {
  try {
    const iterations =
      integer(
        account
          ?.password_iterations,
        50_000,
        1_000_000
      )
        ? account
            .password_iterations
        : PASSWORD_ITERATIONS;

    const salt =
      b64UrlToBytes(
        account
          .password_salt
      );

    const actual =
      await derivePasswordHash(
        password,
        salt,
        iterations
      );

    return constantTimeStringEqual(
      actual,
      account
        .password_hash
    );
  }

  catch {
    return false;
  }
}

function validUsername(
  value
) {
  const username =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(
    username
  )
    ? username
    : null;
}

function validPassword(
  value
) {
  return (
    typeof value ===
      "string" &&
    value.length >=
      10 &&
    value.length <=
      128
  );
}

function validDisplayName(
  value
) {
  const name =
    String(
      value || ""
    ).trim();

  return (
    name.length >= 1 &&
    name.length <= 50
  )
    ? name
    : null;
}

async function readJson(
  request
) {
  if (!request.body) {
    throw new Error(
      "empty_body"
    );
  }

  const reader =
    request.body.getReader();

  const decoder =
    new TextDecoder();

  let size =
    0;

  let text =
    "";

  while (true) {
    const {
      value,
      done,
    } =
      await reader.read();

    if (done) {
      break;
    }

    size +=
      value.byteLength;

    if (
      size >
      MAX_BODY_BYTES
    ) {
      await reader.cancel();

      throw new Error(
        "request_too_large"
      );
    }

    text +=
      decoder.decode(
        value,
        {
          stream:
            true,
        }
      );
  }

  text +=
    decoder.decode();

  try {
    return JSON.parse(
      text
    );
  }

  catch {
    throw new Error(
      "invalid_json"
    );
  }
}

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
    COST_BILLING_MODE
  )
    ? COST_BILLING_MODE
    : LEGACY_BILLING_MODE;
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
      COST_BILLING_MODE
  ) {
    return COST_BILLING_MODE;
  }

  if (
    globalBillingMode(
      env
    ) ===
    COST_BILLING_MODE
  ) {
    return (
      COST_BILLING_MODE
    );
  }

  const test =
    billingV2TestPlayers(
      env
    );

  if (!test.size) {
    return (
      LEGACY_BILLING_MODE
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
    ? COST_BILLING_MODE
    : LEGACY_BILLING_MODE;
}

function registrationMode(
  env
) {
  const mode =
    String(
      env.REGISTRATION_MODE ||
      "closed"
    ).toLowerCase();

  return [
    "closed",
    "invite",
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
      DEFAULT_SESSION_TTL_DAYS
    );

  return integer(
    n,
    1,
    365
  )
    ? n
    : DEFAULT_SESSION_TTL_DAYS;
}

function modelConfigs(
  env
) {
  try {
    const parsed =
      JSON.parse(
        env.MODELS_JSON ||
        "[]"
      );

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];
  }

  catch {
    return [];
  }
}

function modelConfig(
  env,
  provider,
  model
) {
  return (
    modelConfigs(
      env
    ).find(
      (m) =>
        m?.provider ===
          provider &&
        m?.model ===
          model
    ) ||
    null
  );
}

function modelAllowed(
  env,
  provider,
  model
) {
  return Boolean(
    modelConfig(
      env,
      provider,
      model
    )
  );
}

function pricingRate(
  config,
  key
) {
  const value =
    Number(
      config?.[key]
    );

  return (
    Number.isSafeInteger(
      value
    ) &&
    value >= 0
  )
    ? value
    : null;
}

function ceilDivBigInt(
  n,
  d
) {
  return (
    (
      n +
      d -
      1n
    ) /
    d
  );
}

function costBucketsMicrousd(
  buckets
) {
  let numerator =
    0n;

  for (
    const [
      tokens,
      rate,
    ]
    of buckets
  ) {
    if (
      !Number.isSafeInteger(
        tokens
      ) ||
      tokens < 0 ||
      !Number.isSafeInteger(
        rate
      ) ||
      rate < 0
    ) {
      return null;
    }

    numerator +=
      BigInt(
        tokens
      ) *
      BigInt(
        rate
      );
  }

  const value =
    ceilDivBigInt(
      numerator,
      1_000_000n
    );

  if (
    value >
    BigInt(
      Number.MAX_SAFE_INTEGER
    )
  ) {
    return null;
  }

  return Number(
    value
  );
}

function providerCostMicrousd(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const cost =
    Number(
      value
    );

  if (
    !Number.isFinite(
      cost
    ) ||
    cost < 0
  ) {
    return null;
  }

  const microusd =
    Math.round(
      cost *
      1_000_000
    );

  return Number.isSafeInteger(
    microusd
  )
    ? microusd
    : null;
}

function usageForStorage(
  result
) {
  const input =
    safeInt(
      result?.input
    );

  const cached =
    safeInt(
      result?.cached
    );

  const cacheWrite =
    safeInt(
      result
        ?.cacheWrite
    );

  const reasoning =
    safeInt(
      result
        ?.reasoning
    );

  const output =
    safeInt(
      result?.output
    );

  const freshInput =
    safeInt(
      result?.freshInput ??
      Math.max(
        0,
        input -
        cached -
        cacheWrite
      )
    );

  return {
    input,
    freshInput,
    cached,
    cacheWrite,
    reasoning,
    output,

    providerCostMicrousd:
      providerCostMicrousd(
        result
          ?.providerCost
      ),
  };
}

function computedUsageCostMicrousd(
  config,
  stored
) {
  const inputRate =
    pricingRate(
      config,
      "input_microusd_per_million"
    );

  const outputRate =
    pricingRate(
      config,
      "output_microusd_per_million"
    );

  if (
    inputRate === null ||
    outputRate === null
  ) {
    return null;
  }

  const cacheReadRate =
    pricingRate(
      config,
      "cache_read_microusd_per_million"
    ) ??
    inputRate;

  const cacheWriteRate =
    pricingRate(
      config,
      "cache_write_microusd_per_million"
    ) ??
    inputRate;

  return costBucketsMicrousd(
    [
      [
        stored.freshInput,
        inputRate,
      ],

      [
        stored.cached,
        cacheReadRate,
      ],

      [
        stored.cacheWrite,
        cacheWriteRate,
      ],

      [
        stored.output,
        outputRate,
      ],
    ]
  );
}

function actualUsageCostMicrousd(
  config,
  stored
) {
  return (
    stored
      .providerCostMicrousd !==
        null &&
    stored
      .providerCostMicrousd !==
        undefined
  )
    ? stored
        .providerCostMicrousd
    : computedUsageCostMicrousd(
        config,
        stored
      );
}

function estimatedPromptTokens(
  messages
) {
  let ascii =
    0;

  let nonAscii =
    0;

  for (
    const message
    of messages
  ) {    for (
      const ch
      of message.content
    ) {
      if (
        ch.codePointAt(0) <=
        0x7f
      ) {
        ascii += 1;
      }

      else {
        nonAscii += 1;
      }
    }
  }

  const estimate =
    ascii / 4 +
    nonAscii *
      1.15 +
    messages.length *
      10 +
    96;

  return Math.max(
    1,
    Math.ceil(
      estimate *
      1.20
    )
  );
}

function reservePlan(
  config,
  messages,
  requestedMaxOutput,
  walletBalance
) {
  const inputRate =
    pricingRate(
      config,
      "input_microusd_per_million"
    );

  const outputRate =
    pricingRate(
      config,
      "output_microusd_per_million"
    );

  if (
    inputRate === null ||
    outputRate === null
  ) {
    return null;
  }

  const cacheWriteRate =
    pricingRate(
      config,
      "cache_write_microusd_per_million"
    ) ??
    inputRate;

  const reserveInputRate =
    Math.max(
      inputRate,
      cacheWriteRate
    );

  const estimatedInputTokens =
    estimatedPromptTokens(
      messages
    );

  const inputReserveMicrousd =
    costBucketsMicrousd(
      [
        [
          estimatedInputTokens,
          reserveInputRate,
        ],
      ]
    );

  if (
    inputReserveMicrousd ===
    null
  ) {
    return null;
  }

  if (
    walletBalance <
    inputReserveMicrousd
  ) {
    return {
      ok:
        false,

      estimatedInputTokens,

      inputReserveMicrousd,

      affordableOutputTokens:
        0,
    };
  }

  // Zero-output-price models (including fully free OpenRouter models)
  // must not be rejected or divided by zero. They may use the full
  // requested output allowance while reserving only any non-zero
  // input/cache-write cost configured for the model.
  if (
    outputRate === 0
  ) {
    return {
      ok:
        true,

      estimatedInputTokens,

      inputReserveMicrousd,

      outputReserveMicrousd:
        0,

      reserveMicrousd:
        inputReserveMicrousd,

      effectiveMaxOutput:
        requestedMaxOutput,
    };
  }

  const outputBudget =
    walletBalance -
    inputReserveMicrousd;

  const affordableBig =
    (
      BigInt(
        outputBudget
      ) *
      1_000_000n
    ) /
    BigInt(
      outputRate
    );

  const affordableOutputTokens =
    affordableBig >
      BigInt(
        MAX_OUTPUT
      )
      ? MAX_OUTPUT
      : Number(
          affordableBig
        );

  const effectiveMaxOutput =
    Math.min(
      requestedMaxOutput,
      Math.max(
        0,
        affordableOutputTokens
      )
    );

  const minimumNeeded =
    Math.min(
      requestedMaxOutput,
      MIN_AFFORDABLE_OUTPUT_TOKENS
    );

  if (
    effectiveMaxOutput <
    minimumNeeded
  ) {
    return {
      ok:
        false,

      estimatedInputTokens,

      inputReserveMicrousd,

      affordableOutputTokens:
        effectiveMaxOutput,
    };
  }

  const outputReserveMicrousd =
    costBucketsMicrousd(
      [
        [
          effectiveMaxOutput,
          outputRate,
        ],
      ]
    );

  if (
    outputReserveMicrousd ===
    null
  ) {
    return null;
  }

  const reserveMicrousd =
    inputReserveMicrousd +
    outputReserveMicrousd;

  if (
    !Number.isSafeInteger(
      reserveMicrousd
    )
  ) {
    return null;
  }

  return {
    ok:
      true,

    estimatedInputTokens,

    inputReserveMicrousd,

    outputReserveMicrousd,

    reserveMicrousd,

    effectiveMaxOutput,
  };
}

function normalizeMessages(
  messages
) {
  if (
    !Array.isArray(
      messages
    ) ||
    !messages.length ||
    messages.length >
      MAX_MESSAGES
  ) {
    return null;
  }

  if (
    !messages.every(
      (m) =>
        m &&
        [
          "system",
          "user",
          "assistant",
        ].includes(
          m.role
        ) &&
        typeof m.content ===
          "string" &&
        m.content.length >
          0 &&
        m.content.length <=
          80_000
    )
  ) {
    return null;
  }

  if (
    !messages.some(
      (m) =>
        m.role ===
        "user"
    )
  ) {
    return null;
  }

  const simple =
    messages.map(
      ({
        role,
        content,
      }) => ({
        role,
        content,
      })
    );

  const bytes =
    enc.encode(
      JSON.stringify(
        simple
      )
    ).length;

  return (
    bytes <=
    MAX_PROMPT_BYTES
  )
    ? simple
    : null;
}

function validOrigin(
  request,
  env
) {
  const origin =
    request.headers.get(
      "origin"
    );

  if (!origin) {
    return {
      allowed:
        true,

      origin:
        null,
    };
  }

  const allowed =
    String(
      env.ALLOWED_ORIGIN ||
      ""
    )
      .split(",")
      .map(
        (x) =>
          x.trim()
      )
      .filter(Boolean);

  return {
    allowed:
      allowed.includes(
        origin
      ),

    origin,
  };
}

function cors(
  response,
  origin
) {
  if (!origin) {
    return response;
  }

  const headers =
    new Headers(
      response.headers
    );

  headers.set(
    "access-control-allow-origin",
    origin
  );

  headers.set(
    "access-control-allow-methods",
    "GET, POST, OPTIONS"
  );

  headers.set(
    "access-control-allow-headers",
    "authorization, content-type"
  );

  headers.set(
    "access-control-max-age",
    "600"
  );

  headers.set(
    "vary",
    "Origin"
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

async function playerFor(
  request,
  db
) {
  const token =
    tokenFrom(
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

  if (
    registrationMode(
      env
    ) ===
    "invite"
  ) {
    if (
      !env
        .REGISTRATION_INVITE_CODE ||
      String(
        body?.invite_code ||
        ""
      ) !==
      String(
        env
          .REGISTRATION_INVITE_CODE
      )
    ) {
      return fail(
        "invalid_invite_code",
        403
      );
    }
  }

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

  return json(
    {
      created:
        true,

      public_id:
        publicId,

      username,

      display_name:
        displayName,

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

  return json({
    logged_in:
      true,

    public_id:
      account.public_id,

    username:
      account.username,

    display_name:
      account.display_name,

    session_token:
      session.sessionToken,

    session_expires_at:
      session.expiresAt,
  });
}

async function authLogout(
  request,
  db
) {
  const token =
    tokenFrom(
      request
    );

  if (!token) {
    return json({
      logged_out:
        true,
    });
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

  return json({
    logged_out:
      true,
  });
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

  return json({
    recovered:
      true,

    public_id:
      publicId,

    username:
      row.username,

    display_name:
      row.display_name,

    session_token:
      session.sessionToken,

    session_expires_at:
      session.expiresAt,

    recovery_code:
      newRecovery,
  });
}

async function meRoute(
  request,
  env,
  db
) {
  const player =
    await playerFor(
      request,
      db
    );

  if (
    !player ||
    !player.enabled
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const used =
    await db
      .prepare(
        `
        SELECT
          COUNT(*) AS n

        FROM api_usage

        WHERE
          player_id = ?

          AND
          request_kind =
            'chat'

          AND
          status IN (
            'pending',
            'ok',
            'unverified',
            'over_budget'
          )

          AND
          date(created_at) =
            date('now')
        `
      )
      .bind(
        player.id
      )
      .first();

  const walletBalance =
    player
      .wallet_balance_microusd ==
    null
      ? 0
      : safeMoneyInt(
          player
            .wallet_balance_microusd
        );

  return json({
    public_id:
      player.public_id,

    username:
      player.username ||
      null,

    display_name:
      player
        .display_name ||
      null,

    auth_type:
      player.auth_type,

    billing_mode:
      billingModeForPlayer(
        env,
        player
      ),

    legacy_balance_credits:
      player
        .balance_microusd,

    legacy_credit_unit:
      "100_tokens",

    wallet_balance_microusd:
      walletBalance,

    wallet_balance_usd:
      walletBalance /
      1_000_000,

    // Player-facing denomination: 1 USD of internal model-cost balance = 1,000 YoruBay points.
    // Keep the USD fields for backwards compatibility and internal accounting.
    wallet_balance_points:
      walletBalance /
      1_000,

    wallet_currency:
      player
        .wallet_currency ||
      "USD",

    daily_chat_limit:
      null,

    chat_used_today_utc:
      safeInt(
        used?.n
      ),
  });
}

async function walletLedgerRoute(
  request,
  db
) {
  const player =
    await playerFor(
      request,
      db
    );

  if (
    !player ||
    !player.enabled
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const rows =
    await db
      .prepare(
        `
        SELECT
          ledger_id,
          entry_type,
          amount_microusd,
          balance_after_microusd,
          note,
          created_at

        FROM wallet_ledger

        WHERE
          player_id = ?

        ORDER BY
          created_at DESC

        LIMIT 50
        `
      )
      .bind(
        player.id
      )
      .all();

  const legacyTopupNotes =
    new Set([
      "",
      "YoruBay manual wallet top-up",
      "manual wallet top-up",
    ]);

  return json({
    entries:
      rows.results.map(
        (row) => {
          const rawNote =
            String(
              row.note ||
              ""
            ).trim();

          let label =
            row.entry_type ===
              "usage"
              ? "AI 使用"
              : row.entry_type ===
                  "topup"
                ? (
                    legacyTopupNotes
                      .has(rawNote)
                      ? "點數加值"
                      : rawNote
                  )
                : "點數調整";

          label =
            String(
              label ||
              "點數異動"
            ).slice(
              0,
              80
            );

          return {
            id:
              row.ledger_id,

            type:
              row.entry_type,

            label,

            points:
              (
                Number.isSafeInteger(
                  row.amount_microusd
                ) &&
                Math.abs(
                  row.amount_microusd
                ) <=
                  9_000_000_000_000
                  ? row.amount_microusd
                  : 0
              ) /
              1_000,

            balance_after_points:
              row
                .balance_after_microusd ==
              null
                ? null
                : safeMoneyInt(
                    row
                      .balance_after_microusd
                  ) /
                  1_000,

            created_at:
              row.created_at,
          };
        }
      ),
  });
}

async function adminRoute(
  request,
  url,
  env,
  db
) {
  if (
    !env.ADMIN_TOKEN ||
    tokenFrom(
      request
    ) !==
    env.ADMIN_TOKEN
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const path =
    url.pathname;

  if (
    path ===
      "/admin/players" &&
    request.method ===
      "GET"
  ) {
    const rows =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
            p.created_at,

            w.balance_microusd
              AS wallet_balance_microusd,

            w.currency
              AS wallet_currency,

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

          ORDER BY
            p.created_at DESC

          LIMIT 200
          `
        )
        .all();

    return json({
      default_billing_mode:
        globalBillingMode(
          env
        ),

      players:
        rows.results.map(
          (p) => ({
            ...p,

            legacy_balance_credits:
              p.balance_microusd,

            wallet_balance_usd:
              p
                .wallet_balance_microusd ==
              null
                ? null
                : p
                    .wallet_balance_microusd /
                  1_000_000,
          })
        ),
    });
  }

  if (
    path ===
      "/admin/players" &&
    request.method ===
      "POST"
  ) {
    const body =
      await readJson(
        request
      );

    const legacyCredit =
      body
        ?.balance_credits ??
      body
        ?.balance_microusd ??
      0;

    const walletCredit =
      body
        ?.wallet_balance_microusd ??
      0;

    const daily =
      body
        ?.daily_chat_limit ??
      200;

    if (
      !integer(
        legacyCredit,
        0,
        100_000_000
      ) ||
      !integer(
        walletCredit,
        0,
        1_000_000_000_000
      ) ||
      !integer(
        daily,
        1,
        500
      )
    ) {
      return fail(
        "invalid_player_settings"
      );
    }

    const id =
      crypto.randomUUID();

    const token =
      newOpaqueToken(
        "bao_",
        32
      );

    const publicId =
      publicPlayerId();

    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO players (
              id,
              public_id,
              token_hash,
              balance_microusd,
              daily_chat_limit
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            id,
            publicId,
            await sha256Hex(
              token
            ),
            legacyCredit,
            daily
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
              ?,
              'USD',
              ?,
              1
            )
            `
          )
          .bind(
            id,
            walletCredit,
            COST_BILLING_MODE
          ),
      ]
    );

    return json(
      {
        player_id:
          id,

        public_id:
          publicId,

        player_token:
          token,

        legacy_balance_credits:
          legacyCredit,

        wallet_balance_microusd:
          walletCredit,

        wallet_balance_usd:
          walletCredit /
          1_000_000,
      },
      201
    );
  }

  const match =
    path.match(
      /^\/admin\/players\/([0-9a-f-]{36})\/(credit|wallet-credit|disable)$/
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
      "disable"
    ) {
      const result =
        await db
          .prepare(
            `
            UPDATE players

            SET
              enabled = 0

            WHERE
              id = ?
            `
          )
          .bind(
            playerId
          )
          .run();

      await db.batch(
        [
          db
            .prepare(
              `
              UPDATE wallets

              SET
                enabled = 0,
                updated_at =
                  CURRENT_TIMESTAMP

              WHERE
                player_id = ?
              `
            )
            .bind(
              playerId
            ),

          db
            .prepare(
              `
              UPDATE accounts

              SET
                enabled = 0,
                updated_at =
                  CURRENT_TIMESTAMP

              WHERE
                player_id = ?
              `
            )
            .bind(
              playerId
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
              playerId
            ),
        ]
      );

      return result
        .meta
        .changes
        ? json({
            disabled:
              true,
          })
        : fail(
            "player_not_found",
            404
          );
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
        !integer(
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
      !integer(
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
      !integer(
        paymentMinor,
        0,
        1_000_000_000
      ) ||
      !integer(
        processorFeeMinor,
        0,
        1_000_000_000
      ) ||
      !integer(
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
      safeMoneyInt(
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

  if (
    path ===
      "/admin/usage" &&
    request.method ===
      "GET"
  ) {
    const id =
      url.searchParams.get(
        "player_id"
      );

    if (
      !id ||
      !/^[0-9a-f-]{36}$/.test(
        id
      )
    ) {
      return fail(
        "player_id_required"
      );
    }

    const rows =
      await db
        .prepare(
          `
          SELECT
            request_id,
            provider,
            model,
            request_kind,

            input_tokens,
            fresh_input_tokens,
            cached_tokens,
            cache_write_tokens,

            output_tokens,
            reasoning_tokens,

            provider_cost_microusd,
            cost_microusd,
            settled_cost_microusd,

            balance_before_microusd,
            balance_after_microusd,

            billing_mode,
            pricing_version,
            status,
            created_at

          FROM api_usage

          WHERE
            player_id = ?

          ORDER BY
            created_at DESC

          LIMIT 100
          `
        )
        .bind(
          id
        )
        .all();

    return json({
      usage:
        rows.results.map(
          (row) => ({
            ...row,

            provider_cost_usd:
              row
                .provider_cost_microusd ==
              null
                ? null
                : row
                    .provider_cost_microusd /
                  1_000_000,

            actual_cost_usd:
              row.billing_mode ===
                COST_BILLING_MODE &&
              row
                .cost_microusd !=
                null
                ? row
                    .cost_microusd /
                  1_000_000
                : null,

            settled_cost_usd:
              row
                .settled_cost_microusd ==
              null
                ? null
                : row
                    .settled_cost_microusd /
                  1_000_000,

            balance_before_usd:
              row
                .balance_before_microusd ==
              null
                ? null
                : row
                    .balance_before_microusd /
                  1_000_000,

            balance_after_usd:
              row
                .balance_after_microusd ==
              null
                ? null
                : row
                    .balance_after_microusd /
                  1_000_000,

            charged_legacy_credits:
              row.billing_mode ===
                LEGACY_BILLING_MODE
                ? row
                    .cost_microusd
                : null,
          })
        ),
    });
  }

  return fail(
    "not_found",
    404
  );
}

async function geminiErrorHint(
  response
) {
  try {
    const payload =
      await response.json();

    // Gemini errors may arrive either directly from Google or wrapped by the
    // AWS Sydney relay. Build one internal diagnostic string from known wrapper
    // locations. It is used only for classification and is never returned to
    // the player.
    const diagnosticParts =
      [
        payload?.error
          ?.message,
        typeof payload?.error ===
          "string"
          ? payload.error
          : null,
        payload?.message,
        payload?.detail,
        payload?.reason,
        payload?.hint,
        payload?.category,
        payload?.body?.error
          ?.message,
        payload?.body?.message,
        payload?.google?.error
          ?.message,
        payload?.google?.message,
        payload?.upstream?.error
          ?.message,
        payload?.upstream?.message,
        payload?.provider_error
          ?.message,
        payload?.response?.error
          ?.message,
        payload?.data?.error
          ?.message,
        payload?.cause?.message,
      ]
        .filter(
          (value) =>
            typeof value ===
              "string" &&
            value.trim()
        )
        .join(" ");

    let serialized =
      "";

    try {
      serialized =
        JSON.stringify(
          payload
        );
    }

    catch {
      serialized =
        "";
    }

    const message =
      `${diagnosticParts} ${serialized}`
        .toLowerCase()
        .slice(
          0,
          12000
        );

    const knownStatuses =
      new Set(
        [
          "INVALID_ARGUMENT",
          "FAILED_PRECONDITION",
          "PERMISSION_DENIED",
          "UNAUTHENTICATED",
          "RESOURCE_EXHAUSTED",
          "NOT_FOUND",
          "UNAVAILABLE",
        ]
      );

    const statusCandidates =
      [
        payload?.error
          ?.status,
        payload?.status,
        payload?.provider_status,
        payload?.providerStatus,
        payload?.body?.error
          ?.status,
        payload?.google?.error
          ?.status,
        payload?.upstream?.error
          ?.status,
        payload?.response?.error
          ?.status,
        payload?.data?.error
          ?.status,
      ];

    const providerStatus =
      statusCandidates
        .map(
          (value) =>
            String(
              value ||
              ""
            )
              .trim()
              .toUpperCase()
        )
        .find(
          (value) =>
            knownStatuses.has(
              value
            )
        ) ||
      null;

    if (
      /user location is not supported|location is not supported for (the )?api|not available in your (location|region|country)|unsupported (location|region|country)/.test(
        message
      )
    ) {
      return {
        hint:
          "region",

        providerStatus,
      };
    }

    if (
      /billing|billing account|enable billing|paid tier|paid plan|payment|required payment|prepay|prepaid|purchase|credit balance|insufficient provider credit/.test(
        message
      )
    ) {
      return {
        hint:
          "billing",

        providerStatus,
      };
    }

    if (
      /model[_ -]?not[_ -]?allowed|model[^a-z0-9]{0,8}(is )?not allowed|allowlist|whitelist|unsupported model/.test(
        message
      )
    ) {
      return {
        hint:
          "model_not_allowed",

        providerStatus,
      };
    }

    if (
      /thought.?signature|thought_signature/.test(
        message
      )
    ) {
      return {
        hint:
          "thought_signature",

        providerStatus,
      };
    }

    if (
      /max.?output.?tokens|generation.?config|thinking.?budget|thinking.?level/.test(
        message
      )
    ) {
      return {
        hint:
          "generation_config",

        providerStatus,
      };
    }

    if (
      /system.?instruction/.test(
        message
      )
    ) {
      return {
        hint:
          "system_instruction",

        providerStatus,
      };
    }

    if (
      /contents|turns?|parts?|roles?|conversation/.test(
        message
      )
    ) {
      return {
        hint:
          "message_format",

        providerStatus,
      };
    }

    if (
      /context.length|token.limit|too.many.tokens|input.too.long|request.too.large/.test(
        message
      )
    ) {
      return {
        hint:
          "context_limit",

        providerStatus,
      };
    }

    if (
      /(model.{0,80}(not.found|not.supported|not.available|deprecated|does not exist|unknown))|((not.found|not.supported|not.available|deprecated).{0,80}model)/.test(
        message
      ) ||
      providerStatus ===
        "NOT_FOUND"
    ) {
      return {
        hint:
          "model_unavailable",

        providerStatus,
      };
    }

    if (
      /api.?key|api_key|invalid key|key invalid|authentication|unauthenticated/.test(
        message
      ) ||
      providerStatus ===
        "UNAUTHENTICATED"
    ) {
      return {
        hint:
          "api_key",

        providerStatus,
      };
    }

    if (
      /permission denied|permission_denied|forbidden|not authorized|access denied|access not configured/.test(
        message
      ) ||
      providerStatus ===
        "PERMISSION_DENIED"
    ) {
      return {
        hint:
          "permission",

        providerStatus,
      };
    }

    if (
      /quota|resource exhausted|resource_exhausted|rate limit/.test(
        message
      ) ||
      providerStatus ===
        "RESOURCE_EXHAUSTED"
    ) {
      return {
        hint:
          "quota",

        providerStatus,
      };
    }

    if (
      /invalid.argument|invalid.request|bad request/.test(
        message
      ) ||
      providerStatus ===
        "INVALID_ARGUMENT"
    ) {
      return {
        hint:
          "invalid_argument",

        providerStatus,
      };
    }

    if (
      providerStatus ===
        "FAILED_PRECONDITION"
    ) {
      return {
        hint:
          "precondition",

        providerStatus,
      };
    }

    if (
      providerStatus ===
        "UNAVAILABLE"
    ) {
      return {
        hint:
          "unavailable",

        providerStatus,
      };
    }

    return {
      hint:
        "unknown",

      providerStatus,
    };
  }

  catch {
    return {
      hint:
        "invalid_error_payload",

      providerStatus:
        null,
    };
  }
}

function anthropicPayload(
  messages,
  model,
  maxOutput
) {
  const systemParts =
    messages
      .filter(
        (m) =>
          m.role ===
          "system"
      )
      .map(
        (m) => ({
          type:
            "text",

          text:
            m.content,
        })
      );

  const conversation =
    messages
      .filter(
        (m) =>
          m.role !==
          "system"
      )
      .map(
        (m) => ({
          role:
            m.role ===
              "assistant"
              ? "assistant"
              : "user",

          content:
            m.content,
        })
      );

  const payload = {
    model,

    max_tokens:
      maxOutput,

    messages:
      conversation,

    stream:
      false,
  };

  if (
    systemParts.length
  ) {
    payload.system =
      systemParts;
  }

  return payload;
}

async function providerCall(
  env,
  provider,
  model,
  messages,
  maxOutput,
  player = null
) {
  let endpoint;
  let init;
  let usingAwsRelay =
    false;

  if (
    provider ===
    "openrouter"
  ) {
    const useAwsRelay =
      playerUsesAwsOpenRouter(
        env,
        player
      );

    if (
      useAwsRelay
    ) {
      if (
        !env.AWS_RELAY_URL ||
        !env.BAO_INTERNAL_TOKEN
      ) {
        return {
          ok:
            false,

          category:
            "relay_not_configured",
        };
      }

      let relayBase;

      try {
        relayBase =
          new URL(
            env.AWS_RELAY_URL
          );

        if (
          relayBase.protocol !==
            "https:" ||
          relayBase.username ||
          relayBase.password
        ) {
          throw new Error(
            "bad_relay"
          );
        }
      }

      catch {
        return {
          ok:
            false,

          category:
            "relay_not_configured",
        };
      }

      endpoint =
        new URL(
          "/v1/chat",
          relayBase
        ).toString();

      usingAwsRelay =
        true;

      init = {
        method:
          "POST",

        headers: {
          authorization:
            `Bearer ${env.BAO_INTERNAL_TOKEN}`,

          "content-type":
            "application/json",
        },

        body:
          JSON.stringify(
            {
              provider:
                "openrouter",

              model,
              messages,

              max_output_tokens:
                maxOutput,
            }
          ),
      };
    }

    else {
      if (
        !env.OPENROUTER_API_KEY
      ) {
        return {
          ok:
            false,

          category:
            "provider_not_configured",
        };
      }

      endpoint =
        "https://openrouter.ai/api/v1/chat/completions";

      init = {
        method:
          "POST",

        headers: {
          authorization:
            `Bearer ${env.OPENROUTER_API_KEY}`,

          "content-type":
            "application/json",
        },

        body:
          JSON.stringify(
            {
              model,
              messages,

              max_tokens:
                maxOutput,

              stream:
                false,

              usage: {
                include:
                  true,
              },
            }
          ),
      };
    }
  }

  else if (
    provider ===
    "gemini"
  ) {
    if (
      !env.AWS_RELAY_URL ||
      !env.BAO_INTERNAL_TOKEN
    ) {
      return {
        ok:
          false,

        category:
          "provider_not_configured",
      };
    }

    if (
      !/^[a-zA-Z0-9._-]{1,100}$/.test(
        model
      )
    ) {
      return {
        ok:
          false,

        category:
          "invalid_model",
      };
    }

    let relayBase;

    try {
      relayBase =
        new URL(
          env.AWS_RELAY_URL
        );

      if (
        relayBase.protocol !==
          "https:" ||
        relayBase.username ||
        relayBase.password
      ) {
        throw new Error(
          "bad_relay"
        );
      }
    }

    catch {
      return {
        ok:
          false,

        category:
          "relay_not_configured",
      };
    }

    endpoint =
      new URL(
        "/v1/chat",
        relayBase
      ).toString();

    const system =
      messages
        .filter(
          (m) =>
            m.role ===
            "system"
        )
        .map(
          (m) =>
            m.content
        )
        .join(
          "\n\n"
        );

    const contents =
      messages
        .filter(
          (m) =>
            m.role !==
            "system"
        )
        .map(
          (m) => ({
            role:
              m.role ===
                "assistant"
                ? "model"
                : "user",

            parts: [
              {
                text:
                  m.content,
              },
            ],
          })
        );

    const payload = {
      contents,

      generationConfig: {
        maxOutputTokens:
          maxOutput,
      },
    };

    if (system) {
      payload.systemInstruction =
        {
          parts: [
            {
              text:
                system,
            },
          ],
        };
    }

    init = {
      method:
        "POST",

      headers: {
        authorization:
          `Bearer ${env.BAO_INTERNAL_TOKEN}`,

        "content-type":
          "application/json",
      },

      body:
        JSON.stringify(
          {
            model,
            payload,
          }
        ),
    };
  }

  else if (
    provider ===
    "anthropic"
  ) {
    if (
      !env.ANTHROPIC_API_KEY
    ) {
      return {
        ok:
          false,

        category:
          "provider_not_configured",
      };
    }

    if (
      !/^[a-zA-Z0-9._-]{1,120}$/.test(
        model
      )
    ) {
      return {
        ok:
          false,

        category:
          "invalid_model",
      };
    }

    endpoint =
      "https://api.anthropic.com/v1/messages";

    init = {
      method:
        "POST",

      headers: {
        "x-api-key":
          env.ANTHROPIC_API_KEY,

        "anthropic-version":
          "2023-06-01",

        "content-type":
          "application/json",
      },

      body:
        JSON.stringify(
          anthropicPayload(
            messages,
            model,
            maxOutput
          )
        ),
    };
  }

  else {
    return {
      ok:
        false,

      category:
        "invalid_provider",
    };
  }

  let response;

  try {
    response =
      await fetch(
        endpoint,
        {          ...init,

          signal:
            AbortSignal.timeout(
              75_000
            ),
        }
      );
  }

  catch {
    return {
      ok:
        false,

      category:
        (
          provider ===
            "gemini" ||
          usingAwsRelay
        )
          ? "relay_network_error"
          : "provider_network_error",
    };
  }

  if (
    !response.ok
  ) {
    const diagnostic =
      provider ===
        "gemini"
        ? await geminiErrorHint(
            response
          )
        : {
            hint:
              "unknown",

            providerStatus:
              null,
          };

    const category =
      provider ===
        "gemini" &&
      response.status ===
        400
        ? `google_bad_request_${diagnostic.hint}`
        : "provider_http_error";

    return {
      ok:
        false,

      category,

      upstreamStatus:
        response.status,

      providerStatus:
        diagnostic
          .providerStatus,
    };
  }

  let data;

  try {
    data =
      await response.json();
  }

  catch {
    return {
      ok:
        false,

      category:
        "provider_invalid_json",
    };
  }

  if (
    provider ===
    "openrouter"
  ) {
    const text =
      data.choices?.[0]
        ?.message
        ?.content;

    const usage =
      data.usage ||
      {};

    const providerCost =
      Number(
        usage.cost
      );

    return {
      ok:
        typeof text ===
          "string" &&
        !!text.trim(),

      text,

      input:
        safeInt(
          usage.prompt_tokens
        ),

      output:
        safeInt(
          usage
            .completion_tokens
        ),

      cached:
        safeInt(
          usage
            .prompt_tokens_details
            ?.cached_tokens
        ),

      cacheWrite:
        safeInt(
          usage
            .prompt_tokens_details
            ?.cache_write_tokens
        ),

      reasoning:
        safeInt(
          usage
            .completion_tokens_details
            ?.reasoning_tokens
        ),

      providerCost:
        Number.isFinite(
          providerCost
        ) &&
        providerCost >= 0
          ? providerCost
          : null,

      category:
        "provider_empty_text",
    };
  }

  if (
    provider ===
    "anthropic"
  ) {
    const text =
      Array.isArray(
        data.content
      )
        ? data.content
            .filter(
              (b) =>
                b?.type ===
                  "text" &&
                typeof b.text ===
                  "string"
            )
            .map(
              (b) =>
                b.text
            )
            .join("")
        : "";

    const usage =
      data.usage ||
      {};

    const freshInput =
      safeInt(
        usage.input_tokens
      );

    const cacheWrite =
      safeInt(
        usage
          .cache_creation_input_tokens
      );

    const cached =
      safeInt(
        usage
          .cache_read_input_tokens
      );

    const input =
      freshInput +
      cacheWrite +
      cached;

    const output =
      safeInt(
        usage.output_tokens
      );

    const reasoning =
      safeInt(
        usage
          .output_tokens_details
          ?.thinking_tokens
      );

    return {
      ok:
        typeof text ===
          "string" &&
        !!text.trim(),

      text,
      input,
      freshInput,
      output,
      cached,
      cacheWrite,
      reasoning,

      providerCost:
        null,

      category:
        "provider_empty_text",

      finishReason:
        String(
          data.stop_reason ||
          ""
        )
          .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
          )
          .slice(
            0,
            40
          ),
    };
  }

  const text =
    data.candidates?.[0]
      ?.content
      ?.parts
      ?.filter(
        (p) =>
          typeof p.text ===
            "string"
      )
      .map(
        (p) =>
          p.text
      )
      .join("");

  const usage =
    data.usageMetadata ||
    {};

  const input =
    safeInt(
      usage.promptTokenCount
    );

  const cached =
    safeInt(
      usage
        .cachedContentTokenCount
    );

  const reasoning =
    safeInt(
      usage.thoughtsTokenCount
    );

  const output =
    integer(
      usage.totalTokenCount,
      0,
      1e9
    ) &&
    integer(
      input,
      0,
      1e9
    )
      ? Math.max(
          0,
          usage.totalTokenCount -
          input
        )
      : safeInt(
          usage
            .candidatesTokenCount
        ) +
        reasoning;

  return {
    ok:
      typeof text ===
        "string" &&
      !!text.trim(),

    text,

    input,

    freshInput:
      Math.max(
        0,
        input -
        cached
      ),

    output,
    cached,

    cacheWrite:
      0,

    reasoning,

    providerCost:
      null,

    category:
      "provider_empty_text",

    finishReason:
      String(
        data.candidates?.[0]
          ?.finishReason ||
        ""
      )
        .replace(
          /[^A-Z_]/g,
          ""
        )
        .slice(
          0,
          32
        ),
  };
}

function providerFailureResponse(
  result,
  requestId
) {
  const extra = {
    request_id:
      requestId,
  };

  if (
    integer(
      result
        .upstreamStatus,
      400,
      599
    )
  ) {
    extra.upstream_http_status =
      result
        .upstreamStatus;
  }

  if (
    result
      .providerStatus
  ) {
    extra.provider_status =
      result
        .providerStatus;
  }

  if (
    result
      .finishReason
  ) {
    extra.finish_reason =
      result
        .finishReason;
  }

  if (
    result.category ===
      "provider_http_error" &&
    result
      .upstreamStatus ===
      429
  ) {
    return fail(
      "provider_rate_limited",
      502,
      extra
    );
  }

  return fail(
    result.category ||
      "provider_request_failed",
    502,
    extra
  );
}

async function legacyChatRoute(
  request,
  env,
  db,
  player,
  body
) {
  const kind =
    body?.request_kind ||
    "chat";

  const provider =
    body?.provider;

  const model =
    body?.model;

  const messages =
    normalizeMessages(
      body?.messages
    );

  if (
    ![
      "chat",
      "status",
      "summary",
    ].includes(
      kind
    ) ||
    !messages ||
    !modelAllowed(
      env,
      provider,
      model
    )
  ) {
    return fail(
      "invalid_request_or_model_not_allowed"
    );
  }

  const maxOutput =
    body
      ?.max_output_tokens ??
    2048;

  if (
    !integer(
      maxOutput,
      1,
      MAX_OUTPUT
    )
  ) {
    return fail(
      "invalid_max_output_tokens"
    );
  }

  // Legacy 模式也不再直接拿 UTF-8 bytes 當 token。
  const reserve =
    Math.max(
      1,

      Math.ceil(
        (
          estimatedPromptTokens(
            messages
          ) +
          maxOutput +
          256
        ) /
        LEGACY_CREDIT_TOKEN_UNIT
      )
    );

  if (
    !integer(
      reserve,
      1,
      100_000_000
    )
  ) {
    return fail(
      "request_budget_too_large"
    );
  }

  const requestId =
    crypto.randomUUID();

  const [
    insertResult,
    debitResult,
  ] =
    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO api_usage (
              request_id,
              player_id,
              provider,
              model,
              request_kind,
              status,
              billing_mode
            )

            SELECT
              ?,
              id,
              ?,
              ?,
              ?,
              'pending',
              ?

            FROM players

            WHERE
              id = ?

              AND
              enabled = 1

              AND
              balance_microusd >= ?
            `
          )
          .bind(
            requestId,
            provider,
            model,
            kind,
            LEGACY_BILLING_MODE,
            player.id,
            reserve
          ),

        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd -
                ?

            WHERE
              id = ?

              AND
              balance_microusd >= ?

              AND EXISTS (
                SELECT 1

                FROM api_usage

                WHERE
                  request_id = ?

                  AND
                  status =
                    'pending'
              )
            `
          )
          .bind(
            reserve,
            player.id,
            reserve,
            requestId
          ),
      ]
    );

  if (
    !insertResult
      .meta
      .changes
  ) {
    return fail(
      "insufficient_credits",
      402
    );
  }

  if (
    !debitResult
      .meta
      .changes
  ) {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          status =
            'denied'

        WHERE
          request_id = ?
        `
      )
      .bind(
        requestId
      )
      .run();

    return fail(
      "insufficient_credits",
      402
    );
  }

  const result =
    await providerCall(
      env,
      provider,
      model,
      messages,
      maxOutput,
      player
    );

  if (
    !result.ok
  ) {
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?
            `
          )
          .bind(
            reserve,
            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              status =
                'failed'

            WHERE
              request_id = ?
            `
          )
          .bind(
            requestId
          ),
      ]
    );

    return providerFailureResponse(
      result,
      requestId
    );
  }

  const verified =
    integer(
      result.input,
      0,
      1e9
    ) &&
    integer(
      result.output,
      0,
      1e9
    );

  const stored =
    usageForStorage(
      result
    );

  const actual =
    verified
      ? Math.max(
          1,

          Math.ceil(
            (
              result.input +
              result.output
            ) /
            LEGACY_CREDIT_TOKEN_UNIT
          )
        )
      : reserve;

  let charged =
    reserve;

  let status =
    verified
      ? "ok"
      : "unverified";

  if (
    verified &&
    actual <=
      reserve
  ) {
    charged =
      actual;

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?
            `
          )
          .bind(
            reserve -
            charged,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              input_tokens = ?,
              fresh_input_tokens = ?,
              cached_tokens = ?,
              cache_write_tokens = ?,
              output_tokens = ?,
              reasoning_tokens = ?,

              provider_cost_microusd = ?,

              cost_microusd = ?,
              billing_mode = ?,

              status =
                'ok'

            WHERE
              request_id = ?
            `
          )
          .bind(
            stored.input,
            stored.freshInput,
            stored.cached,
            stored.cacheWrite,
            stored.output,
            stored.reasoning,

            stored
              .providerCostMicrousd,

            charged,
            LEGACY_BILLING_MODE,
            requestId
          ),
      ]
    );
  }

  else if (
    verified
  ) {
    const extra =
      actual -
      reserve;

    const extraDebit =
      await db
        .prepare(
          `
          UPDATE players

          SET
            balance_microusd =
              balance_microusd -
              ?

          WHERE
            id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          extra,
          player.id,
          extra
        )
        .run();

    if (
      extraDebit
        .meta
        .changes
    ) {
      charged =
        actual;

      await db
        .prepare(
          `
          UPDATE api_usage

          SET
            input_tokens = ?,
            fresh_input_tokens = ?,
            cached_tokens = ?,
            cache_write_tokens = ?,
            output_tokens = ?,
            reasoning_tokens = ?,

            provider_cost_microusd = ?,

            cost_microusd = ?,
            billing_mode = ?,

            status =
              'ok'

          WHERE
            request_id = ?
          `
        )
        .bind(
          stored.input,
          stored.freshInput,
          stored.cached,
          stored.cacheWrite,
          stored.output,
          stored.reasoning,

          stored
            .providerCostMicrousd,

          charged,
          LEGACY_BILLING_MODE,
          requestId
        )
        .run();
    }

    else {
      status =
        "over_budget";

      await db.batch(
        [
          db
            .prepare(
              `
              UPDATE players

              SET
                balance_microusd =
                  0

              WHERE
                id = ?
              `
            )
            .bind(
              player.id
            ),

          db
            .prepare(
              `
              UPDATE api_usage

              SET
                input_tokens = ?,
                fresh_input_tokens = ?,
                cached_tokens = ?,
                cache_write_tokens = ?,
                output_tokens = ?,
                reasoning_tokens = ?,

                provider_cost_microusd = ?,

                cost_microusd = ?,
                billing_mode = ?,

                status =
                  'over_budget'

              WHERE
                request_id = ?
              `
            )
            .bind(
              stored.input,
              stored.freshInput,
              stored.cached,
              stored.cacheWrite,
              stored.output,
              stored.reasoning,

              stored
                .providerCostMicrousd,

              reserve,
              LEGACY_BILLING_MODE,
              requestId
            ),
        ]
      );

      return fail(
        "settlement_balance_exhausted",
        402,
        {
          request_id:
            requestId,
        }
      );
    }
  }

  else {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          input_tokens = ?,
          fresh_input_tokens = ?,
          cached_tokens = ?,
          cache_write_tokens = ?,
          output_tokens = ?,
          reasoning_tokens = ?,

          provider_cost_microusd = ?,

          cost_microusd = ?,
          billing_mode = ?,

          status =
            'unverified'

        WHERE
          request_id = ?
        `
      )
      .bind(
        stored.input,
        stored.freshInput,        stored.cached,
        stored.cacheWrite,
        stored.output,
        stored.reasoning,

        stored
          .providerCostMicrousd,

        reserve,
        LEGACY_BILLING_MODE,
        requestId
      )
      .run();
  }

  return json({
    request_id:
      requestId,

    provider,
    model,

    content:
      result.text,

    usage: {
      input_tokens:
        verified
          ? stored.input
          : null,

      fresh_input_tokens:
        verified
          ? stored.freshInput
          : null,

      cached_tokens:
        verified
          ? stored.cached
          : null,

      cache_write_tokens:
        verified
          ? stored.cacheWrite
          : null,

      output_tokens:
        verified
          ? stored.output
          : null,

      reasoning_tokens:
        verified
          ? stored.reasoning
          : null,

      provider_cost_usd:
        stored
          .providerCostMicrousd ==
        null
          ? null
          : stored
              .providerCostMicrousd /
            1_000_000,

      charged_credits:
        charged,

      credit_unit:
        "100_tokens",

      estimated_or_unverified:
        status !==
        "ok",

      billing_mode:
        LEGACY_BILLING_MODE,
    },
  });
}

async function costUsdChatRoute(
  request,
  env,
  db,
  player,
  body
) {
  if (
    !player
      .wallet_enabled
  ) {
    return fail(
      "wallet_disabled",
      403
    );
  }

  const kind =
    body
      ?.request_kind ||
    "chat";

  const provider =
    body?.provider;

  const model =
    body?.model;

  const messages =
    normalizeMessages(
      body?.messages
    );

  const config =
    modelConfig(
      env,
      provider,
      model
    );

  if (
    ![
      "chat",
      "status",
      "summary",
    ].includes(
      kind
    ) ||
    !messages ||
    !config
  ) {
    return fail(
      "invalid_request_or_model_not_allowed"
    );
  }

  const requestedMaxOutput =
    body
      ?.max_output_tokens ??
    2048;

  if (
    !integer(
      requestedMaxOutput,
      1,
      MAX_OUTPUT
    )
  ) {
    return fail(
      "invalid_max_output_tokens"
    );
  }

  const walletBalance =
    safeMoneyInt(
      player
        .wallet_balance_microusd
    );

  const plan =
    reservePlan(
      config,
      messages,
      requestedMaxOutput,
      walletBalance
    );

  if (!plan) {
    return fail(
      "pricing_not_configured",
      503
    );
  }

  if (!plan.ok) {
    return fail(
      "insufficient_wallet_balance",
      402,
      {
        wallet_balance_microusd:
          walletBalance,

        wallet_balance_usd:
          walletBalance /
          1_000_000,

        estimated_input_tokens:
          plan
            .estimatedInputTokens,

        affordable_output_tokens:
          plan
            .affordableOutputTokens ??
          0,
      }
    );
  }

  const requestId =
    crypto.randomUUID();

  const pricingVersion =
    String(
      env.PRICING_VERSION ||
      DEFAULT_PRICING_VERSION
    ).slice(
      0,
      80
    );

  const inserted =
    await db
      .prepare(
        `
        INSERT INTO api_usage (
          request_id,
          player_id,
          provider,
          model,
          request_kind,
          status,
          billing_mode,
          pricing_version
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          'pending',
          ?,
          ?
        )
        `
      )
      .bind(
        requestId,
        player.id,
        provider,
        model,
        kind,
        COST_BILLING_MODE,
        pricingVersion
      )
      .run();

  if (
    !inserted
      .meta
      .changes
  ) {
    return fail(
      "usage_reservation_failed",
      500
    );
  }

  let reserveDebit = {
    meta: {
      changes:
        1,
    },
  };

  // A fully free model has nothing to reserve. Avoid relying on a
  // database no-op UPDATE being reported as a changed row.
  if (
    plan
      .reserveMicrousd >
    0
  ) {
    reserveDebit =
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd -
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          plan
            .reserveMicrousd,

          player.id,

          plan
            .reserveMicrousd
        )
        .run();
  }

  if (
    !reserveDebit
      .meta
      .changes
  ) {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          status =
            'denied'

        WHERE
          request_id = ?
        `
      )
      .bind(
        requestId
      )
      .run();

    return fail(
      "insufficient_wallet_balance",
      402
    );
  }

  const result =
    await providerCall(
      env,
      provider,
      model,
      messages,
      plan
        .effectiveMaxOutput,
      player
    );

  if (
    !result.ok
  ) {
    const ambiguousTransportFailure =
      result.category ===
        "relay_network_error" ||
      result.category ===
        "provider_network_error";

    if (
      ambiguousTransportFailure
    ) {
      const heldBalance =
        Math.max(
          0,
          walletBalance -
            plan.reserveMicrousd
        );

      await db
        .prepare(
          `
          UPDATE api_usage

          SET
            cost_microusd = 0,
            settled_cost_microusd = 0,

            balance_before_microusd = ?,
            balance_after_microusd = ?,

            billing_mode = ?,
            pricing_version = ?,

            status = 'unverified'

          WHERE
            request_id = ?
          `
        )
        .bind(
          walletBalance,
          heldBalance,

          COST_BILLING_MODE,
          pricingVersion,

          requestId
        )
        .run();

      return fail(
        "provider_usage_unverified",
        502,
        {
          request_id:
            requestId,
        }
      );
    }

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                balance_microusd +
                ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            plan
              .reserveMicrousd,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              cost_microusd =
                0,

              settled_cost_microusd =
                0,

              balance_before_microusd =
                ?,

              balance_after_microusd =
                ?,

              status =
                'failed'

            WHERE
              request_id = ?
            `
          )
          .bind(
            walletBalance,
            walletBalance,
            requestId
          ),
      ]
    );

    return providerFailureResponse(
      result,
      requestId
    );
  }

  const verified =
    integer(
      result.input,
      0,
      1e9
    ) &&
    integer(
      result.output,
      0,
      1e9
    );

  const stored =
    usageForStorage(
      result
    );

  if (!verified) {
    const heldBalance =
      Math.max(
        0,
        walletBalance -
          plan.reserveMicrousd
      );

    await db
      .prepare(
        `
        UPDATE api_usage

            SET
              input_tokens = ?,
              fresh_input_tokens = ?,
              cached_tokens = ?,
              cache_write_tokens = ?,
              output_tokens = ?,
              reasoning_tokens = ?,

              provider_cost_microusd = ?,

              cost_microusd =
                0,

              settled_cost_microusd =
                0,

              balance_before_microusd =
                ?,

              balance_after_microusd =
                ?,

              billing_mode = ?,
              pricing_version = ?,

              status =
                'unverified'

            WHERE
              request_id = ?
            `
          )
          .bind(
            stored.input,
            stored.freshInput,
            stored.cached,
            stored.cacheWrite,
            stored.output,
            stored.reasoning,

            stored
              .providerCostMicrousd,

            walletBalance,
            heldBalance,

            COST_BILLING_MODE,
            pricingVersion,

            requestId
        )
        .run();

    return fail(
      "provider_usage_unverified",
      502,
      {
        request_id:
          requestId,
      }
    );
  }

  const actualCost =
    actualUsageCostMicrousd(
      config,
      stored
    );

  if (
    actualCost === null ||
    !integer(
      actualCost,
      0,
      1_000_000_000_000
    )
  ) {
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                balance_microusd +
                ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            plan
              .reserveMicrousd,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              status =
                'pricing_error'

            WHERE
              request_id = ?
            `
          )
          .bind(
            requestId
          ),
      ]
    );

    return fail(
      "pricing_calculation_failed",
      503,
      {
        request_id:
          requestId,
      }
    );
  }

  let charged =
    actualCost;

  let settlementStatus =
    "ok";

  if (
    actualCost <=
    plan
      .reserveMicrousd
  ) {
    const refund =
      plan
        .reserveMicrousd -
      actualCost;

    if (
      refund > 0
    ) {
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd +
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?
          `
        )
        .bind(
          refund,
          player.id
        )
        .run();
    }
  }

  else {
    const extra =
      actualCost -
      plan
        .reserveMicrousd;

    const extraDebit =
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd -
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          extra,
          player.id,
          extra
        )
        .run();

    if (
      !extraDebit
        .meta
        .changes
    ) {
      const remaining =
        await db
          .prepare(
            `
            SELECT
              balance_microusd

            FROM wallets

            WHERE
              player_id = ?
            `
          )
          .bind(
            player.id
          )
          .first();

      const collectable =
        safeMoneyInt(
          remaining
            ?.balance_microusd
        );

      if (
        collectable > 0
      ) {
        await db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                0,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            player.id
          )
          .run();
      }

      charged =
        plan
          .reserveMicrousd +
        collectable;

      settlementStatus =
        "over_budget";
    }
  }

  const finalWallet =
    await db
      .prepare(
        `
        SELECT
          balance_microusd

        FROM wallets

        WHERE
          player_id = ?
        `
      )
      .bind(
        player.id
      )
      .first();

  const balanceAfter =
    safeMoneyInt(
      finalWallet
        ?.balance_microusd
    );

  const balanceBefore =
    balanceAfter +
    charged;

  const ledgerId =
    crypto.randomUUID();

  await db.batch(
    [
      db
        .prepare(
          `
          UPDATE api_usage

          SET
            input_tokens = ?,
            fresh_input_tokens = ?,
            cached_tokens = ?,
            cache_write_tokens = ?,
            output_tokens = ?,
            reasoning_tokens = ?,

            provider_cost_microusd = ?,

            cost_microusd = ?,
            settled_cost_microusd = ?,

            balance_before_microusd = ?,
            balance_after_microusd = ?,

            billing_mode = ?,
            pricing_version = ?,
            status = ?

          WHERE
            request_id = ?
          `
        )
        .bind(
          stored.input,
          stored.freshInput,
          stored.cached,
          stored.cacheWrite,
          stored.output,
          stored.reasoning,

          stored
            .providerCostMicrousd,

          actualCost,
          charged,

          balanceBefore,
          balanceAfter,

          COST_BILLING_MODE,
          pricingVersion,
          settlementStatus,

          requestId
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

            request_id,
            reference_id,
            note
          )

          VALUES (
            ?,
            ?,
            'usage',
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
          ledgerId,
          player.id,

          -charged,

          balanceBefore,
          balanceAfter,

          requestId,

          `${provider}:${model}`,

          settlementStatus
        ),
    ]
  );

  return json({
    request_id:
      requestId,

    provider,
    model,

    content:
      result.text,

    usage: {
      input_tokens:
        stored.input,

      fresh_input_tokens:
        stored.freshInput,

      cached_tokens:
        stored.cached,

      cache_write_tokens:
        stored.cacheWrite,

      output_tokens:
        stored.output,

      reasoning_tokens:
        stored.reasoning,

      provider_cost_microusd:
        stored
          .providerCostMicrousd,

      provider_cost_usd:
        stored
          .providerCostMicrousd ==
        null
          ? null
          : stored
              .providerCostMicrousd /
            1_000_000,

      actual_cost_microusd:
        actualCost,

      actual_cost_usd:
        actualCost /
        1_000_000,

      charged_microusd:
        charged,

      charged_usd:
        charged /
        1_000_000,

      wallet_balance_microusd:
        balanceAfter,

      wallet_balance_usd:
        balanceAfter /
        1_000_000,

      requested_max_output_tokens:
        requestedMaxOutput,

      effective_max_output_tokens:
        plan
          .effectiveMaxOutput,

      estimated_input_tokens_for_reserve:
        plan
          .estimatedInputTokens,

      reserve_microusd:
        plan
          .reserveMicrousd,

      billing_mode:
        COST_BILLING_MODE,

      pricing_version:
        pricingVersion,

      settlement_status:
        settlementStatus,

      estimated_or_unverified:
        settlementStatus !==
        "ok",
    },
  });
}

async function chatRoute(
  request,
  env,
  db
) {
  const player =
    await playerFor(
      request,
      db
    );

  if (
    !player ||
    !player.enabled
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const body =
    await readJson(
      request
    );

  return (
    billingModeForPlayer(
      env,
      player
    ) ===
    COST_BILLING_MODE
  )
    ? costUsdChatRoute(
        request,
        env,
        db,
        player,
        body
      )
    : legacyChatRoute(
        request,
        env,        db,
        player,
        body
      );
}

export default {
  async fetch(
    request,
    env
  ) {
    const origin =
      validOrigin(
        request,
        env
      );

    if (
      !origin.allowed
    ) {
      return fail(
        "origin_not_allowed",
        403
      );
    }

    if (
      request.method ===
      "OPTIONS"
    ) {
      return cors(
        new Response(
          null,
          {
            status:
              204,
          }
        ),
        origin.origin
      );
    }

    const db =
      getDb(
        env
      );

    if (!db) {
      return cors(
        fail(
          "database_binding_missing",
          503
        ),
        origin.origin
      );
    }

    const url =
      new URL(
        request.url
      );

    try {
      let response;

      if (
        url.pathname ===
          "/health" &&
        request.method ===
          "GET"
      ) {
        await db
          .prepare(
            `
            SELECT
              id

            FROM players

            LIMIT 1
            `
          )
          .first();

        response =
          json({
            ok:
              true,

            service:
              "yorubay-credits-pilot",

            providers: [
              "gemini",
              "openrouter",
              "anthropic",
            ],

            gemini_route:
              "aws_sydney_relay",

            aws_relay_configured:
              Boolean(
                env.AWS_RELAY_URL &&
                env.BAO_INTERNAL_TOKEN
              ),

            aws_openrouter_players_configured:
              awsOpenRouterPlayers(
                env
              ).size,

            anthropic_configured:
              Boolean(
                env.ANTHROPIC_API_KEY
              ),

            default_billing_mode:
              globalBillingMode(
                env
              ),

            billing_v2_test_players_configured:
              billingV2TestPlayers(
                env
              ).size >
              0,

            billing_modes_available: [
              LEGACY_BILLING_MODE,
              COST_BILLING_MODE,
            ],

            pricing_version:
              String(
                env.PRICING_VERSION ||
                DEFAULT_PRICING_VERSION
              ),

            registration_mode:
              registrationMode(
                env
              ),

            session_ttl_days:
              sessionTtlDays(
                env
              ),

            usage_storage:
              "cache_usage_v2",

            daily_chat_limit_enabled:
              false,

            diagnostic_version:
              "2026-09-25-6.2",
          });
      }

      else if (
        url.pathname ===
          "/auth/register" &&
        request.method ===
          "POST"
      ) {
        response =
          await authRegister(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/login" &&
        request.method ===
          "POST"
      ) {
        response =
          await authLogin(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/logout" &&
        request.method ===
          "POST"
      ) {
        response =
          await authLogout(
            request,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/recover" &&
        request.method ===
          "POST"
      ) {
        response =
          await authRecover(
            request,
            env,
            db
          );
      }

      else if (
        (
          url.pathname ===
            "/me" ||
          url.pathname ===
            "/auth/me"
        ) &&
        request.method ===
          "GET"
      ) {
        response =
          await meRoute(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/me/wallet-ledger" &&
        request.method ===
          "GET"
      ) {
        response =
          await walletLedgerRoute(
            request,
            db
          );
      }

      else if (
        url.pathname.startsWith(
          "/admin/"
        )
      ) {
        response =
          await adminRoute(
            request,
            url,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/chat" &&
        request.method ===
          "POST"
      ) {
        response =
          await chatRoute(
            request,
            env,
            db
          );
      }

      else {
        response =
          fail(
            "not_found",
            404
          );
      }

      return cors(
        response,
        origin.origin
      );
    }

    catch (error) {
      if (
        [
          "empty_body",
          "invalid_json",
          "request_too_large",
        ].includes(
          error?.message
        )
      ) {
        return cors(
          fail(
            error.message,

            error.message ===
              "request_too_large"
              ? 413
              : 400
          ),
          origin.origin
        );
      }

      console.error(
        "yorubay_worker_internal_error",

        String(
          error?.stack ||
          error?.message ||
          error
        ).slice(
          0,
          4000
        )
      );

      return cors(
        fail(
          "internal_error",
          500
        ),
        origin.origin
      );
    }
  },
};