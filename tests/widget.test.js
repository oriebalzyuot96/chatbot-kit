import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SRC = readFileSync(new URL('../widget/chat-widget.js', import.meta.url), 'utf8');
const enc = new TextEncoder();

function sseResponse(events, { status = 200 } = {}) {
  const chunks = events.map((e) => enc.encode(`data: ${JSON.stringify(e)}\n\n`));
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader() {
        let i = 0;
        return { read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }) };
      }
    }
  };
}

function setup({ lang = 'en', fetchImpl } = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="${lang}"><body></body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  const calls = [];
  window.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return fetchImpl(url, init, calls.length);
  };
  window.eval(SRC);
  const el = window.document.createElement('orieb-chat');
  el.setAttribute('endpoint', 'https://example.test/v1/chat');
  window.document.body.append(el);
  const $ = (s) => el.shadowRoot.querySelector(s);
  const key = (target, k, opts = {}) =>
    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  return { window, el, $, calls, key };
}

async function waitFor(fn, ms = 1000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('waitFor timed out');
}

test('renders launcher, opens panel with accessible log and AI note', () => {
  const { $, el } = setup({ fetchImpl: async () => sseResponse([]) });
  assert.ok($('.launcher'));
  assert.equal($('.panel').hidden, true);
  $('.launcher').click();
  assert.equal($('.panel').hidden, false);
  assert.equal($('.launcher').getAttribute('aria-expanded'), 'true');
  assert.equal($('.log').getAttribute('role'), 'log');
  assert.equal($('.log').getAttribute('aria-live'), 'polite');
  assert.match($('.note').textContent, /AI-generated, may be wrong/);
  assert.equal($('.chips').children.length, 3);
  assert.equal(el.shadowRoot.activeElement, $('textarea'));
});

test('sends a message and streams the SSE answer', async () => {
  const { $, calls, key } = setup({
    fetchImpl: async () => sseResponse([{ delta: 'Hello ' }, { delta: 'there, see https://oriebalzyuot96.github.io.' }, { done: true }])
  });
  $('.launcher').click();
  $('textarea').value = 'Hi bot';
  key($('textarea'), 'Enter');
  await waitFor(() => $('.msg.assistant:last-child') && /there/.test($('.log').textContent));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { messages: [{ role: 'user', content: 'Hi bot' }], lang: 'en' });
  const last = [...$('.log').querySelectorAll('.msg.assistant')].pop();
  assert.equal(last.textContent, 'Hello there, see https://oriebalzyuot96.github.io.');
  const a = last.querySelector('a');
  assert.equal(a.href, 'https://oriebalzyuot96.github.io/');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer nofollow');
  assert.equal($('textarea').value, '');
  await waitFor(() => !$('.send').disabled);
});

test('Shift+Enter does not send; chips send their label', async () => {
  const { $, calls, key } = setup({ fetchImpl: async () => sseResponse([{ delta: 'ok' }, { done: true }]) });
  $('.launcher').click();
  $('textarea').value = 'line one';
  key($('textarea'), 'Enter', { shiftKey: true });
  assert.equal(calls.length, 0);
  $('.chip').click();
  await waitFor(() => calls.length === 1);
  assert.equal(calls[0].body.messages[0].content, 'What are his skills?');
  assert.equal($('.chips').hidden, true);
});

test('model text is never parsed as HTML; non-https links are not linked', async () => {
  const evil = '<script>window.pwned=1</script><img src=x onerror="window.pwned=2"> javascript:alert(1) http://insecure.test';
  const { $, window } = setup({ fetchImpl: async () => sseResponse([{ delta: evil }, { done: true }]) });
  $('.launcher').click();
  $('textarea').value = 'x';
  $('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => /pwned|script/.test($('.log').textContent));
  const bubble = [...$('.log').querySelectorAll('.msg.assistant')].pop();
  assert.equal(bubble.textContent, evil);
  assert.equal(bubble.querySelector('script'), null);
  assert.equal(bubble.querySelector('img'), null);
  assert.equal(bubble.querySelector('a'), null);
  assert.equal(window.pwned, undefined);
});

test('Escape closes the panel and returns focus to the launcher', () => {
  const { $, el, key } = setup({ fetchImpl: async () => sseResponse([]) });
  $('.launcher').click();
  key($('textarea'), 'Escape');
  assert.equal($('.panel').hidden, true);
  assert.equal($('.launcher').getAttribute('aria-expanded'), 'false');
  assert.equal(el.shadowRoot.activeElement, $('.launcher'));
});

test('Tab is trapped inside the open panel', () => {
  const { $, el, key } = setup({ fetchImpl: async () => sseResponse([]) });
  $('.launcher').click();
  $('.send').focus();
  key($('.send'), 'Tab');
  assert.equal(el.shadowRoot.activeElement, $('.close'));
  key($('.close'), 'Tab', { shiftKey: true });
  assert.equal(el.shadowRoot.activeElement, $('.send'));
});

test('error state shows a retry that resends the conversation', async () => {
  let n = 0;
  const { $, calls, window } = setup({
    fetchImpl: async () => (++n === 1 ? sseResponse([], { status: 500 }) : sseResponse([{ delta: 'recovered' }, { done: true }]))
  });
  $('.launcher').click();
  $('textarea').value = 'will fail';
  $('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => $('.error'));
  assert.equal($('.error').getAttribute('role'), 'alert');
  assert.match($('.error').textContent, /Something went wrong/);
  $('.retry').click();
  await waitFor(() => /recovered/.test($('.log').textContent));
  assert.equal($('.error'), null);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.messages, [{ role: 'user', content: 'will fail' }]);
});

test('Arabic: RTL and Arabic strings from document lang', () => {
  const { $, el } = setup({ lang: 'ar', fetchImpl: async () => sseResponse([]) });
  assert.equal($('.panel').getAttribute('dir'), 'rtl');
  assert.equal(el.getAttribute('dir'), 'rtl');
  assert.match($('.note').textContent, /الذكاء الاصطناعي/);
  assert.equal($('textarea').placeholder, 'اكتب سؤالك...');
});
