const DIAGNOSTIC_ROUTES = new Set([
  "aws_relay",
  "direct_openrouter",
  "direct_anthropic",
  "provider_direct",
]);

const TRANSPORT_FAILURES = new Set([
  "timeout",
  "network",
]);

const RESPONSE_SHAPES = new Set([
  "no_candidates", "no_parts", "empty_parts",
  "thought_only", "no_text_parts", "blank_text",
]);
const REQUEST_TASKS = new Set([
  "story", "regenerate", "rewrite", "auto-summary", "memory-repair", "notes",
  "canon-extract", "canon-merge", "canon-final", "context-pack", "full-memory-rebuild",
  "setting-split", "state", "state-rebuild", "state-evidence-scan", "inspiration",
  "discussion", "advisor", "observer", "commentary", "connection", "auxiliary",
  "visual-prompt", "world-draft",
]);
const POLICY_REASONS = /^(?:SAFETY|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY|CONTENT_FILTER|RECITATION|IMAGE_PROHIBITED_CONTENT|IMAGE_RECITATION|MODEL_ARMOR|JAILBREAK)$/;
const CUTOFF_REASONS = /^(?:LENGTH|MAX_TOKENS|MAX_OUTPUT_TOKENS|MAX_COMPLETION_TOKENS)$/;
function usageFailureType(code, result) {
  const finish = String(result.finishReason || "").toUpperCase();
  if (result.promptBlockReason || POLICY_REASONS.test(finish) ||
      result.providerErrorType === "content_policy_violation") return "policy_block";
  if (result.providerErrorType === "refusal") return "provider_refusal";
  if (CUTOFF_REASONS.test(finish)) return "output_truncated";
  if (code === "provider_empty_text" && finish !== "ERROR") return "empty_response";
  return code === "usage_metadata_unverified" ? "usage_unverified" : "api_error";
}

function safeSafetyRatings(ratings) {
  if (!Array.isArray(ratings)) return [];
  return ratings.slice(0, 12).filter(item =>
    typeof item?.category === "string" && /^HARM_CATEGORY_(?:HARASSMENT|HATE_SPEECH|SEXUALLY_EXPLICIT|DANGEROUS_CONTENT|CIVIC_INTEGRITY|UNSPECIFIED|DEROGATORY|TOXICITY|VIOLENCE|SEXUAL|MEDICAL|DANGEROUS)$/.test(item?.category)
  ).map(item => ({
    category: item.category,
    ...(typeof item.probability === "string" && /^(?:NEGLIGIBLE|LOW|MEDIUM|HIGH|HARM_PROBABILITY_UNSPECIFIED)$/.test(item.probability) ? { probability: item.probability } : {}),
    ...(typeof item.blocked === "boolean" ? { blocked: item.blocked } : {}),
  }));
}
function diagnosticSafetyRatings(promptRatings, candidateRatings) {
  const prompt = safeSafetyRatings(promptRatings);
  const candidate = safeSafetyRatings(candidateRatings);
  return prompt.length || candidate.length ? { prompt, candidate } : null;
}

const EXTRA_COLUMNS = Object.freeze({
  request_task: "TEXT",
  failure_type: "TEXT",
  safety_ratings: "TEXT",
  finish_reason: "TEXT",
  prompt_block_reason: "TEXT",
  response_shape: "TEXT",
  candidate_count: "INTEGER",
  estimated_input_tokens: "INTEGER",
  observed_input_tokens: "INTEGER",
  observed_output_tokens: "INTEGER",
});
const ensuredDatabases = new WeakSet();

function boundedInteger(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) &&
    number >= minimum &&
    number <= maximum
    ? number
    : null;
}

function safeCode(value, pattern, maximumLength) {
  const normalized = String(value || "").trim();
  return normalized &&
    normalized.length <= maximumLength &&
    pattern.test(normalized)
    ? normalized
    : null;
}

function normalizeUsageDiagnostic(
  failureCode,
  result = {}
) {
  const normalizedFailureCode =
    safeCode(
      failureCode,
      /^[a-z0-9][a-z0-9_-]*$/,
      96
    ) ||
    "provider_request_failed";

  const providerStatus =
    safeCode(
      result.providerStatus,
      /^[A-Z][A-Z0-9_]*$/,
      64
    );

  const route =
    DIAGNOSTIC_ROUTES.has(
      result.route
    )
      ? result.route
      : null;

  const transportFailure =
    TRANSPORT_FAILURES.has(
      result.transportFailure
    )
      ? result.transportFailure
      : null;

  const rateLimitScope =
    [
      "rate",
      "quota",
      "provider",
      "unknown",
    ].includes(
      result.rateLimitScope
    )
      ? result.rateLimitScope
      : null;

  const safetyRatings = diagnosticSafetyRatings(result.safetyRatings?.prompt, result.safetyRatings?.candidate);
  return {
    request_task: REQUEST_TASKS.has(result.requestTask) ? result.requestTask : null,
    failure_type: usageFailureType(normalizedFailureCode, result),
    safety_ratings: safetyRatings ? JSON.stringify(safetyRatings) : null,
    failure_code:
      normalizedFailureCode,

    upstream_http_status:
      boundedInteger(
        result.upstreamStatus,
        400,
        599
      ),

    provider_status:
      providerStatus,

    route,

    transport_failure:
      transportFailure,

    rate_limit_scope:
      rateLimitScope,

    retry_after_seconds:
      boundedInteger(
        result.retryAfterSeconds,
        1,
        3600
      ),

    request_bytes:
      boundedInteger(
        result.requestBytes,
        1,
        10_000_000
      ),

    elapsed_ms:
      boundedInteger(
        result.elapsedMs,
        0,
        600_000
      ),

    timeout_ms:
      boundedInteger(
        result.transportTimeoutMs,
        1,
        600_000
      ),

    finish_reason: safeCode(String(result.candidateFinishReason ?? (result.promptBlockReason ? "" : result.finishReason || "")).toUpperCase(), /^[A-Z][A-Z0-9_]*$/, 32),
    prompt_block_reason: safeCode(result.promptBlockReason, /^[A-Z][A-Z0-9_]*$/, 32),
    response_shape: RESPONSE_SHAPES.has(result.responseShape) ? result.responseShape : null,
    candidate_count: boundedInteger(result.candidateCount, 0, 100),
    estimated_input_tokens: boundedInteger(result.estimatedInputTokens, 0, 1_000_000_000),
    observed_input_tokens: boundedInteger(result.input, 0, 1_000_000_000),
    observed_output_tokens: boundedInteger(result.output, 0, 1_000_000_000),
  };
}

async function ensureUsageDiagnostics(
  db
) {
  if (ensuredDatabases.has(db)) return;
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS api_usage_diagnostics (
        request_id TEXT PRIMARY KEY,
        failure_code TEXT NOT NULL,
        upstream_http_status INTEGER,
        provider_status TEXT,
        route TEXT,
        transport_failure TEXT,
        rate_limit_scope TEXT,
        retry_after_seconds INTEGER,
        request_bytes INTEGER,
        elapsed_ms INTEGER,
        timeout_ms INTEGER,
        request_task TEXT,
        failure_type TEXT,
        safety_ratings TEXT,
        finish_reason TEXT,
        prompt_block_reason TEXT,
        response_shape TEXT,
        candidate_count INTEGER,
        estimated_input_tokens INTEGER,
        observed_input_tokens INTEGER,
        observed_output_tokens INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `
    )
    .run();

  // Existing D1 databases predate these columns. Add them in place without
  // overwriting prior request logs; this runs once per binding instance.
  const existing = await db.prepare("PRAGMA table_info(api_usage_diagnostics)").all();
  if (!Array.isArray(existing?.results)) throw new Error("usage diagnostics schema cannot be inspected");
  const known = new Set(existing.results.map((column) => column.name));
  for (const [name, type] of Object.entries(EXTRA_COLUMNS)) {
    if (known.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE api_usage_diagnostics ADD COLUMN ${name} ${type}`).run();
    } catch (error) {
      // A concurrent request may have migrated the column after our PRAGMA.
      if (!/duplicate column name/i.test(String(error?.message || error))) throw error;
    }
  }
  ensuredDatabases.add(db);
}

async function recordUsageFailure(
  db,
  requestId,
  failureCode,
  result = {}
) {
  try {
    await ensureUsageDiagnostics(
      db
    );

    const diagnostic =
      normalizeUsageDiagnostic(
        failureCode,
        result
      );

    await db
      .prepare(
        `
        INSERT INTO api_usage_diagnostics (
          request_id,
          failure_code,
          upstream_http_status,
          provider_status,
          route,
          transport_failure,
          rate_limit_scope,
          retry_after_seconds,
          request_bytes,
          elapsed_ms,
          timeout_ms,
          request_task,
          failure_type,
          safety_ratings,
          finish_reason,
          prompt_block_reason,
          response_shape,
          candidate_count,
          estimated_input_tokens,
          observed_input_tokens,
          observed_output_tokens
        )

        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )

        ON CONFLICT(request_id) DO UPDATE SET
          failure_code = excluded.failure_code,
          upstream_http_status = excluded.upstream_http_status,
          provider_status = excluded.provider_status,
          route = excluded.route,
          transport_failure = excluded.transport_failure,
          rate_limit_scope = excluded.rate_limit_scope,
          retry_after_seconds = excluded.retry_after_seconds,
          request_bytes = excluded.request_bytes,
          elapsed_ms = excluded.elapsed_ms,
          timeout_ms = excluded.timeout_ms,
          request_task = excluded.request_task,
          failure_type = excluded.failure_type,
          safety_ratings = excluded.safety_ratings,
          finish_reason = excluded.finish_reason,
          prompt_block_reason = excluded.prompt_block_reason,
          response_shape = excluded.response_shape,
          candidate_count = excluded.candidate_count,
          estimated_input_tokens = excluded.estimated_input_tokens,
          observed_input_tokens = excluded.observed_input_tokens,
          observed_output_tokens = excluded.observed_output_tokens,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .bind(
        requestId,
        diagnostic.failure_code,
        diagnostic.upstream_http_status,
        diagnostic.provider_status,
        diagnostic.route,
        diagnostic.transport_failure,
        diagnostic.rate_limit_scope,
        diagnostic.retry_after_seconds,
        diagnostic.request_bytes,
        diagnostic.elapsed_ms,
        diagnostic.timeout_ms,
        diagnostic.request_task,
        diagnostic.failure_type,
        diagnostic.safety_ratings,
        diagnostic.finish_reason,
        diagnostic.prompt_block_reason,
        diagnostic.response_shape,
        diagnostic.candidate_count,
        diagnostic.estimated_input_tokens,
        diagnostic.observed_input_tokens,
        diagnostic.observed_output_tokens
      )
      .run();

    return true;
  }

  catch (error) {
    console.error(
      "usage_diagnostic_write_failed",
      String(
        error?.message ||
        error
      ).slice(
        0,
        400
      )
    );

    return false;
  }
}

export {
  ensureUsageDiagnostics,
  normalizeUsageDiagnostic,
  recordUsageFailure,
  diagnosticSafetyRatings,
  usageFailureType,
};
