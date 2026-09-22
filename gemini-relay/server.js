import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const maxBodyBytes = 120_000;
const reply = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};

export function createHandler({ token, apiKey, allowedModels, upstreamFetch = fetch }) {
  if (!token || !apiKey || !allowedModels.length) throw new Error('relay_configuration_missing');
  return async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') return reply(res, 200, { ok: true });
    if (req.url !== '/generate' || req.method !== 'POST') return reply(res, 404, { error: 'not_found' });
    if (!equal(req.headers.authorization, `Bearer ${token}`)) return reply(res, 401, { error: 'unauthorized' });
    let chunks = [], size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBodyBytes) return reply(res, 413, { error: 'request_too_large' });
        chunks.push(chunk);
      }
      const { model, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof model !== 'string' || !allowedModels.includes(model) || !/^[a-zA-Z0-9._-]{1,100}$/.test(model) ||
          !payload || typeof payload !== 'object' || !Array.isArray(payload.contents) ||
          !payload.contents.length || payload.contents.length > 100 ||
          !Number.isSafeInteger(payload.generationConfig?.maxOutputTokens) ||
          payload.generationConfig.maxOutputTokens < 1 || payload.generationConfig.maxOutputTokens > 8192)
        return reply(res, 400, { error: { status: 'INVALID_ARGUMENT' } });
      // Build a new request from allowlisted fields. Never forward incoming headers,
      // visitor IP, player token, Cloudflare metadata or relay authorization.
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const upstream = await upstreamFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(55_000)
      });
      const raw = await upstream.text();
      let data;
      try { data = JSON.parse(raw); } catch { return reply(res, 502, { error: 'provider_invalid_json' }); }
      if (!upstream.ok) {
        // Google error messages may echo private input. Return only the status and
        // a strictly allowlisted provider code; never log or return its message.
        const statuses = new Set(['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'PERMISSION_DENIED',
          'UNAUTHENTICATED', 'RESOURCE_EXHAUSTED', 'NOT_FOUND', 'UNAVAILABLE']);
        return reply(res, upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502,
          { error: { status: statuses.has(data?.error?.status) ? data.error.status : 'UNKNOWN' } });
      }
      if (raw.length > 2_000_000) return reply(res, 502, { error: 'provider_response_too_large' });
      return reply(res, 200, data);
    } catch {
      return reply(res, 502, { error: 'provider_network_error' });
    }
  };
}

if (process.env.NODE_ENV !== 'test') {
  const token = process.env.RELAY_TOKEN, apiKey = process.env.GEMINI_API_KEY;
  const allowedModels = (process.env.ALLOWED_MODELS || '').split(',').map(x => x.trim()).filter(Boolean);
  const handler = createHandler({ token, apiKey, allowedModels });
  http.createServer(handler).listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
