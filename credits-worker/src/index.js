// BAO/LAB credits pilot. No prompts or responses are persisted.
// Keep all credentials in Cloudflare Worker secrets, never in GitHub or frontend code.
const MAX_BODY_BYTES = 28_000;
const MAX_PROMPT_BYTES = 24_000;
const MAX_OUTPUT = 4096;
const OTHER_DAILY_LIMIT = 50;
const now = () => new Date().toISOString();
const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const fail = (message, status = 400) => json({ error: message }, status);

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
function modelConfig(env, provider, model) {
  let rows;
  try { rows = JSON.parse(env.MODELS_JSON || '[]'); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  const item = rows.find(m => m.provider === provider && m.model === model);
  if (!item || !integer(item.input_microusd_per_million, 0, 1e12) ||
      !integer(item.output_microusd_per_million, 0, 1e12)) return null;
  return item;
}
function estimate(inputTokens, outputTokens, model) {
  return Math.ceil((inputTokens * model.input_microusd_per_million +
    outputTokens * model.output_microusd_per_million) / 1_000_000);
}
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) return null;
  if (!messages.every(m => m && ['system', 'user', 'assistant'].includes(m.role) &&
      typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 16_000)) return null;
  if (!messages.some(m => m.role === 'user')) return null;
  const simple = messages.map(({ role, content }) => ({ role, content }));
  return new TextEncoder().encode(JSON.stringify(simple)).length <= MAX_PROMPT_BYTES ? simple : null;
}
function validOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return { allowed: true, origin: null }; // CLI/server calls still require a bearer token.
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
    return json({ players: rows.results });
  }
  if (path === '/admin/players' && request.method === 'POST') {
    const body = await readJson(request);
    const credit = body?.balance_microusd ?? 0;
    const daily = body?.daily_chat_limit ?? 200;
    if (!integer(credit, 0, 100_000_000) || !integer(daily, 1, 500)) return fail('invalid_player_settings');
    const id = crypto.randomUUID();
    const token = newToken();
    await db.prepare('INSERT INTO players (id, token_hash, balance_microusd, daily_chat_limit) VALUES (?, ?, ?, ?)')
      .bind(id, await hashToken(token), credit, daily).run();
    return json({ player_id: id, player_token: token, balance_microusd: credit, daily_chat_limit: daily }, 201);
  }
  const match = path.match(/^\/admin\/players\/([0-9a-f-]{36})\/(credit|disable)$/);
  if (match && request.method === 'POST') {
    if (match[2] === 'disable') {
      const result = await db.prepare('UPDATE players SET enabled = 0 WHERE id = ?').bind(match[1]).run();
      return result.meta.changes ? json({ disabled: true }) : fail('player_not_found', 404);
    }
    const body = await readJson(request);
    if (!integer(body?.amount_microusd, 1, 100_000_000)) return fail('invalid_credit_amount');
    const result = await db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ? AND balance_microusd <= 1000000000 - ?')
      .bind(body.amount_microusd, match[1], body.amount_microusd).run();
    return result.meta.changes ? json({ credited: body.amount_microusd }) : fail('player_not_found_or_balance_limit', 404);
  }
  if (path === '/admin/usage' && request.method === 'GET') {
    const id = url.searchParams.get('player_id');
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return fail('player_id_required');
    const rows = await db.prepare('SELECT request_id, provider, model, request_kind, input_tokens, output_tokens, cost_microusd, status, created_at FROM api_usage WHERE player_id = ? ORDER BY created_at DESC LIMIT 100')
      .bind(id).all();
    return json({ usage: rows.results });
  }
  return fail('not_found', 404);
}
async function providerCall(env, provider, model, messages, maxOutput) {
  let endpoint, init;
  if (provider === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) throw new Error('provider_not_configured');
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    init = { method: 'POST', headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxOutput, stream: false }) };
  } else if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('provider_not_configured');
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw new Error('invalid_model');
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const payload = { contents, generationConfig: { maxOutputTokens: maxOutput } };
    if (system) payload.systemInstruction = { parts: [{ text: system }] };
    init = { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(payload) };
  } else throw new Error('invalid_provider');
  const response = await fetch(endpoint, { ...init, signal: AbortSignal.timeout(60_000) });
  // Never relay raw upstream errors; they may contain private diagnostics.
  if (!response.ok) return { ok: false, upstreamStatus: response.status };
  const data = await response.json();
  if (provider === 'openrouter') {
    const text = data.choices?.[0]?.message?.content;
    const usage = data.usage;
    const input = usage?.prompt_tokens;
    const output = usage?.completion_tokens;
    return { ok: typeof text === 'string', text, input, output, reportedCostUsd: usage?.cost };
  }
  const text = data.candidates?.[0]?.content?.parts?.filter(p => typeof p.text === 'string').map(p => p.text).join('');
  const usage = data.usageMetadata;
  const input = usage?.promptTokenCount;
  const output = integer(usage?.totalTokenCount, 0, 1e9) && integer(input, 0, 1e9)
    ? Math.max(0, usage.totalTokenCount - input)
    : (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
  return { ok: typeof text === 'string', text, input, output };
}
async function chatRoute(request, env, db) {
  const player = await playerFor(request, db);
  if (!player || !player.enabled) return fail('unauthorized', 401);
  if (request.method === 'GET') {
    const used = await db.prepare("SELECT COUNT(*) AS n FROM api_usage WHERE player_id = ? AND request_kind = 'chat' AND status IN ('pending','ok','unverified') AND date(created_at) = date('now')").bind(player.id).first();
    return json({ player_id: player.id, balance_microusd: player.balance_microusd,
      daily_chat_limit: player.daily_chat_limit, chat_used_today_utc: used.n });
  }
  const body = await readJson(request);
  const kind = body?.request_kind || 'chat';
  const provider = body?.provider, model = body?.model;
  const messages = normalizeMessages(body?.messages);
  const config = modelConfig(env, provider, model);
  if (!['chat', 'status', 'summary'].includes(kind) || !messages || !config) return fail('invalid_request_or_model_not_allowed');
  const maxOutput = body?.max_output_tokens ?? 1024;
  if (!integer(maxOutput, 1, MAX_OUTPUT)) return fail('invalid_max_output_tokens');
  const inputBytes = new TextEncoder().encode(JSON.stringify(messages)).length;
  const reserve = Math.max(100, estimate(inputBytes + 1024, maxOutput, config) * 2 + 100);
  if (!integer(reserve, 1, 100_000_000)) return fail('request_budget_too_large');
  const requestId = crypto.randomUUID();
  const insert = db.prepare(`INSERT INTO api_usage (request_id, player_id, provider, model, request_kind, status)
    SELECT ?, id, ?, ?, ?, 'pending' FROM players WHERE id = ? AND enabled = 1 AND balance_microusd >= ?
    AND (SELECT COUNT(*) FROM api_usage WHERE player_id = ? AND request_kind = ?
      AND status IN ('pending','ok','unverified') AND date(created_at) = date('now'))
    < CASE WHEN ? = 'chat' THEN daily_chat_limit ELSE ${OTHER_DAILY_LIMIT} END`)
    .bind(requestId, provider, model, kind, player.id, reserve, player.id, kind, kind);
  const debit = db.prepare(`UPDATE players SET balance_microusd = balance_microusd - ?
    WHERE id = ? AND balance_microusd >= ? AND EXISTS
    (SELECT 1 FROM api_usage WHERE request_id = ? AND status = 'pending')`)
    .bind(reserve, player.id, reserve, requestId);
  const [insertResult, debitResult] = await db.batch([insert, debit]);
  if (!insertResult.meta.changes) return fail('daily_limit_or_insufficient_balance', 429);
  if (!debitResult.meta.changes) {
    await db.prepare("UPDATE api_usage SET status = 'denied' WHERE request_id = ?").bind(requestId).run();
    return fail('insufficient_balance', 402);
  }
  let result;
  try { result = await providerCall(env, provider, model, messages, maxOutput); }
  catch { result = { ok: false }; }
  if (!result.ok) {
    // Refund on failure. The provider may still bill some failures: reconcile externally.
    await db.batch([
      db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ?').bind(reserve, player.id),
      db.prepare("UPDATE api_usage SET status = 'failed' WHERE request_id = ?").bind(requestId)
    ]);
    return fail('provider_request_failed', 502);
  }
  const verified = integer(result.input, 0, 1e9) && integer(result.output, 0, 1e9);
  // Missing usage: keep the reserved amount, label it unverified; never report it as exact cost.
  let actual = verified ? estimate(result.input, result.output, config) : reserve;
  if (verified && provider === 'openrouter' && typeof result.reportedCostUsd === 'number' &&
      Number.isFinite(result.reportedCostUsd) && result.reportedCostUsd >= 0) {
    actual = Math.ceil(result.reportedCostUsd * 1_000_000);
  }
  if (!integer(actual, 0, 1_000_000_000)) actual = reserve;
  // A higher actual charge can happen if the manual model pricing table is stale.
  // Charge no more than reserved; operators must reconcile provider invoices.
  const charged = Math.min(actual, reserve);
  await db.batch([
    db.prepare('UPDATE players SET balance_microusd = balance_microusd + ? WHERE id = ?').bind(reserve - charged, player.id),
    db.prepare('UPDATE api_usage SET input_tokens = ?, output_tokens = ?, cost_microusd = ?, status = ? WHERE request_id = ?')
      .bind(verified ? result.input : 0, verified ? result.output : 0, charged, verified ? 'ok' : 'unverified', requestId)
  ]);
  return json({ request_id: requestId, provider, model, content: result.text,
    usage: { input_tokens: verified ? result.input : null, output_tokens: verified ? result.output : null,
      charged_microusd: charged, estimated_or_unverified: !verified || charged !== actual } });
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
        response = json({ ok: true, service: 'bao-lab-credits-pilot' });
      } else if (url.pathname.startsWith('/admin/')) response = await adminRoute(request, url, env, db);
      else if (url.pathname === '/me' && request.method === 'GET') response = await chatRoute(request, env, db);
      else if (url.pathname === '/chat' && request.method === 'POST') response = await chatRoute(request, env, db);
      else response = fail('not_found', 404);
      return cors(response, origin.origin);
    } catch (error) {
      if (['empty_body', 'invalid_json', 'request_too_large'].includes(error?.message))
        return cors(fail(error.message, error.message === 'request_too_large' ? 413 : 400), origin.origin);
      // Never leak database errors, credentials, upstream responses, or conversations.
      return cors(fail('internal_error', 500), origin.origin);
    }
  }
};
