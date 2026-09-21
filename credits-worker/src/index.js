// BAO/LAB invited relay. The legacy D1 balance_microusd and cost_microusd
// columns are used as VIRTUAL CREDITS in this free-model pilot, NOT USD.
// 1 credit = 100 provider-reported tokens (input + output, including thinking).
// Never store player conversations or provider/admin keys in D1 or source.
const MAX_BODY_BYTES = 110_000;
const MAX_PROMPT_BYTES = 96_000;
const MAX_OUTPUT = 8192;
const MAX_MESSAGES = 100;
const CREDIT_TOKEN_UNIT = 100;
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const fail = (error, status = 400, extra = {}) => json({ error, ...extra }, status);

async function readJson(request) {
  if (!request.body) throw new Error('empty_body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('request_too_large'); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { throw new Error('invalid_json'); }
}
function tokenFrom(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
async function hashToken(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 'bao_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function getDb(env) { return env['資料庫'] || env.DB; }
function modelAllowed(env, provider, model) {
  let models;
  try { models = JSON.parse(env.MODELS_JSON || '[]'); } catch { return false; }
  return Array.isArray(models) && models.some(m => m?.provider === provider && m?.model === model);
}
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return null;
  if (!messages.every(m => m && ['system','user','assistant'].includes(m.role) &&
      typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 80_000)) return null;
  if (!messages.some(m => m.role === 'user')) return null;
  const simple = messages.map(({ role, content }) => ({ role, content }));
  return new TextEncoder().encode(JSON.stringify(simple)).length <= MAX_PROMPT_BYTES ? simple : null;
}
function validOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return { allowed: true, origin: null };
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
  return { allowed: allowed.includes(origin), origin };
}
function cors(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-max-age', '600');
  headers.set('vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
async function playerFor(request, db) {
  const token = tokenFrom(request);
  if (!token || token.length > 256) return null;
  return db.prepare('SELECT id, balance_microusd, daily_chat_limit, enabled FROM players WHERE token_hash = ?')
    .bind(await hashToken(token)).first();
}
async function adminRoute(request, url, env, db) {
  if (!env.ADMIN_TOKEN || tokenFrom(request) !== env.ADMIN_TOKEN) return fail('unauthorized', 401);
  const path = url.pathname;
  if (path === '/admin/players' && request.method === 'GET') {
    const rows = await db.prepare('SELECT id, balance_microusd, daily_chat_limit, enabled, created_at FROM players ORDER BY created_at DESC LIMIT 200').all();
    return json({ players: rows.results.map(({ balance_microusd, ...player }) => ({ ...player,
      balance_credits: balance_microusd, daily_chat_limit: null, legacy_daily_chat_limit: player.daily_chat_limit })) });
  }
  if (path === '/admin/players' && request.method === 'POST') {
    const body = await readJson(request);
    // Old field names remain accepted so existing admin scripts continue working.
    const credit = body?.balance_credits ?? body?.balance_microusd ?? 0;
    const daily = body?.daily_chat_limit ?? 200; // retained only for D1 schema compatibility
    if (!integer(credit, 0, 100_000_000) || !integer(daily, 1, 500)) return fail('invalid_player_settings');
    const id = crypto.randomUUID(), token = newToken();
    await db.prepare('INSERT INTO players (id, token_hash, balance_microusd, daily_chat_limit) VALUES (?, ?, ?, ?)')
      .bind(id, await hashToken(token), credit, daily).run();
    return json({ player_id: id, player_token: token, balance_credits: credit,
      balance_microusd: credit, daily_chat_limit: null, credit_unit: '100_tokens' }, 201);
  }
  const match = path.match(/^\/admin\/players\/([0-9a-f-]{36})\/(credit|disable)$/);
  if (match && request.method === 'POST') {
    if (match[2] === 'disable') {
      const result = await db.prepare('UPDATE players SET enabled = 0 WHERE id = ?').bind(match[1]).run();
      return result.meta.changes ? json({ disabled: true }) : fail('player_not_found', 404);
    }
    const body = await readJson(request);
    const amount = body?.amount_credits ?? body?.amount_microusd;
    if (!integer(amount, 1, 100_000_000)) return fail('invalid_credit_amount');
    const result = await db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ? AND balance_microusd <= 1000000000 - ?')
      .bind(amount, match[1], amount).run();
    return result.meta.changes ? json({ credited_credits: amount }) : fail('player_not_found_or_balance_limit', 404);
  }
  if (path === '/admin/usage' && request.method === 'GET') {
    const id = url.searchParams.get('player_id');
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return fail('player_id_required');
    const rows = await db.prepare('SELECT request_id, provider, model, request_kind, input_tokens, output_tokens, cost_microusd, status, created_at FROM api_usage WHERE player_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(id).all();
    return json({ usage: rows.results.map(({ cost_microusd, ...row }) => ({ ...row,
      cost_microusd, charged_credits: cost_microusd })) });
  }
  return fail('not_found', 404);
}
// Classify only known Google error phrases. Never send back Google's raw message:
// provider messages may include snippets of a user's private prompt or key.
async function geminiBadRequestHint(response) {
  try {
    const payload = await response.json();
    const message = String(payload?.error?.message || '').toLowerCase().slice(0, 4000);
    if (/thought.?signature|thought_signature/.test(message)) return 'thought_signature';
    if (/max.?output.?tokens|generation.?config|thinking.?budget|thinking.?level/.test(message)) return 'generation_config';
    if (/system.?instruction/.test(message)) return 'system_instruction';
    if (/contents|turns?|parts?|roles?|conversation/.test(message)) return 'message_format';
    if (/context.length|token.limit|too.many.tokens|input.too.long|request.too.large/.test(message)) return 'context_limit';
    if (/not.found|not.supported|not.available|deprecated/.test(message) && /model/.test(message)) return 'model_unavailable';
    if (/api.?key|api_key/.test(message)) return 'api_key';
    if (/location|region|country/.test(message)) return 'region';
    if (/invalid.argument|invalid.request/.test(message)) return 'invalid_argument';
  } catch { /* Response body unavailable: report only safe fallback code. */ }
  return 'unknown';
}
async function providerCall(env, provider, model, messages, maxOutput) {
  let endpoint, init;
  if (provider === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) return { ok: false, category: 'provider_not_configured' };
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    init = { method: 'POST', headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxOutput, stream: false }) };
  } else if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) return { ok: false, category: 'provider_not_configured' };
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) return { ok: false, category: 'invalid_model' };
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const payload = { contents, generationConfig: { maxOutputTokens: maxOutput } };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    init = { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(payload) };
  } else return { ok: false, category: 'invalid_provider' };
  let response;
  try { response = await fetch(endpoint, { ...init, signal: AbortSignal.timeout(60_000) }); }
  catch { return { ok: false, category: 'provider_network_error' }; }
  if (!response.ok) {
    // Include only an allowlisted diagnostic code. A 400 is NOT the player's virtual credit limit.
    const category = provider === 'gemini' && response.status === 400
      ? `google_bad_request_${await geminiBadRequestHint(response)}` : 'provider_http_error';
    return { ok: false, category, upstreamStatus: response.status };
  }
  let data;
  try { data = await response.json(); }
  catch { return { ok: false, category: 'provider_invalid_json' }; }
  if (provider === 'openrouter') {
    const text = data.choices?.[0]?.message?.content;
    return { ok: typeof text === 'string' && !!text.trim(), text,
      input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens,
      category: 'provider_empty_text' };
  }
  const text = data.candidates?.[0]?.content?.parts?.filter(p => typeof p.text === 'string').map(p => p.text).join('');
  const usage = data.usageMetadata;
  const input = usage?.promptTokenCount;
  const output = integer(usage?.totalTokenCount, 0, 1e9) && integer(input, 0, 1e9)
    ? Math.max(0, usage.totalTokenCount - input)
    : (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  const finishReason = String(data.candidates?.[0]?.finishReason || '').replace(/[^A-Z_]/g, '').slice(0, 32);
  return { ok: typeof text === 'string' && !!text.trim(), text, input, output,
    category: 'provider_empty_text', finishReason };
}
async function chatRoute(request, env, db) {
  const player = await playerFor(request, db);
  if (!player || !player.enabled) return fail('unauthorized', 401);
  if (request.method === 'GET') {
    const used = await db.prepare("SELECT COUNT(*) AS n FROM api_usage WHERE player_id = ? AND request_kind = 'chat' AND status IN ('pending','ok','unverified') AND date(created_at) = date('now')").bind(player.id).first();
    return json({ player_id: player.id, balance_credits: player.balance_microusd,
      balance_microusd: player.balance_microusd, credit_unit: '100_tokens',
      daily_chat_limit: null, chat_used_today_utc: used.n });
  }
  const body = await readJson(request);
  const kind = body?.request_kind || 'chat';
  const provider = body?.provider, model = body?.model;
  const messages = normalizeMessages(body?.messages);
  if (!['chat','status','summary'].includes(kind) || !messages || !modelAllowed(env, provider, model))
    return fail('invalid_request_or_model_not_allowed');
  const maxOutput = body?.max_output_tokens ?? 2048;
  if (!integer(maxOutput, 1, MAX_OUTPUT)) return fail('invalid_max_output_tokens');
  const inputBytes = new TextEncoder().encode(JSON.stringify(messages)).length;
  // Conservative temporary reservation: UTF-8 bytes + max output tokens + overhead.
  // No per-day chat cap; every request is checked against the player's credit balance.
  const reserve = Math.ceil((inputBytes + maxOutput + 512) / CREDIT_TOKEN_UNIT);
  if (!integer(reserve, 1, 100_000_000)) return fail('request_budget_too_large');
  const requestId = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO api_usage (request_id, player_id, provider, model, request_kind, status)
    SELECT ?, id, ?, ?, ?, 'pending' FROM players
    WHERE id = ? AND enabled = 1 AND balance_microusd >= ?`)
    .bind(requestId, provider, model, kind, player.id, reserve);
  const debit = db.prepare(`UPDATE players SET balance_microusd = balance_microusd - ?
    WHERE id = ? AND balance_microusd >= ? AND EXISTS
    (SELECT 1 FROM api_usage WHERE request_id = ? AND status = 'pending')`)
    .bind(reserve, player.id, reserve, requestId);
  const [insertResult, debitResult] = await db.batch([insert, debit]);
  if (!insertResult.meta.changes) return fail('insufficient_credits', 402);
  if (!debitResult.meta.changes) {
    await db.prepare("UPDATE api_usage SET status = 'denied' WHERE request_id = ?").bind(requestId).run();
    return fail('insufficient_credits', 402);
  }
  const result = await providerCall(env, provider, model, messages, maxOutput);
  if (!result.ok) {
    // An upstream failure is not a player quota error. Return only safe status metadata.
    await db.batch([
      db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ?').bind(reserve, player.id),
      db.prepare("UPDATE api_usage SET status = 'failed' WHERE request_id = ?").bind(requestId)
    ]);
    const extra = {};
    if (integer(result.upstreamStatus, 400, 599)) extra.upstream_http_status = result.upstreamStatus;
    if (result.finishReason) extra.finish_reason = result.finishReason;
    if (result.category === 'provider_http_error' && result.upstreamStatus === 429)
      return fail('provider_rate_limited', 502, extra);
    return fail(result.category || 'provider_request_failed', 502, extra);
  }
  const verified = integer(result.input, 0, 1e9) && integer(result.output, 0, 1e9);
  const actual = verified ? Math.max(1, Math.ceil((result.input + result.output) / CREDIT_TOKEN_UNIT)) : reserve;
  const charged = Math.min(actual, reserve);
  await db.batch([
    db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ?').bind(reserve - charged, player.id),
    db.prepare('UPDATE api_usage SET input_tokens = ?, output_tokens = ?, cost_microusd = ?, status = ? WHERE request_id = ?')
      .bind(verified ? result.input : 0, verified ? result.output : 0, charged,
        verified && charged === actual ? 'ok' : 'unverified', requestId)
  ]);
  return json({ request_id: requestId, provider, model, content: result.text,
    usage: { input_tokens: verified ? result.input : null, output_tokens: verified ? result.output : null,
      charged_credits: charged, charged_microusd: charged, credit_unit: '100_tokens',
      estimated_or_unverified: !verified || charged !== actual } });
}
export default {
  async fetch(request, env) {
    const origin = validOrigin(request, env);
    if (!origin.allowed) return fail('origin_not_allowed', 403);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin.origin);
    const db = getDb(env);
    if (!db) return cors(fail('database_binding_missing', 503), origin.origin);
    const url = new URL(request.url);
    try {
      let response;
      if (url.pathname === '/health' && request.method === 'GET') {
        await db.prepare('SELECT id FROM players LIMIT 1').first();
        response = json({ ok: true, service: 'bao-lab-credits-pilot', credit_unit: '100_tokens', daily_chat_limit_enabled: false });
      } else if (url.pathname.startsWith('/admin/')) response = await adminRoute(request, url, env, db);
      else if (url.pathname === '/me' && request.method === 'GET') response = await chatRoute(request, env, db);
      else if (url.pathname === '/chat' && request.method === 'POST') response = await chatRoute(request, env, db);
      else response = fail('not_found', 404);
      return cors(response, origin.origin);
    } catch (error) {
      if (['empty_body','invalid_json','request_too_large'].includes(error?.message))
        return cors(fail(error.message, error.message === 'request_too_large' ? 413 : 400), origin.origin);
      // Never echo conversation content, credentials, raw upstream payloads or SQL.
      return cors(fail('internal_error', 500), origin.origin);
    }
  }
};