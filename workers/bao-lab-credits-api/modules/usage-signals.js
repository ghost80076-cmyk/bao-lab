import { json, fail, readJsonWithLimit } from "./http.js";

// Separate from account/billing records: no user, work, model or IP identifiers.
const WorkerUsageSignals = (() => {
  const initialized = new WeakMap();
  const events = ["started", "first_success", "first_failure", "five_turns"];
  const dailyLimit = 500;
  async function ensure(db) {
    if (!initialized.has(db)) {
      const task = db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS usage_signal_days (
          day TEXT PRIMARY KEY, batches INTEGER NOT NULL DEFAULT 0,
          started INTEGER NOT NULL DEFAULT 0, first_success INTEGER NOT NULL DEFAULT 0,
          first_failure INTEGER NOT NULL DEFAULT 0, five_turns INTEGER NOT NULL DEFAULT 0)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS usage_signal_receipts (
          day TEXT NOT NULL, token TEXT NOT NULL, PRIMARY KEY(day, token))`)
      ]).catch(error => { initialized.delete(db); throw error; });
      initialized.set(db, task);
    }
    await initialized.get(db);
  }
  function valid(body, day) {
    return body && Object.keys(body).sort().join(",") === "day,events,token,v"
      && body.v === 1 && body.day === day
      && typeof body.token === "string" && /^[a-f0-9]{32}$/.test(body.token)
      && Array.isArray(body.events) && body.events.length > 0 && body.events.length <= 4
      && new Set(body.events).size === body.events.length
      && body.events.every(event => events.includes(event));
  }
  async function collect(request, env, db) {
    if (String(env.USAGE_SIGNALS_DISABLED || "") === "true") return new Response(null, {status:204});
    // Public anonymous endpoint; cookies and authorization are never needed.
    if (!request.headers.get("origin") || request.headers.has("authorization") || request.headers.has("cookie")) return fail("signal_credentials_not_allowed", 400);
    let body;
    try { body = await readJsonWithLimit(request, 512); }
    catch { return fail("invalid_signal", 400); }
    const day = new Date().toISOString().slice(0, 10);
    if (!valid(body, day)) return fail("invalid_signal", 400);
    await ensure(db);
    const before = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const values = events.map(event => Number(body.events.includes(event)));
    // D1 batch is transactional. changes() connects receipt insertion to counting,
    // so a duplicate or a full daily budget cannot increment the totals.
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO usage_signal_days(day) VALUES (?)").bind(day),
      db.prepare(`INSERT OR IGNORE INTO usage_signal_receipts(day,token)
        SELECT ?,? WHERE (SELECT batches FROM usage_signal_days WHERE day=?) < ?`).bind(day, body.token, day, dailyLimit),
      db.prepare(`UPDATE usage_signal_days SET batches=batches+1,
        started=started+?,first_success=first_success+?,first_failure=first_failure+?,five_turns=five_turns+?
        WHERE day=? AND changes()=1`).bind(...values, day),
      db.prepare("DELETE FROM usage_signal_receipts WHERE day < ?").bind(before(1)),
      db.prepare("DELETE FROM usage_signal_days WHERE day < ?").bind(before(29))
    ]);
    return new Response(null, {status:204});
  }
  async function report(db, env) {
    await ensure(db);
    const since = new Date(Date.now() - 29 * 86400000).toISOString().slice(0,10);
    const result = await db.prepare("SELECT day,batches,started,first_success,first_failure,five_turns FROM usage_signal_days WHERE day >= ? ORDER BY day DESC LIMIT 30").bind(since).all();
    return json({schema_version:1, enabled:String(env.USAGE_SIGNALS_DISABLED || "") !== "true",
      daily_batch_limit:dailyLimit, timezone:"UTC", rows:result.results || []});
  }
  return Object.freeze({ collect, report, valid });
})();

export { WorkerUsageSignals };
