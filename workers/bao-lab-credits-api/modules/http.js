// Shared HTTP, CORS and request-body safety boundary.
const MAX_BODY_BYTES = 220_000;
const SESSION_COOKIE_NAME = "__Host-yorubay_session";

const WorkerHttp = (() => {
  function withSecurityHeaders(
    response
  ) {
    const headers =
      new Headers(
        response.headers
      );
  
    headers.set(
      "x-content-type-options",
      "nosniff"
    );
  
    headers.set(
      "x-frame-options",
      "DENY"
    );
  
    headers.set(
      "referrer-policy",
      "no-referrer"
    );
  
    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=()"
    );
  
    headers.set(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );

    headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains"
    );
  
    return new Response(
      response.body,
      {
        status:
          response.status,
  
        statusText:
          response.statusText,
  
        headers,
      }
    );
  }
  
  const json = (
    data,
    status = 200
  ) =>
    withSecurityHeaders(
      new Response(
        JSON.stringify(data),
        {
          status,
  
          headers: {
            "content-type":
              "application/json; charset=utf-8",
  
            "cache-control":
              "no-store",
          },
        }
      )
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

  async function readJsonWithLimit(
    request,
    maxBytes = MAX_BODY_BYTES
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
        maxBytes
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
  
  async function readJson(
    request
  ) {
    return readJsonWithLimit(
      request,
      MAX_BODY_BYTES
    );
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

  function trustedCookieMutation(
    request,
    origin
  ) {
    if (
      [
        "GET",
        "HEAD",
        "OPTIONS",
      ].includes(
        request.method
      )
    ) {
      return true;
    }

    const authorization =
      request.headers.get(
        "authorization"
      ) || "";

    if (
      authorization.startsWith(
        "Bearer "
      )
    ) {
      return true;
    }

    const cookie =
      request.headers.get(
        "cookie"
      ) || "";

    const hasSessionCookie =
      cookie
        .split(";")
        .some(
          (part) =>
            part
              .trim()
              .startsWith(
                SESSION_COOKIE_NAME +
                "="
              )
        );

    return (
      !hasSessionCookie ||
      Boolean(
        origin?.origin &&
        origin?.allowed
      )
    );
  }
  
  function cors(
    response,
    origin
  ) {
    response =
      withSecurityHeaders(
        response
      );
  
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
      "access-control-allow-credentials",
      "true"
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

  return Object.freeze({
    withSecurityHeaders,
    json,
    fail,
    readJsonWithLimit,
    readJson,
    validOrigin,
    trustedCookieMutation,
    cors,
  });
})();

const {
  withSecurityHeaders,
  json,
  fail,
  readJsonWithLimit,
  readJson,
  validOrigin,
  trustedCookieMutation,
  cors,
} = WorkerHttp;

export {
  WorkerHttp,
  SESSION_COOKIE_NAME,
  cors,
  fail,
  json,
  readJson,
  readJsonWithLimit,
  trustedCookieMutation,
  validOrigin,
  withSecurityHeaders,
};
