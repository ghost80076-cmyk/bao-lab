const assert = require('node:assert/strict');
const local = require('../js/lm-studio-core.js');

(async () => {
  const endpoint = local.endpoint('http://localhost:1234/v1/chat/completions');
  assert.equal(endpoint.modelsUrl, 'http://localhost:1234/v1/models');
  assert.equal(local.endpoint('http://127.0.0.1:1234/v1/').chatUrl, 'http://127.0.0.1:1234/v1/chat/completions');
  for (const url of [
    'https://localhost:1234/v1', 'http://192.168.1.100:1234/v1',
    'http://evil.example/v1', 'http://localhost.evil.example:1234/v1',
    'http://localhost:1234/v1?key=secret', 'http://user:password@localhost:1234/v1',
    'http://localhost:1234/v1/../../admin', 'http://localhost:1234/other',
    'http://localhost:1234/v1#fragment'
  ]) assert.throws(() => local.endpoint(url), /本機|格式/);
  assert.equal(local.isLocal({ type: 'lmstudio' }), true);
  assert.equal(local.isLocal({ type: 'openrouter' }), false);
  const calls = [];
  const response = (data, ok = true, status = 200) => ({
    ok, status, headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(data), json: async () => data
  });
  const fetchMock = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/models')) return response({ data: [{ id: 'gemma4-26b-a4b' }, { id: 'other-model' }] });
    return response({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 10 } });
  };
  const api = {
    activeSignal: null,
    readJSON: async res => JSON.parse(await res.text()),
    contentToText: value => String(value || ''),
    normalizeUsage: usage => usage,
    isEventStream: res => res.headers.get('content-type') === 'text/event-stream',
    readOpenAIStream: async () => ({ text: 'streamed', usage: {} })
  };
  const config = { type: 'lmstudio', baseUrl: 'http://localhost:1234/v1', key: local.NO_AUTH, model: 'gemma4-26b-a4b' };
  assert.deepEqual(await local.listModels(config, fetchMock), ['gemma4-26b-a4b', 'other-model']);
  const result = await local.send(config, [{ role: 'user', content: 'Hi' }], api, fetchMock);
  assert.equal(result.text, 'OK');
  assert.equal(result.usage.total_tokens, 10);
  assert.equal(calls[1].url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(calls[1].init.headers.Authorization, undefined, 'Never send synthetic key to localhost');
  assert.deepEqual(JSON.parse(calls[1].init.body).messages, [{ role: 'user', content: 'Hi' }]);
  await local.send({ ...config, key: 'local-token' }, [], api, fetchMock);
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer local-token');
  const prior = calls.length;
  await assert.rejects(local.send({ ...config, baseUrl: 'http://attacker.invalid/v1' }, [], api, fetchMock), /本機/);
  assert.equal(calls.length, prior, 'Reject remote hosts before network request');
  assert.throws(() => local.endpoint('http://localhost:1234/v1/../v1/'), /本機|格式/);
  await assert.rejects(local.send({ ...config, model: '' }, [], api, fetchMock), /Model ID/);
  await assert.rejects(local.send(config, [], api, async () => { throw Error('Failed to fetch'); }), /CORS/);
  await assert.rejects(local.send(config, [], api, async () => { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }), error => error.code === 'BAO_ABORTED');
  await assert.rejects(local.send(config, [], api, async () => response({ error: { message: 'Model not loaded' } }, false, 404)), /404.*Model not loaded/);
  const streamed = await local.send({ ...config, stream: true, onDelta() {} }, [], api, async (url, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    return { ok: true, headers: { get: () => 'text/event-stream' } };
  });
  assert.equal(streamed.text, 'streamed');
  console.log('LM Studio local core: loopback-only, model listing, no cloud key, optional auth, errors, abort and streaming PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
