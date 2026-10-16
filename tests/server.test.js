import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createChatServer } from '../server/app.js';

const TEST_KEY = 'test-key-not-real';
const servers = [];

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}
after(() => servers.forEach((s) => s.close()));

/** Fake Anthropic API. Records the last request. */
async function fakeAnthropic({ status = 200 } = {}) {
  const seen = { calls: 0 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.calls++;
      seen.url = req.url;
      seen.headers = req.headers;
      seen.body = JSON.parse(body);
      if (status !== 200) {
        res.writeHead(status, { 'content-type': 'application/json' });
        return res.end('{"error":"boom"}');
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: {} });
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Orieb is ' } });
      ev('ping', {});
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'a front-end engineer.' } });
      ev('message_stop', {});
      res.end();
    });
  });
  const url = await listen(server);
  return { url, seen };
}

async function chatServer(env = {}) {
  const logs = [];
  const server = createChatServer({
    env: { FALLBACK_DELAY_MS: '0', ...env },
    log: (l) => logs.push(l)
  });
  return { url: await listen(server), logs };
}

function post(url, body, headers = {}) {
  return fetch(`${url}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

async function readSse(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('data:'))
    .map((b) => JSON.parse(b.slice(5)));
}

const ask = (content, lang = 'en') => ({ messages: [{ role: 'user', content }], lang });

test('streamed answer path forwards model deltas', async () => {
  const fake = await fakeAnthropic();
  const { url, logs } = await chatServer({ ANTHROPIC_API_KEY: TEST_KEY, ANTHROPIC_BASE_URL: fake.url });
  const res = await post(url, ask('What does Orieb do? secret-question-text'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = await readSse(res);
  assert.equal(events.filter((e) => e.delta).map((e) => e.delta).join(''), 'Orieb is a front-end engineer.');
  assert.deepEqual(events.at(-1), { done: true });

  assert.equal(fake.seen.url, '/v1/messages');
  assert.equal(fake.seen.headers['x-api-key'], TEST_KEY);
  assert.equal(fake.seen.headers['anthropic-version'], '2023-06-01');
  assert.equal(fake.seen.body.stream, true);
  assert.equal(fake.seen.body.max_tokens, 600);
  assert.equal(fake.seen.body.model, 'claude-haiku-5-5');
  assert.match(fake.seen.body.system, /Orieb Alzyuot/);
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !l.includes('secret-question-text') && !l.includes(TEST_KEY)));
});

test('falls back to the local matcher when no API key is set', async () => {
  const { url } = await chatServer();
  const events = await readSse(await post(url, ask('Where can I find the CV?')));
  const text = events.filter((e) => e.delta).map((e) => e.delta).join('');
  assert.match(text, /Orieb-Alzyuot-CV\.pdf/);
  assert.deepEqual(events.at(-1), { done: true });
});

test('fallback answers in Arabic and says it does not know otherwise', async () => {
  const { url } = await chatServer();
  const ar = await readSse(await post(url, ask('ما هي مهاراته؟', 'ar')));
  assert.match(ar.map((e) => e.delta ?? '').join(''), /Angular/);
  const unk = await readSse(await post(url, ask('What is his favourite colour?')));
  assert.match(unk.map((e) => e.delta ?? '').join(''), /do not know/);
});

test('falls back when the upstream call fails', async () => {
  const fake = await fakeAnthropic({ status: 500 });
  const { url } = await chatServer({ ANTHROPIC_API_KEY: TEST_KEY, ANTHROPIC_BASE_URL: fake.url });
  const events = await readSse(await post(url, ask('Tell me about the CV')));
  assert.equal(fake.seen.calls, 1);
  assert.match(events.map((e) => e.delta ?? '').join(''), /CV/);
  assert.deepEqual(events.at(-1), { done: true });
});

test('rate limit returns 429', async () => {
  const { url } = await chatServer({ RATE_LIMIT_MAX: '3' });
  for (let i = 0; i < 3; i++) assert.equal((await post(url, ask('hi'))).status, 200);
  const res = await post(url, ask('hi'));
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get('retry-after')) > 0);
});

test('oversize body returns 413', async () => {
  const { url } = await chatServer();
  const res = await post(url, JSON.stringify({ messages: [], pad: 'x'.repeat(9000) }));
  assert.equal(res.status, 413);
});

test('disallowed origin gets no CORS header; allowed origin does', async () => {
  const { url } = await chatServer();
  const bad = await post(url, ask('hi'), { origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  for (const origin of ['https://oriebalzyuot96.github.io', 'http://localhost:5173']) {
    const ok = await post(url, ask('hi'), { origin });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), origin);
    await ok.text();
  }
  const pre = await fetch(`${url}/v1/chat`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
  assert.equal(pre.status, 204);
});

test('bad JSON and invalid payloads return 400', async () => {
  const { url } = await chatServer();
  assert.equal((await post(url, '{not json')).status, 400);
  assert.equal((await post(url, { messages: [] })).status, 400);
  assert.equal((await post(url, { messages: [{ role: 'system', content: 'x' }] })).status, 400);
  assert.equal((await post(url, ask('x'.repeat(1501)))).status, 400);
  const many = Array.from({ length: 13 }, () => ({ role: 'user', content: 'a' }));
  assert.equal((await post(url, { messages: many })).status, 400);
});

test('control characters are stripped before reaching the model', async () => {
  const fake = await fakeAnthropic();
  const { url } = await chatServer({ ANTHROPIC_API_KEY: TEST_KEY, ANTHROPIC_BASE_URL: fake.url });
  await (await post(url, ask('he\u0000llo\u0007 wor\u001bld'))).text();
  assert.equal(fake.seen.body.messages.at(-1).content, 'hello world');
});

test('GET /health and unknown routes', async () => {
  const { url } = await chatServer();
  const h = await fetch(`${url}/health`);
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { ok: true });
  assert.equal((await fetch(`${url}/nope`)).status, 404);
});
