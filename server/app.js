import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fallbackAnswer, chunkText } from './fallback.js';
import { buildSystemPrompt, streamAnthropic } from './llm.js';

const PROFILE_PATH = fileURLToPath(new URL('../knowledge/profile.json', import.meta.url));

export const LIMITS = {
  bodyBytes: 8 * 1024,
  maxMessages: 12,
  maxChars: 1500
};

const DEFAULT_ORIGINS = 'https://oriebalzyuot96.github.io,http://localhost:*';

// Removes control characters except tab and newline.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function originMatcher(list) {
  const rules = list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`));
  return (origin) => rules.some((r) => r.test(origin));
}

function sleep(ms) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

class BadRequest extends Error {}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequest('body must be an object');
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length < 1) throw new BadRequest('messages required');
  if (messages.length > LIMITS.maxMessages) throw new BadRequest('too many messages');
  const clean = messages.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      throw new BadRequest('invalid message');
    }
    if (m.content.length > LIMITS.maxChars) throw new BadRequest('message too long');
    const content = m.content.replace(CONTROL, '').trim();
    if (!content) throw new BadRequest('empty message');
    return { role: m.role, content };
  });
  if (clean[clean.length - 1].role !== 'user') throw new BadRequest('last message must be from user');
  return { messages: clean, lang: body.lang === 'ar' ? 'ar' : 'en' };
}

/**
 * Creates the HTTP server. `env` and `log` are injectable for tests.
 * ANTHROPIC_BASE_URL exists only for tests/dev (fake upstream).
 */
export function createChatServer({ env = process.env, log = console.log, profile } = {}) {
  const prof = profile ?? JSON.parse(readFileSync(PROFILE_PATH, 'utf8'));
  const system = buildSystemPrompt(prof);
  const originAllowed = originMatcher(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS);
  const rateMax = Number(env.RATE_LIMIT_MAX) || 20;
  const rateWindow = Number(env.RATE_WINDOW_MS) || 10 * 60 * 1000;
  const trustProxy = env.TRUST_PROXY === 'true';
  const fallbackDelay = env.FALLBACK_DELAY_MS === undefined ? 20 : Number(env.FALLBACK_DELAY_MS);
  const hits = new Map(); // ip -> timestamps

  const sweep = setInterval(() => {
    const cutoff = Date.now() - rateWindow;
    for (const [ip, ts] of hits) {
      if (ts[ts.length - 1] < cutoff) hits.delete(ip);
    }
  }, 60_000);
  sweep.unref();

  function clientIp(req) {
    if (trustProxy) {
      const xff = req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
  }

  function limited(ip) {
    const now = Date.now();
    const ts = (hits.get(ip) ?? []).filter((t) => t > now - rateWindow);
    if (ts.length >= rateMax) {
      hits.set(ip, ts);
      return Math.max(1, Math.ceil((ts[0] + rateWindow - now) / 1000));
    }
    ts.push(now);
    hits.set(ip, ts);
    return 0;
  }

  function json(res, status, obj, extra = {}) {
    const payload = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      ...extra
    });
    res.end(payload);
  }

  function readBody(req, res) {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length']);
      if (declared > LIMITS.bodyBytes) {
        json(res, 413, { error: 'payload too large' }, { Connection: 'close' });
        req.resume();
        return resolve(null);
      }
      const chunks = [];
      let size = 0;
      let over = false;
      req.on('data', (c) => {
        if (over) return;
        size += c.length;
        if (size > LIMITS.bodyBytes) {
          over = true;
          chunks.length = 0;
          json(res, 413, { error: 'payload too large' }, { Connection: 'close' });
          resolve(null);
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => !over && resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function* answer(parsed, signal) {
    const apiKey = env.ANTHROPIC_API_KEY;
    let produced = false;
    if (apiKey) {
      try {
        const upstream = streamAnthropic({
          apiKey,
          baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
          model: env.CHAT_MODEL || 'claude-haiku-5-5',
          system,
          messages: parsed.messages,
          signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        });
        for await (const d of upstream) {
          produced = true;
          yield d;
        }
        if (produced) return;
      } catch {
        if (produced || signal.aborted) return; // partial answer already sent; do not mix in fallback
      }
    }
    const q = parsed.messages[parsed.messages.length - 1].content;
    for (const piece of chunkText(fallbackAnswer(prof, q, parsed.lang))) {
      yield piece;
      await sleep(fallbackDelay);
    }
  }

  async function handleChat(req, res) {
    const retry = limited(clientIp(req));
    if (retry) return json(res, 429, { error: 'rate limit exceeded' }, { 'Retry-After': String(retry) });

    const raw = await readBody(req, res);
    if (raw === null) return; // 413 already sent

    let parsed;
    try {
      parsed = validate(JSON.parse(raw));
    } catch (e) {
      return json(res, 400, { error: e instanceof BadRequest ? e.message : 'invalid JSON' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive'
    });
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    try {
      for await (const delta of answer(parsed, ac.signal)) {
        if (ac.signal.aborted) return;
        send({ delta });
      }
      send({ done: true });
    } catch {
      send({ error: 'internal error' });
    }
    res.end();
  }

  return http.createServer(async (req, res) => {
    const t0 = performance.now();
    const path = (req.url ?? '/').split('?')[0];
    res.on('finish', () => {
      // Status and timing only. Never log bodies, headers or message content.
      log(`${req.method} ${path} ${res.statusCode} ${Math.round(performance.now() - t0)}ms`);
    });
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const origin = req.headers.origin;
    if (origin) {
      if (!originAllowed(origin)) return json(res, 403, { error: 'origin not allowed' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600'
        });
        return res.end();
      }
      if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true });
      if (path === '/v1/chat') {
        if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' }, { Allow: 'POST, OPTIONS' });
        return await handleChat(req, res);
      }
      return json(res, 404, { error: 'not found' });
    } catch {
      if (!res.headersSent) json(res, 500, { error: 'internal error' });
      else res.end();
    }
  });
}
