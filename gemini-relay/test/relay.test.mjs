import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
const { createHandler } = await import('../server.js');

test('relay authenticates and sends only its own headers to Gemini', async () => {
  const calls = [];
  const server = http.createServer(createHandler({ token: 'relay-secret', apiKey: 'server-only-key',
    allowedModels: ['gemini-test'], upstreamFetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
    } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { model: 'gemini-test', payload: { contents: [{ role: 'user', parts: [{ text: 'private story' }] }],
    generationConfig: { maxOutputTokens: 128 } } };
  try {
    assert.equal((await fetch(base + '/generate', { method: 'POST', body: JSON.stringify(payload) })).status, 401);
    assert.equal(calls.length, 0);
    const result = await fetch(base + '/generate', { method: 'POST', headers: {
      authorization: 'Bearer relay-secret', 'cf-connecting-ip': '203.0.113.9',
      'x-real-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9', 'origin': 'https://player.test',
      'user-agent': 'player-agent', 'content-type': 'application/json'
    }, body: JSON.stringify(payload) });
    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.deepEqual(calls[0].init.headers, { 'content-type': 'application/json', 'x-goog-api-key': 'server-only-key' });
    assert.equal(JSON.parse(calls[0].init.body).contents[0].parts[0].text, 'private story');
  } finally { server.close(); }
});

test('relay strips Google error messages containing private content', async () => {
  const server = http.createServer(createHandler({ token: 'relay-secret', apiKey: 'server-only-key',
    allowedModels: ['gemini-test'], upstreamFetch: async () => Response.json({ error: {
      status: 'FAILED_PRECONDITION', message: 'private story, server-only-key, visitor IP' } }, { status: 400 }) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/generate`, { method: 'POST',
      headers: { authorization: 'Bearer relay-secret' }, body: JSON.stringify({ model: 'gemini-test',
        payload: { contents: [{ role: 'user', parts: [{ text: 'private story' }] }],
          generationConfig: { maxOutputTokens: 128 } } }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { status: 'FAILED_PRECONDITION' } });
  } finally { server.close(); }
});
