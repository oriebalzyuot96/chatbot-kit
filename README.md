# chatbot-kit

A reusable website chatbot: a small dependency-free Node backend (SSE streaming) and a vanilla web component widget. Built for https://oriebalzyuot96.github.io (English and Arabic), but the profile is just a JSON file.

## Architecture

```
browser  <orieb-chat>  --POST /v1/chat (JSON)-->  server/ (node:http)
                       <--- SSE: {delta}... {done} ---   |
                                                         +-- ANTHROPIC_API_KEY set? --> Anthropic Messages API (stream)
                                                         +-- no key / upstream fails --> local keyword matcher
                                                                                         (same knowledge/profile.json)
```

- `server/` - `app.js` (routing, CORS, limits, SSE), `llm.js` (system prompt + Anthropic stream parser), `fallback.js` (offline matcher), `index.js` (entry).
- `knowledge/profile.json` - the only source of facts. Edit it to change what the bot knows.
- `widget/chat-widget.js` - single file, no dependencies, Shadow DOM.
- `tests/` - `node:test`; the Anthropic API is replaced by a local fake server, no real network.

## Run locally

```
npm install
npm run dev        # port 8787; reads .env if present
npm test
```

Without `ANTHROPIC_API_KEY` the server answers from the local matcher, so the widget works offline. Open `widget/demo.html` through any static server (for example `npx serve .` then `/widget/demo.html`).

## Environment variables

| Name | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Secret. Set it in the Render dashboard, never in git. |
| `CHAT_MODEL` | `claude-haiku-5-5` | Model id sent to the Messages API. |
| `ALLOWED_ORIGINS` | `https://oriebalzyuot96.github.io,http://localhost:*` | Comma-separated; `*` is a wildcard. |
| `PORT` | `8787` | Render sets this itself. |
| `TRUST_PROXY` | unset | `true` on Render so the rate limit uses `X-Forwarded-For`. |
| `RATE_LIMIT_MAX` / `RATE_WINDOW_MS` | `20` / `600000` | Per IP, in memory. |
| `ANTHROPIC_BASE_URL` | unset | Tests/dev only (fake upstream). Do not set in production. |

## Deploy on Render

1. Push this repo to GitHub, then in Render choose New > Blueprint and select it (`render.yaml` is picked up), or create a Web Service manually: runtime Node, start command `node server/index.js`, health check `/health`.
2. In the service Environment tab set `ANTHROPIC_API_KEY` (it is declared with `sync: false`, so Render asks for it).
3. Confirm `ALLOWED_ORIGINS` contains your site origin (no trailing slash, no path).
4. Use the service URL in the widget: `endpoint="https://<service>.onrender.com/v1/chat"`.

The free plan sleeps when idle; the first request after a pause can be slow.

## Embed

```html
<script src="https://<where-you-host>/chat-widget.js" defer></script>
<orieb-chat endpoint="https://<service>.onrender.com/v1/chat"></orieb-chat>
```

Copy `widget/chat-widget.js` next to your site (or load it as `type="module"`; both work). Attributes: `endpoint` (required), `lang` (`en`/`ar`, otherwise `document.documentElement.lang`), `title`.

Theming: light/dark follows `prefers-color-scheme`. Override with CSS custom properties on the element, for example `orieb-chat { --orieb-accent: #0a7; --orieb-radius: 8px; }`. Available: `--orieb-accent`, `--orieb-accent-fg`, `--orieb-bg`, `--orieb-fg`, `--orieb-muted`, `--orieb-surface`, `--orieb-user-bg`, `--orieb-user-fg`, `--orieb-border`, `--orieb-danger`, `--orieb-radius`, `--orieb-font`, `--orieb-offset-x`, `--orieb-offset-y`, `--orieb-z`.

Behaviour: Enter sends, Shift+Enter adds a newline, Escape closes and returns focus to the launcher, focus is trapped while open, `prefers-reduced-motion` is respected, RTL when the language is Arabic. The conversation lives in memory only (nothing in localStorage).

## Safety notes

- The API key lives only in server environment variables. The widget never sees it.
- The system prompt restricts answers to the profile, forbids invention, and forbids revealing instructions or keys. Prompt injection cannot be ruled out entirely; the profile contains only public information, so there is nothing sensitive to leak.
- Model text is rendered with `textContent`/text nodes only. Only valid `https:` URLs become links (`rel="noopener noreferrer nofollow"`).
- CORS allow-list; requests from other browser origins get 403 and no CORS headers.
- Message content is never logged; only `METHOD path status time`.
- The profile has no email or phone number by design.

## Limits

- Body 8 KB, at most 12 messages, at most 1500 characters per message, control characters stripped.
- 20 requests per IP per 10 minutes (in memory; resets on restart and is per instance).
- `max_tokens` 600 per answer; upstream timeout 30 s.
- The offline matcher is keyword based and answers only what `faq` entries cover.

MIT licensed.
