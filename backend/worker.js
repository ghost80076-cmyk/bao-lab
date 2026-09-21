// Optional five-player pilot. Keep disabled until operator configures a permitted provider.
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const enc = new TextEncoder();
async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
const bearer = request => /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") || "")?.[1] || "";
const fail = (message, status = 400, headers = {}) => json({ error: message }, status, headers);
const allowedOrigin = (request, env) => {
  const origin = request.headers.get("origin");
  return origin && origin === env.ALLOWED_ORIGIN ? origin : null;
};
const cors = origin => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "vary": "Origin"
});
const wrap = (response, origin) => {
  const headers = new Headers(response.headers);
  if (origin) for (const [key, value] of Object.entries(cors(origin))) headers.set(key, value);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers });
};
const parse = async request => {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new Error("請使用 JSON。");
  if (Number(request.headers.get("content-length") || 0) > 131072) throw new Error("請求太長。");
  const raw = await request.text();
  if (raw.length > 131072) throw new Error("請求太長。");
  return JSON.parse(raw);
};
async function player(request, env) {
  const key = bearer(request);
  if (!key) return null;
  return env.DB.prepare("SELECT id, label, credits, enabled, day_utc, calls_today FROM players WHERE token_hash = ?")
    .bind(await digest(key)).first();
}
const validateMessages = messages => Array.isArray(messages) && messages.length > 0 &&
  messages.length <= 80 && messages.every(m =>
    m && ["system", "user", "assistant"].includes(m.role) &&
    typeof m.content === "string" && m.content.length <= 20000
  ) && JSON.stringify(messages).length <= 100000;
async function admin(request, env, path) {
  const supplied = request.headers.get("authorization") || "";
  if (!env.ADMIN_TOKEN || supplied !== `Bearer ${env.ADMIN_TOKEN}`) return fail("未授權。", 401);
  if (path === "/admin/players" && request.method === "POST") {
    const body = await parse(request);
    const label = String(body.label || "").trim();
    if (!label || label.length > 64) return fail("玩家標籤須為 1 至 64 字。");
    const id = crypto.randomUUID(), secret = token();
    await env.DB.prepare("INSERT INTO players (id, label, token_hash) VALUES (?, ?, ?)")
      .bind(id, label, await digest(secret)).run();
    return json({ id, label, login_code: secret }, 201);
  }
  if (path === "/admin/topup" && request.method === "POST") {
    const body = await parse(request);
    const playerId = String(body.player_id || "");
    const reference = String(body.reference || "");
    const credits = Number(body.credits);
    if (!/^[a-f0-9-]{36}$/.test(playerId) || !/^[a-zA-Z0-9_-]{8,80}$/.test(reference) ||
        !Number.isSafeInteger(credits) || credits < 1 || credits > 100000) return fail("加值資料無效。");
    // Unique payment reference makes retrying this operation safe.
    const result = await env.DB.prepare("INSERT OR IGNORE INTO ledger (id, player_id, delta, kind) SELECT ?, id, ?, 'topup' FROM players WHERE id = ?")
      .bind("topup:" + reference, credits, playerId).run();
    if (!result.meta.changes) return fail("付款編號已使用，或找不到玩家。", 409);
    return json({ player_id: playerId, added: credits });
  }
  if (path === "/admin/players" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id, label, credits, enabled, day_utc, calls_today FROM players ORDER BY label").all();
    return json({ players: rows.results });
  }
  return fail("找不到路徑。", 404);
}
async function chat(request, env, user) {
  if (!user?.enabled) return fail("登入碼無效或已停用。", 401);
  const body = await parse(request);
  if (!validateMessages(body.messages)) return fail("對話格式或長度不符。");
  const provider = body.provider;
  if (!["openrouter", "gemini"].includes(provider)) return fail("請選擇可用的 AI 服務。");
  // Google AI Studio's Gemini API currently excludes Hong Kong end users.
  // Keep this route disabled unless the provider's terms permit the target audience.
  if (provider === "gemini" && env.ENABLE_GEMINI !== "true") return fail("此服務目前未向這些玩家開放。", 403);
  const model = provider === "gemini" ? env.GEMINI_MODEL : env.OPENROUTER_MODEL;
  const key = provider === "gemini" ? env.GEMINI_API_KEY : env.OPENROUTER_API_KEY;
  if (!model || !key || model.startsWith("replace-")) return fail("服務尚未開放。", 503);
  const day = new Date().toISOString().slice(0, 10);
  const limit = Math.min(200, Math.max(1, Number(env.DAILY_CALL_LIMIT) || 200));
  // Conditional update serializes balance and daily quota across concurrent requests.
  const reserved = await env.DB.prepare(`UPDATE players SET credits = credits - 1,
    calls_today = CASE WHEN day_utc = ? THEN calls_today + 1 ELSE 1 END, day_utc = ?
    WHERE id = ? AND enabled = 1 AND credits >= 1
    AND (day_utc <> ? OR calls_today < ?)`).bind(day, day, user.id, day, limit).run();
  if (!reserved.meta.changes) return fail("額度不足或已達今日上限。", 429);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO ledger (id, player_id, delta, kind) VALUES (?, ?, -1, 'request')")
    .bind(id, user.id).run();
  let upstream;
  try {
    if (provider === "openrouter") {
      upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "authorization": `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: body.messages, max_tokens: 2048, stream: false })
      });
    } else {
      const system = body.messages.filter(m => m.role === "system").map(m => m.content).join("\\n\\n");
      const contents = body.messages.filter(m => m.role !== "system").map(m => ({
        role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }]
      }));
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: { maxOutputTokens: 2048 }
        })
      });
    }
  } catch {
    // Delivery may have reached the provider; keep the reserved credit for manual reconciliation.
    return fail("模型連線結果不明，請聯絡站長核對本次額度。", 502);
  }
  if (!upstream.ok) {
    await env.DB.batch([
      env.DB.prepare("UPDATE players SET credits = credits + 1 WHERE id = ?").bind(user.id),
      env.DB.prepare("INSERT INTO ledger (id, player_id, delta, kind) VALUES (?, ?, 1, 'refund')")
        .bind("refund:" + id, user.id)
    ]);
    return fail("模型暫時無法回應，本次額度已退回。", 502);
  }
  let data;
  try { data = await upstream.json(); }
  catch { return fail("模型回應無法解析，請聯絡站長核對本次額度。", 502); }
  const answer = provider === "gemini"
    ? (data?.candidates?.[0]?.content?.parts || []).map(p => p?.text || "").join("")
    : data?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer) return fail("模型沒有傳回文字，請聯絡站長核對本次額度。", 502);
  const usage = provider === "gemini" ? data.usageMetadata : data.usage;
  const balance = await env.DB.prepare("SELECT credits FROM players WHERE id = ?").bind(user.id).first();
  return json({ text: answer, provider, model, usage: usage || null, credits: balance.credits });
}
export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return origin
      ? new Response(null, { status: 204, headers: cors(origin) }) : fail("來源不允許。", 403);
    try {
      const path = new URL(request.url).pathname;
      // Admin calls have no browser CORS access. Keep the admin token in a secret.
      if (path.startsWith("/admin/")) return await admin(request, env, path);
      if (!origin) return fail("來源不允許。", 403);
      const user = await player(request, env);
      const result = path === "/balance" && request.method === "GET"
        ? user?.enabled ? json({ label: user.label, credits: user.credits, calls_today: user.calls_today, day_utc: user.day_utc }) : fail("登入碼無效。", 401)
        : path === "/chat" && request.method === "POST" ? await chat(request, env, user) : fail("找不到路徑。", 404);
      return wrap(result, origin);
    } catch (error) {
      // Never log message bodies, login codes, or upstream responses.
      return wrap(fail(error instanceof SyntaxError ? "JSON 格式錯誤。" : error.message === "請求太長。" ? error.message : "請求處理失敗。", 400), origin);
    }
  }
};
