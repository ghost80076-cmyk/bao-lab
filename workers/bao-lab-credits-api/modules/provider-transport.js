import {
  fail,
} from "./http.js";

import {
  estimatedPromptTokens,
  modelConfig,
  openRouterPriceGuard,
} from "./model-pricing.js";

import {
  integer,
  safeInt,
  usageInt,
} from "./number-utils.js";

import {
  playerUsesAwsOpenRouter,
} from "./runtime-config.js";

const enc = new TextEncoder();

// Internal provider network-transport boundary. It owns provider payloads,
// upstream HTTP calls, response normalization and provider-facing error mapping.
// Route selection, pricing and wallet settlement stay outside this block.
const WorkerProviderTransport = (() => {
  // Hosted OpenRouter requests keep the stable system prefix as the first
  // system message. Claude requires an explicit cache breakpoint when the
  // selected endpoint may be Bedrock or Vertex; top-level automatic caching
  // would exclude those endpoints. Keep the rest of the conversation as plain
  // strings so only the stable prefix is cached.
  function openRouterExplicitCacheMessages(
    model,
    messages
  ) {
    if (
      !/^anthropic\/claude-/i.test(
        String(model || "")
      ) ||
      !Array.isArray(messages)
    ) {
      return messages;
    }

    const stableIndex =
      messages.findIndex(
        (message) =>
          message?.role ===
            "system" &&
          typeof message
            ?.content ===
            "string" &&
          message.content.trim()
      );

    if (
      stableIndex <
      0
    ) {
      return messages;
    }

    return messages.map(
      (message, index) =>
        index ===
        stableIndex
          ? {
              ...message,

              content: [
                {
                  type:
                    "text",

                  text:
                    message
                      .content,

                  cache_control: {
                    type:
                      "ephemeral",
                  },
                },
              ],
            }
          : message
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
  
  async function recoverOpenRouterUsage(
    env,
    generationId
  ) {
    const id =
      String(
        generationId ||
        ""
      ).trim();

    if (
      !env.OPENROUTER_API_KEY ||
      !/^gen-[A-Za-z0-9_-]{8,200}$/.test(
        id
      )
    ) {
      return null;
    }

    try {
      const response =
        await fetch(
          "https://openrouter.ai/api/v1/generation?id=" +
            encodeURIComponent(
              id
            ),
          {
            method:
              "GET",

            headers: {
              authorization:
                `Bearer ${env.OPENROUTER_API_KEY}`,

              accept:
                "application/json",
            },

            signal:
              AbortSignal.timeout(
                5_000
              ),
          }
        );

      if (
        !response.ok
      ) {
        return null;
      }

      const payload =
        await response.json();

      const data =
        payload?.data ||
        {};

      const input =
        usageInt(
          data.tokens_prompt ??
          data.native_tokens_prompt
        );

      const output =
        usageInt(
          data.tokens_completion ??
          data.native_tokens_completion
        );

      if (
        input === null ||
        output === null
      ) {
        return null;
      }

      const rawCost =
        Number(
          data.total_cost ??
          data.usage
        );

      return {
        input,
        output,

        cached:
          safeInt(
            data.native_tokens_cached
          ),

        cacheWrite:
          0,

        reasoning:
          safeInt(
            data.native_tokens_reasoning
          ),

        providerCost:
          Number.isFinite(
            rawCost
          ) &&
          rawCost >= 0
            ? rawCost
            : null,
      };
    }

    catch {
      return null;
    }
  }

  function retryAfterSeconds(
    response
  ) {
    const raw =
      String(
        response?.headers?.get?.(
          "retry-after"
        ) ||
        ""
      ).trim();

    if (
      !raw
    ) {
      return null;
    }

    const numeric =
      Number(
        raw
      );

    if (
      Number.isFinite(
        numeric
      ) &&
      numeric >= 0
    ) {
      return Math.min(
        3600,
        Math.ceil(
          numeric
        )
      );
    }

    const timestamp =
      Date.parse(
        raw
      );

    if (
      !Number.isFinite(
        timestamp
      )
    ) {
      return null;
    }

    return Math.min(
      3600,
      Math.max(
        0,
        Math.ceil(
          (
            timestamp -
            Date.now()
          ) /
          1000
        )
      )
    );
  }

  async function rateLimitDiagnostic(
    response
  ) {
    let scope =
      "unknown";

    try {
      const payload =
        await response
          .clone()
          .json();

      const raw =
        [
          payload?.error?.message,
          payload?.message,
          payload?.error?.code,
          payload?.code,
          typeof payload?.error === "string"
            ? payload.error
            : "",
        ]
          .filter(
            value =>
              typeof value ===
                "string" ||
              typeof value ===
                "number"
          )
          .join(
            " "
          )
          .toLowerCase()
          .slice(
            0,
            1200
          );

      if (
        /insufficient|quota|credit|balance|budget|spend(?:ing)?|daily|weekly|monthly/.test(
          raw
        )
      ) {
        scope =
          "quota";
      }

      else if (
        /rate.?limit|too many requests|\brpm\b|\btpm\b|requests per|tokens per/.test(
          raw
        )
      ) {
        scope =
          "rate";
      }

      else if (
        /provider|upstream|capacity|overload|temporar(?:y|ily)|unavailable/.test(
          raw
        )
      ) {
        scope =
          "provider";
      }
    }

    catch {
      // Do not forward raw upstream error bodies. Only the safe enum below
      // leaves the Worker.
    }

    return {
      scope,

      retryAfterSeconds:
        retryAfterSeconds(
          response
        ),
    };
  }

  async function providerCall(
    env,
    provider,
    model,
    messages,
    maxOutput,
    player = null,
    sessionId = ""
  ) {
    let endpoint;
    let init;
    let usingAwsRelay =
      false;
  
    const configuredModel =
      modelConfig(
        env,
        provider,
        model
      );
  
    const openRouterGuard =
      provider ===
        "openrouter"
        ? openRouterPriceGuard(
            configuredModel,
            estimatedPromptTokens(
              messages
            )
          )
        : null;

    const openRouterMessages =
      provider ===
        "openrouter"
        ? openRouterExplicitCacheMessages(
            model,
            messages
          )
        : messages;
  
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
                messages:
                  openRouterMessages,
  
                max_output_tokens:
                  maxOutput,
  
                openrouter_provider:
                  openRouterGuard
                    ?.provider,
  
                ...(sessionId
                  ? {
                      session_id:
                        sessionId,
                    }
                  : {}),
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
                messages:
                  openRouterMessages,
  
                max_tokens:
                  maxOutput,
  
                stream:
                  false,
  
                provider:
                  openRouterGuard
                    ?.provider,
  
                ...(sessionId
                  ? {
                      session_id:
                        sessionId,
                    }
                  : {}),
  
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
  
    const route =
      (
        provider ===
          "gemini" ||
        usingAwsRelay
      )
        ? "aws_relay"
        : provider ===
            "openrouter"
          ? "direct_openrouter"
          : provider ===
              "anthropic"
            ? "direct_anthropic"
            : "provider_direct";
  
    const requestBytes =
      enc.encode(
        String(
          init?.body ||
          ""
        )
      ).length;

    // AWS relay adds another network hop and can legitimately need more
    // wall-clock time than direct provider calls. Keep this below the
    // current 180s Gunicorn timeout so the relay still owns the outer cutoff.
    const transportTimeoutMs =
      route ===
        "aws_relay"
        ? 170_000
        : 75_000;
  
    let response;
    const transportStartedAt =
      Date.now();
  
    try {
      response =
        await fetch(
          endpoint,
          {          ...init,
  
            signal:
              AbortSignal.timeout(
                transportTimeoutMs
              ),
          }
        );
    }
  
    catch (error) {
      const elapsedMs =
        Math.max(
          0,
          Date.now() -
            transportStartedAt
        );

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
  
        route,
        requestBytes,

        elapsedMs,
        transportTimeoutMs,

        transportFailure:
          error?.name ===
            "TimeoutError" ||
          elapsedMs >=
            Math.max(
              0,
              transportTimeoutMs -
                1_000
            )
            ? "timeout"
            : "network",
      };
    }
  
    if (
      !response.ok &&
      provider ===
        "openrouter" &&
      usingAwsRelay &&
      response.status ===
        400 &&
      openRouterMessages !==
        messages
    ) {
      let relayError =
        null;

      try {
        relayError =
          await response
            .clone()
            .json();
      }

      catch {
        relayError =
          null;
      }

      if (
        relayError
          ?.error ===
        "invalid_messages"
      ) {
        let fallbackBody;

        try {
          fallbackBody =
            JSON.parse(
              init.body
            );
        }

        catch {
          fallbackBody =
            null;
        }

        if (
          fallbackBody &&
          typeof fallbackBody ===
            "object"
        ) {
          fallbackBody.messages =
            messages;

          init = {
            ...init,

            body:
              JSON.stringify(
                fallbackBody
              ),
          };

          try {
            response =
              await fetch(
                endpoint,
                {
                  ...init,

                  signal:
                    AbortSignal.timeout(
                transportTimeoutMs
              ),
                }
              );
          }

          catch (error) {
            const elapsedMs =
              Math.max(
                0,
                Date.now() -
                  transportStartedAt
              );

            return {
              ok:
                false,

              category:
                "relay_network_error",

              route,
              requestBytes,

              elapsedMs,
              transportTimeoutMs,

              transportFailure:
                error?.name ===
                  "TimeoutError" ||
                elapsedMs >=
                  Math.max(
                    0,
                    transportTimeoutMs -
                      1_000
                  )
                  ? "timeout"
                  : "network",
            };
          }
        }
      }
    }

    if (
      !response.ok
    ) {
      const rateLimit =
        response.status ===
          429
          ? await rateLimitDiagnostic(
              response
            )
          : null;

      const diagnostic =
        provider ===
          "gemini" &&
        response.status !==
          413
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
        response.status ===
          413
          ? route ===
              "aws_relay"
            ? "relay_request_too_large"
            : "provider_request_too_large"
          : provider ===
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

        rateLimitScope:
          rateLimit
            ?.scope,

        retryAfterSeconds:
          rateLimit
            ?.retryAfterSeconds,
  
        route,
        requestBytes,
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

      let input =
        usageInt(
          usage.prompt_tokens
        );

      let output =
        usageInt(
          usage
            .completion_tokens
        );

      let cached =
        safeInt(
          usage
            .prompt_tokens_details
            ?.cached_tokens
        );

      let cacheWrite =
        safeInt(
          usage
            .prompt_tokens_details
            ?.cache_write_tokens
        );

      let reasoning =
        safeInt(
          usage
            .completion_tokens_details
            ?.reasoning_tokens
        );

      let providerCost =
        Number(
          usage.cost
        );

      providerCost =
        Number.isFinite(
          providerCost
        ) &&
        providerCost >= 0
          ? providerCost
          : null;

      const generationId =
        String(
          data.id ||
          response.headers.get(
            "x-generation-id"
          ) ||
          ""
        ).trim();

      if (
        (
          input === null ||
          output === null
        ) &&
        generationId
      ) {
        const recovered =
          await recoverOpenRouterUsage(
            env,
            generationId
          );

        if (recovered) {
          input =
            input ??
            recovered.input;

          output =
            output ??
            recovered.output;

          cached =
            recovered.cached;

          cacheWrite =
            recovered.cacheWrite;

          reasoning =
            recovered.reasoning;

          providerCost =
            providerCost ??
            recovered.providerCost;
        }
      }

      return {
        ok:
          typeof text ===
            "string" &&
          !!text.trim(),

        text,
        input,
        output,
        cached,
        cacheWrite,
        reasoning,
        providerCost,

        generationId:
          generationId ||
          null,

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
        usageInt(
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
        freshInput === null
          ? null
          : freshInput +
            cacheWrite +
            cached;
  
      const output =
        usageInt(
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
      usageInt(
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
  
    const total =
      usageInt(
        usage.totalTokenCount
      );

    const candidateOutput =
      usageInt(
        usage
          .candidatesTokenCount
      );

    const output =
      total !== null &&
      input !== null
        ? Math.max(
            0,
            total -
            input
          )
        : candidateOutput ===
            null
          ? null
          : candidateOutput +
            reasoning;
  
    return {
      ok:
        typeof text ===
          "string" &&
        !!text.trim(),
  
      text,
  
      input,
  
      freshInput:
        input === null
          ? null
          : Math.max(
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
          data.promptFeedback
            ?.blockReason ||
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
      [
        "aws_relay",
        "direct_openrouter",
        "direct_anthropic",
        "provider_direct",
      ].includes(
        result.route
      )
    ) {
      extra.route =
        result.route;
    }
  
    if (
      integer(
        result
          .requestBytes,
        1,
        10_000_000
      )
    ) {
      extra.request_bytes =
        result.requestBytes;
    }
  
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
      [
        "rate",
        "quota",
        "provider",
        "unknown",
      ].includes(
        result
          .rateLimitScope
      )
    ) {
      extra.rate_limit_scope =
        result
          .rateLimitScope;
    }

    if (
      integer(
        result
          .retryAfterSeconds,
        1,
        3600
      )
    ) {
      extra.retry_after_seconds =
        result
          .retryAfterSeconds;
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

  return Object.freeze({
    geminiErrorHint,
    anthropicPayload,
    recoverOpenRouterUsage,
    providerCall,
    providerFailureResponse,
  });
})();

const {
  geminiErrorHint,
  anthropicPayload,
  recoverOpenRouterUsage,
  providerCall,
  providerFailureResponse,
} = WorkerProviderTransport;

export {
  WorkerProviderTransport,
  anthropicPayload,
  geminiErrorHint,
  providerCall,
  providerFailureResponse,
  recoverOpenRouterUsage,
};
