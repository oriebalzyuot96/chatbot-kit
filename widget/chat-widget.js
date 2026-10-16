/*!
 * <orieb-chat> - dependency-free chat widget (vanilla web component, Shadow DOM).
 * Usage: <script type="module" src="chat-widget.js"></script>
 *        <orieb-chat endpoint="https://your-backend/v1/chat"></orieb-chat>
 * MIT License, Orieb Alzyuot 2026
 */
(() => {
  if (typeof customElements === 'undefined' || customElements.get('orieb-chat')) return;

  const STRINGS = {
    en: {
      title: 'Ask about Orieb',
      subtitle: 'Portfolio assistant',
      open: 'Open chat',
      close: 'Close chat',
      placeholder: 'Type your question...',
      send: 'Send',
      note: 'AI-generated, may be wrong. Please verify important details.',
      welcome: 'Hi! I can answer questions about Orieb’s skills, projects and CV.',
      typing: 'Assistant is typing',
      error: 'Something went wrong. Please try again.',
      rateLimited: 'Too many requests right now. Please wait a bit and try again.',
      retry: 'Retry',
      you: 'You',
      assistant: 'Assistant',
      chips: ['What are his skills?', 'Tell me about his projects', 'Where can I find his CV?']
    },
    ar: {
      title: 'اسأل عن أوريب',
      subtitle: 'مساعد الموقع',
      open: 'فتح المحادثة',
      close: 'إغلاق المحادثة',
      placeholder: 'اكتب سؤالك...',
      send: 'إرسال',
      note: 'ردود مولّدة بالذكاء الاصطناعي وقد تكون خاطئة. يرجى التحقق من التفاصيل المهمة.',
      welcome: 'مرحباً! يمكنني الإجابة عن مهارات أوريب ومشاريعه وسيرته الذاتية.',
      typing: 'المساعد يكتب',
      error: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
      rateLimited: 'هناك طلبات كثيرة حالياً. يرجى الانتظار قليلاً ثم المحاولة.',
      retry: 'إعادة المحاولة',
      you: 'أنت',
      assistant: 'المساعد',
      chips: [
        'ما هي مهاراته؟',
        'ما هي أبرز مشاريعه؟',
        'أين أجد سيرته الذاتية؟'
      ]
    }
  };

  const MAX_CHARS = 1500;
  const MAX_HISTORY = 12;

  const CSS = `
    :host {
      --_accent: var(--orieb-accent, #2457d6);
      --_accent-fg: var(--orieb-accent-fg, #ffffff);
      --_bg: var(--orieb-bg, #ffffff);
      --_fg: var(--orieb-fg, #16181d);
      --_muted: var(--orieb-muted, #5b6270);
      --_surface: var(--orieb-surface, #f1f3f7);
      --_user-bg: var(--orieb-user-bg, var(--_accent));
      --_user-fg: var(--orieb-user-fg, var(--_accent-fg));
      --_border: var(--orieb-border, #d9dde5);
      --_danger: var(--orieb-danger, #b3261e);
      --_radius: var(--orieb-radius, 16px);
      --_font: var(--orieb-font, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif);
      --_shadow: 0 12px 40px rgba(0, 0, 0, .22);
      position: fixed;
      inset-block-end: var(--orieb-offset-y, 20px);
      inset-inline-end: var(--orieb-offset-x, 20px);
      z-index: var(--orieb-z, 2147483000);
      font-family: var(--_font);
      color: var(--_fg);
      line-height: 1.5;
      font-size: 15px;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --_accent: var(--orieb-accent, #7aa2ff);
        --_accent-fg: var(--orieb-accent-fg, #0b1020);
        --_bg: var(--orieb-bg, #171a21);
        --_fg: var(--orieb-fg, #eceef3);
        --_muted: var(--orieb-muted, #9aa3b5);
        --_surface: var(--orieb-surface, #232733);
        --_border: var(--orieb-border, #333948);
        --_danger: var(--orieb-danger, #ff8a80);
        --_shadow: 0 12px 40px rgba(0, 0, 0, .6);
      }
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button, textarea { font: inherit; color: inherit; }
    :focus-visible { outline: 3px solid var(--_accent); outline-offset: 2px; }

    .launcher {
      display: grid; place-items: center;
      width: 56px; height: 56px; border-radius: 50%;
      border: 0; cursor: pointer;
      background: var(--_accent); color: var(--_accent-fg);
      box-shadow: var(--_shadow);
      transition: transform .15s ease;
    }
    .launcher:hover { transform: scale(1.06); }
    .launcher svg { width: 26px; height: 26px; fill: currentColor; }

    .panel {
      position: absolute; inset-block-end: 70px; inset-inline-end: 0;
      width: min(380px, calc(100vw - 24px));
      height: min(560px, calc(100vh - 110px));
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--_bg); color: var(--_fg);
      border: 1px solid var(--_border); border-radius: var(--_radius);
      box-shadow: var(--_shadow);
      animation: pop .18s ease-out;
    }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }

    header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 14px; background: var(--_accent); color: var(--_accent-fg);
    }
    h2 { margin: 0; font-size: 16px; font-weight: 650; }
    .sub { margin: 0; font-size: 12px; opacity: .85; }
    .close {
      border: 0; background: transparent; cursor: pointer; border-radius: 8px;
      width: 36px; height: 36px; display: grid; place-items: center; color: inherit;
    }
    .close:hover { background: rgba(255, 255, 255, .18); }
    .close svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2.2; stroke-linecap: round; }
    header :focus-visible { outline-color: var(--_accent-fg); }

    .log {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth; overscroll-behavior: contain;
    }
    .msg {
      max-width: 88%; padding: 9px 12px; border-radius: 14px;
      white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
    }
    .msg.assistant { align-self: flex-start; background: var(--_surface); border-end-start-radius: 4px; }
    .msg.user { align-self: flex-end; background: var(--_user-bg); color: var(--_user-fg); border-end-end-radius: 4px; }
    .msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

    .typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px 14px; background: var(--_surface); border-radius: 14px; }
    .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--_muted); animation: blink 1.2s infinite ease-in-out; }
    .typing i:nth-child(2) { animation-delay: .15s; }
    .typing i:nth-child(3) { animation-delay: .3s; }
    @keyframes blink { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

    .error {
      align-self: stretch; display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 9px 12px; border-radius: 12px; border: 1px solid var(--_danger); color: var(--_danger);
      background: transparent;
    }
    .retry {
      flex: none; cursor: pointer; padding: 5px 12px; border-radius: 999px;
      border: 1px solid currentColor; background: transparent; color: inherit; font-weight: 600;
    }

    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
    .chip {
      cursor: pointer; padding: 6px 12px; border-radius: 999px; font-size: 13px;
      border: 1px solid var(--_border); background: var(--_bg); color: var(--_fg);
    }
    .chip:hover { background: var(--_surface); }

    form { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--_border); }
    textarea {
      flex: 1; resize: none; max-height: 120px; min-height: 40px;
      padding: 9px 12px; border-radius: 12px; border: 1px solid var(--_border);
      background: var(--_bg); color: var(--_fg);
    }
    .send {
      flex: none; height: 40px; padding: 0 16px; border: 0; border-radius: 12px; cursor: pointer;
      background: var(--_accent); color: var(--_accent-fg); font-weight: 650;
    }
    .send:disabled { opacity: .5; cursor: not-allowed; }
    .note { margin: 0; padding: 0 14px 10px; font-size: 11.5px; color: var(--_muted); text-align: center; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    @media (max-width: 480px) {
      :host { inset-block-end: 12px; inset-inline-end: 12px; }
      .panel { position: fixed; inset: 8px; width: auto; height: auto; }
      .launcher[aria-expanded="true"] { visibility: hidden; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }
  `;

  const TEMPLATE = `
    <style>${CSS}</style>
    <button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>
    </button>
    <section class="panel" role="dialog" aria-modal="true" aria-labelledby="ttl" hidden>
      <header>
        <div><h2 id="ttl"></h2><p class="sub"></p></div>
        <button class="close" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
      </header>
      <div class="log" role="log" aria-live="polite" aria-relevant="additions text" tabindex="0"></div>
      <div class="chips"></div>
      <form>
        <textarea rows="1" maxlength="${MAX_CHARS}" autocomplete="off"></textarea>
        <button class="send" type="submit"></button>
      </form>
      <p class="note"></p>
    </section>
  `;

  const URL_RE = /https:\/\/[^\s<>"'`]+/g;
  const TRAILING = /[.,;:!?)\]}،؛؟]+$/;

  /** Renders text into el using text nodes; only valid https URLs become links. */
  function renderText(el, text) {
    el.textContent = '';
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      let url = m[0];
      const trail = url.match(TRAILING);
      if (trail) url = url.slice(0, -trail[0].length);
      let safe = null;
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && u.hostname) safe = u.href;
      } catch { /* not a URL */ }
      if (!safe) continue;
      if (m.index > last) el.append(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = safe;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.textContent = url;
      el.append(a);
      last = m.index + url.length;
    }
    if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  }

  class OriebChat extends HTMLElement {
    static get observedAttributes() { return ['lang', 'title']; }

    constructor() {
      super();
      this._history = [];
      this._busy = false;
      this._welcomed = false;
      this._ac = null;
      this._partial = null;
      this.attachShadow({ mode: 'open' });
      // Static, constant markup only (no model or user text goes through innerHTML).
      this.shadowRoot.innerHTML = TEMPLATE;
      const $ = (s) => this.shadowRoot.querySelector(s);
      this._launcher = $('.launcher');
      this._panel = $('.panel');
      this._title = $('h2');
      this._sub = $('.sub');
      this._close = $('.close');
      this._log = $('.log');
      this._chips = $('.chips');
      this._form = $('form');
      this._input = $('textarea');
      this._sendBtn = $('.send');
      this._note = $('.note');

      this._launcher.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
      this._close.addEventListener('click', () => this.close());
      this._form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._submit();
      });
      this._input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this._submit();
        }
      });
      this._input.addEventListener('input', () => this._autosize());
      this._panel.addEventListener('keydown', (e) => this._onKeydown(e));
    }

    connectedCallback() {
      this._applyLang();
    }

    disconnectedCallback() {
      this._ac?.abort();
    }

    attributeChangedCallback() {
      if (this.isConnected) this._applyLang();
    }

    get isOpen() { return !this._panel.hidden; }

    get _lang() {
      const raw = this.getAttribute('lang') || document.documentElement.lang || 'en';
      return raw.toLowerCase().startsWith('ar') ? 'ar' : 'en';
    }

    get _t() { return STRINGS[this._lang]; }

    _applyLang() {
      const t = this._t;
      const rtl = this._lang === 'ar';
      this.shadowRoot.host.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      this._panel.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      this._title.textContent = this.getAttribute('title') || t.title;
      this._sub.textContent = t.subtitle;
      this._launcher.setAttribute('aria-label', t.open);
      this._close.setAttribute('aria-label', t.close);
      this._input.placeholder = t.placeholder;
      this._input.setAttribute('aria-label', t.placeholder);
      this._sendBtn.textContent = t.send;
      this._note.textContent = t.note;
      this._log.setAttribute('aria-label', t.assistant);
      this._chips.textContent = '';
      for (const label of t.chips) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = label;
        b.addEventListener('click', () => this._submit(label));
        this._chips.append(b);
      }
      this._chips.hidden = this._history.length > 0;
      if (this._welcomeEl) renderText(this._welcomeEl, t.welcome);
    }

    open() {
      if (this.isOpen) return;
      this._panel.hidden = false;
      this._launcher.setAttribute('aria-expanded', 'true');
      if (!this._welcomed) {
        this._welcomed = true;
        this._welcomeEl = this._addMsg('assistant', this._t.welcome);
      }
      this._input.focus();
      this.dispatchEvent(new CustomEvent('orieb-chat:open'));
    }

    close() {
      if (!this.isOpen) return;
      this._panel.hidden = true;
      this._launcher.setAttribute('aria-expanded', 'false');
      this._launcher.focus();
      this.dispatchEvent(new CustomEvent('orieb-chat:close'));
    }

    _onKeydown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = [...this._panel.querySelectorAll('button, textarea, a[href], [tabindex="0"]')].filter(
        (n) => !n.disabled && !n.closest('[hidden]')
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = this.shadowRoot.activeElement;
      if (e.shiftKey && (active === first || !active)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !active)) {
        e.preventDefault();
        first.focus();
      }
    }

    _autosize() {
      this._input.style.height = 'auto';
      this._input.style.height = `${Math.min(this._input.scrollHeight, 120)}px`;
    }

    _scroll() {
      this._log.scrollTop = this._log.scrollHeight;
    }

    _addMsg(role, text) {
      const el = document.createElement('div');
      el.className = `msg ${role}`;
      renderText(el, text);
      this._log.append(el);
      this._scroll();
      return el;
    }

    _addTyping() {
      const el = document.createElement('div');
      el.className = 'typing';
      for (let i = 0; i < 3; i++) el.append(document.createElement('i'));
      const sr = document.createElement('span');
      sr.className = 'sr';
      sr.textContent = this._t.typing;
      el.append(sr);
      this._log.append(el);
      this._scroll();
      return el;
    }

    _setBusy(b) {
      this._busy = b;
      this._sendBtn.disabled = b;
      this._log.setAttribute('aria-busy', String(b));
    }

    _submit(text) {
      const value = (text ?? this._input.value).trim().slice(0, MAX_CHARS);
      if (!value || this._busy) return;
      this._clearError();
      if (text === undefined) {
        this._input.value = '';
        this._autosize();
      }
      this._history.push({ role: 'user', content: value });
      this._chips.hidden = true;
      this._addMsg('user', value);
      return this._request();
    }

    _clearError() {
      this._errorEl?.remove();
      this._errorEl = null;
      this._partial?.remove();
      this._partial = null;
    }

    _showError(message) {
      const box = document.createElement('div');
      box.className = 'error';
      box.setAttribute('role', 'alert');
      const span = document.createElement('span');
      span.textContent = message;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'retry';
      btn.textContent = this._t.retry;
      btn.addEventListener('click', () => {
        if (this._busy) return;
        this._clearError();
        this._request();
      });
      box.append(span, btn);
      this._log.append(box);
      this._errorEl = box;
      this._scroll();
      btn.focus();
    }

    async _request() {
      const endpoint = this.getAttribute('endpoint');
      this._setBusy(true);
      const typing = this._addTyping();
      let bubble = null;
      let acc = '';
      const ac = new AbortController();
      this._ac = ac;
      try {
        if (!endpoint) throw new Error('missing endpoint');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ messages: this._history.slice(-MAX_HISTORY), lang: this._lang }),
          signal: ac.signal
        });
        if (!res.ok || !res.body) {
          const err = new Error(`http ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        let finished = false;
        const handle = (block) => {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (typeof ev.delta === 'string' && ev.delta) {
              if (!bubble) {
                typing.remove();
                bubble = this._addMsg('assistant', '');
              }
              acc += ev.delta;
              renderText(bubble, acc);
              this._scroll();
            } else if (ev.error) {
              throw new Error('stream error');
            } else if (ev.done) {
              finished = true;
            }
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            handle(buf.slice(0, i));
            buf = buf.slice(i + 2);
          }
        }
        if (buf.trim()) handle(buf);
        if (!acc || !finished) throw new Error('incomplete response');
        this._history.push({ role: 'assistant', content: acc });
      } catch (err) {
        typing.remove();
        if (ac.signal.aborted) return;
        this._partial = bubble;
        this._showError(err.status === 429 ? this._t.rateLimited : this._t.error);
      } finally {
        typing.remove();
        if (this._ac === ac) this._ac = null;
        this._setBusy(false);
      }
    }
  }

  customElements.define('orieb-chat', OriebChat);
})();
